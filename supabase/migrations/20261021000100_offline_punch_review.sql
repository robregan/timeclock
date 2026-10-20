-- ShiftClock: provisional offline punch intake and manager-only review.
-- DEVELOPMENT ONLY. Do not run in production until validated and security-reviewed.
-- This migration does not read/change existing time_entries or payroll rows.

CREATE TABLE public.offline_punch_events (
  id uuid PRIMARY KEY, -- stable client-generated ID for retry/deduplication
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  device_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('in','out')),
  occurred_at timestamptz NOT NULL, -- CLIENT CLOCK: unverified until manager review
  received_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid NOT NULL REFERENCES public.employees(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES public.employees(id),
  reviewed_at timestamptz,
  manager_note text,
  linked_time_entry_id uuid REFERENCES public.time_entries(id)
);

CREATE INDEX offline_punch_events_pending_idx
  ON public.offline_punch_events (employee_id, occurred_at)
  WHERE status = 'pending';

ALTER TABLE public.offline_punch_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offline_punch_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.offline_punch_events TO service_role;

-- Manager-authorized ingestion only. No unauthenticated automatic upload.
-- Repeated IDs with matching content are safe: network retries cannot create duplicates.
CREATE OR REPLACE FUNCTION public.submit_offline_punch_for_review(
  p_manager_id uuid, p_manager_pin text, p_event_id uuid,
  p_employee_id uuid, p_event_type text, p_occurred_at timestamptz,
  p_device_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_existing public.offline_punch_events%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_manager_id AND e.active = true AND e.role = 'manager'
      AND e.pin_hash = extensions.crypt(p_manager_pin, e.pin_hash)
  ) THEN
    RAISE EXCEPTION 'Invalid manager credentials';
  END IF;

  -- Check duplicates before age limits: a delayed retry must remain idempotent.
  SELECT * INTO v_existing FROM public.offline_punch_events WHERE id = p_event_id;
  IF FOUND THEN
    IF v_existing.employee_id IS DISTINCT FROM p_employee_id
      OR v_existing.device_id IS DISTINCT FROM p_device_id
      OR v_existing.event_type IS DISTINCT FROM p_event_type
      OR v_existing.occurred_at IS DISTINCT FROM p_occurred_at THEN
      RAISE EXCEPTION 'Offline event ID conflicts with existing data';
    END IF;
    RETURN p_event_id;
  END IF;

  IF p_event_id IS NULL OR p_employee_id IS NULL OR p_device_id IS NULL
     OR p_event_type NOT IN ('in','out') OR p_event_type IS NULL
     OR p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'Incomplete offline punch';
  END IF;
  IF p_occurred_at < now() - interval '30 days'
     OR p_occurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Punch time is outside the accepted range; ask manager to enter the shift manually';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_employee_id AND e.active = true AND e.can_clock = true
  ) THEN
    RAISE EXCEPTION 'Employee not found or inactive';
  END IF;

  INSERT INTO public.offline_punch_events
    (id, employee_id, device_id, event_type, occurred_at, submitted_by)
  VALUES
    (p_event_id, p_employee_id, p_device_id, p_event_type, p_occurred_at, p_manager_id)
  ON CONFLICT (id) DO NOTHING;

  -- Handle concurrent identical/different duplicate submissions safely.
  SELECT * INTO v_existing FROM public.offline_punch_events WHERE id = p_event_id;
  IF v_existing.employee_id IS DISTINCT FROM p_employee_id
    OR v_existing.device_id IS DISTINCT FROM p_device_id
    OR v_existing.event_type IS DISTINCT FROM p_event_type
    OR v_existing.occurred_at IS DISTINCT FROM p_occurred_at THEN
    RAISE EXCEPTION 'Offline event ID conflicts with existing data';
  END IF;
  RETURN p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_offline_punches(
  p_manager_id uuid, p_manager_pin text
) RETURNS TABLE (
  id uuid, employee_id uuid, employee_name text,
  event_type text, occurred_at timestamptz, received_at timestamptz,
  device_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_manager_id AND e.active = true AND e.role = 'manager'
      AND e.pin_hash = extensions.crypt(p_manager_pin, e.pin_hash)
  ) THEN
    RAISE EXCEPTION 'Invalid manager credentials';
  END IF;

  RETURN QUERY
  SELECT op.id, op.employee_id, e.name, op.event_type,
         op.occurred_at, op.received_at, op.device_id
  FROM public.offline_punch_events op
  JOIN public.employees e ON e.id = op.employee_id
  WHERE op.status = 'pending'
  ORDER BY e.name, op.occurred_at, op.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.manager_approve_offline_pair(
  p_manager_id uuid, p_manager_pin text,
  p_clock_in_event_id uuid, p_clock_out_event_id uuid,
  p_manager_note text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_in public.offline_punch_events%ROWTYPE;
  v_out public.offline_punch_events%ROWTYPE;
  v_employee_name text;
  v_entry_id uuid;
  v_note text := nullif(btrim(coalesce(p_manager_note, '')), '');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_manager_id AND e.active = true AND e.role = 'manager'
      AND e.pin_hash = extensions.crypt(p_manager_pin, e.pin_hash)
  ) THEN
    RAISE EXCEPTION 'Invalid manager credentials';
  END IF;
  IF p_clock_in_event_id IS NULL OR p_clock_out_event_id IS NULL
     OR p_clock_in_event_id = p_clock_out_event_id THEN
    RAISE EXCEPTION 'Choose two distinct offline punches';
  END IF;
  IF v_note IS NULL OR char_length(v_note) < 3 THEN
    RAISE EXCEPTION 'A manager approval reason of at least 3 characters is required';
  END IF;

  -- Consistent lock order protects against two managers reviewing the same punch.
  PERFORM op.id FROM public.offline_punch_events op
  WHERE op.id IN (p_clock_in_event_id, p_clock_out_event_id)
  ORDER BY op.id FOR UPDATE;

  SELECT * INTO v_in FROM public.offline_punch_events WHERE id = p_clock_in_event_id;
  SELECT * INTO v_out FROM public.offline_punch_events WHERE id = p_clock_out_event_id;

  IF v_in.id IS NULL OR v_out.id IS NULL
    OR v_in.status <> 'pending' OR v_out.status <> 'pending'
    OR v_in.event_type <> 'in' OR v_out.event_type <> 'out'
    OR v_in.employee_id <> v_out.employee_id THEN
    RAISE EXCEPTION 'Choose a pending clock-in and clock-out for the same employee';
  END IF;
  IF v_out.occurred_at <= v_in.occurred_at
    OR v_out.occurred_at - v_in.occurred_at > interval '24 hours' THEN
    RAISE EXCEPTION 'Offline punches must form a positive shift of at most 24 hours';
  END IF;
  IF v_out.occurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Offline clock-out cannot be in the future';
  END IF;

  SELECT name INTO v_employee_name FROM public.employees WHERE id = v_in.employee_id;
  INSERT INTO public.time_entries
    (employee_id, employee_name, clock_in, clock_out, edited_at, edited_by, edit_reason)
  VALUES
    (v_in.employee_id, v_employee_name, v_in.occurred_at, v_out.occurred_at,
     now(), p_manager_id, 'Manager approved unverified offline punches: ' || v_note)
  RETURNING id INTO v_entry_id;

  UPDATE public.offline_punch_events
  SET status = 'approved', reviewed_by = p_manager_id, reviewed_at = now(),
      manager_note = v_note, linked_time_entry_id = v_entry_id
  WHERE id IN (p_clock_in_event_id, p_clock_out_event_id);

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.manager_reject_offline_punch(
  p_manager_id uuid, p_manager_pin text,
  p_event_id uuid, p_manager_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_note text := nullif(btrim(coalesce(p_manager_note, '')), '');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_manager_id AND e.active = true AND e.role = 'manager'
      AND e.pin_hash = extensions.crypt(p_manager_pin, e.pin_hash)
  ) THEN
    RAISE EXCEPTION 'Invalid manager credentials';
  END IF;
  IF v_note IS NULL OR char_length(v_note) < 3 THEN
    RAISE EXCEPTION 'A manager rejection reason of at least 3 characters is required';
  END IF;
  UPDATE public.offline_punch_events
  SET status = 'rejected', reviewed_by = p_manager_id,
      reviewed_at = now(), manager_note = v_note
  WHERE id = p_event_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending offline punch not found';
  END IF;
END;
$$;

-- Avoid Supabase default grants unintentionally exposing our functions.
REVOKE ALL ON FUNCTION public.submit_offline_punch_for_review(uuid,text,uuid,uuid,text,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_offline_punches(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_approve_offline_pair(uuid,text,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_reject_offline_punch(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_offline_punch_for_review(uuid,text,uuid,uuid,text,timestamptz,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_offline_punches(uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manager_approve_offline_pair(uuid,text,uuid,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manager_reject_offline_punch(uuid,text,uuid,text) TO anon, authenticated;
