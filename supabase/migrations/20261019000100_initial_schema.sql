SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


-- ShiftClock initial baseline from Hapgood production schema (schema only).
-- Intentionally excludes employee rows, PIN hashes, time entries and payroll data.
-- Apply ONLY to a new, empty ShiftClock development Supabase project.
-- This migration prevents accidental reapplication over a populated app database.

DO $migration_guard$
BEGIN
  IF to_regclass('public.employees') IS NOT NULL
     OR to_regclass('public.time_entries') IS NOT NULL
     OR to_regclass('public.shift_correction_requests') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Refusing to apply ShiftClock initial schema: application tables already exist';
  END IF;
END
$migration_guard$;

-- The application uses extensions.crypt() to verify salted employee PIN hashes.
CREATE SCHEMA IF NOT EXISTS "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

DO $pgcrypto_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'pgcrypto' AND n.nspname = 'extensions'
  ) THEN
    RAISE EXCEPTION 'pgcrypto must be installed in the extensions schema for ShiftClock PIN verification';
  END IF;
END
$pgcrypto_check$;

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."audit_time_entries_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.time_entry_audit_log (
      time_entry_id,
      action,
      employee_id,
      employee_name,
      new_clock_in,
      new_clock_out,
      new_created_at,
      new_edited_at,
      new_edited_by,
      new_edit_reason
    ) values (
      new.id,
      'INSERT',
      new.employee_id,
      new.employee_name,
      new.clock_in,
      new.clock_out,
      new.created_at,
      new.edited_at,
      new.edited_by,
      new.edit_reason
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    insert into public.time_entry_audit_log (
      time_entry_id,
      action,
      employee_id,
      employee_name,
      old_clock_in,
      old_clock_out,
      old_created_at,
      old_edited_at,
      old_edited_by,
      old_edit_reason,
      new_clock_in,
      new_clock_out,
      new_created_at,
      new_edited_at,
      new_edited_by,
      new_edit_reason
    ) values (
      new.id,
      'UPDATE',
      new.employee_id,
      new.employee_name,
      old.clock_in,
      old.clock_out,
      old.created_at,
      old.edited_at,
      old.edited_by,
      old.edit_reason,
      new.clock_in,
      new.clock_out,
      new.created_at,
      new.edited_at,
      new.edited_by,
      new.edit_reason
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.time_entry_audit_log (
      time_entry_id,
      action,
      employee_id,
      employee_name,
      old_clock_in,
      old_clock_out,
      old_created_at,
      old_edited_at,
      old_edited_by,
      old_edit_reason
    ) values (
      old.id,
      'DELETE',
      old.employee_id,
      old.employee_name,
      old.clock_in,
      old.clock_out,
      old.created_at,
      old.edited_at,
      old.edited_by,
      old.edit_reason
    );

    return old;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."audit_time_entries_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clock_in_employee"("p_employee_id" "uuid", "p_pin" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_employee_name text;
  v_can_clock boolean;
  v_entry_id uuid;
begin
  select
    name,
    can_clock
  into
    v_employee_name,
    v_can_clock
  from public.employees
  where id = p_employee_id
    and active = true
    and pin_hash = extensions.crypt(
      p_pin,
      pin_hash
    );

  if v_employee_name is null then
    raise exception 'Invalid employee or PIN';
  end if;

  if v_can_clock is not true then
    raise exception 'This account cannot clock in';
  end if;

  if exists (
    select 1
    from public.time_entries
    where employee_id = p_employee_id
      and clock_out is null
  ) then
    raise exception 'Employee is already clocked in';
  end if;

  insert into public.time_entries (
    employee_id,
    employee_name
  )
  values (
    p_employee_id,
    v_employee_name
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."clock_in_employee"("p_employee_id" "uuid", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clock_out_employee"("p_employee_id" "uuid", "p_pin" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_can_clock boolean;
  v_entry_id uuid;
begin
  select can_clock
  into v_can_clock
  from public.employees
  where id = p_employee_id
    and active = true
    and pin_hash = extensions.crypt(
      p_pin,
      pin_hash
    );

  if v_can_clock is null then
    raise exception 'Invalid employee or PIN';
  end if;

  if v_can_clock is not true then
    raise exception 'This account cannot clock out';
  end if;

  update public.time_entries
  set clock_out = now()
  where id = (
    select id
    from public.time_entries
    where employee_id = p_employee_id
      and clock_out is null
    order by clock_in desc
    limit 1
  )
  returning id into v_entry_id;

  if v_entry_id is null then
    raise exception 'Employee is not currently clocked in';
  end if;

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."clock_out_employee"("p_employee_id" "uuid", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_all_entries"("p_employee_id" "uuid", "p_pin" "text") RETURNS TABLE("id" "uuid", "employee_name" "text", "clock_in" timestamp with time zone, "clock_out" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if not exists (
    select 1
    from public.employees e
    where e.id = p_employee_id
      and e.active = true
      and e.can_clock = true
      and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
  ) then
    raise exception 'Invalid employee or PIN';
  end if;

  return query
  select
    te.id,
    te.employee_name,
    te.clock_in,
    te.clock_out,
    te.created_at
  from public.time_entries te
  where te.employee_id = p_employee_id
  order by te.clock_in desc;
end;
$$;


ALTER FUNCTION "public"."get_employee_all_entries"("p_employee_id" "uuid", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_correction_requests"("p_employee_id" "uuid", "p_pin" "text") RETURNS TABLE("id" "uuid", "request_type" "text", "time_entry_id" "uuid", "requested_clock_in" timestamp with time zone, "requested_clock_out" timestamp with time zone, "reason" "text", "status" "text", "manager_note" "text", "created_at" timestamp with time zone, "reviewed_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if not exists (
    select 1
    from public.employees e
    where e.id = p_employee_id
      and e.active = true
      and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
  ) then
    raise exception 'Invalid employee or PIN';
  end if;

  return query
  select
    scr.id,
    scr.request_type,
    scr.time_entry_id,
    scr.requested_clock_in,
    scr.requested_clock_out,
    scr.reason,
    scr.status,
    scr.manager_note,
    scr.created_at,
    scr.reviewed_at
  from public.shift_correction_requests scr
  where scr.employee_id = p_employee_id
  order by scr.created_at desc;
end;
$$;


ALTER FUNCTION "public"."get_employee_correction_requests"("p_employee_id" "uuid", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_entries"("p_employee_id" "uuid", "p_pin" "text") RETURNS TABLE("id" "uuid", "employee_name" "text", "clock_in" timestamp with time zone, "clock_out" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if not public.verify_employee_pin(
    p_employee_id,
    p_pin
  ) then
    raise exception 'Invalid employee or PIN';
  end if;

  return query
  select
    te.id,
    te.employee_name,
    te.clock_in,
    te.clock_out
  from public.time_entries te
  where te.employee_id = p_employee_id
  order by te.clock_in desc
  limit 20;
end;
$$;


ALTER FUNCTION "public"."get_employee_entries"("p_employee_id" "uuid", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_manager_hour_totals"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("employee_id" "uuid", "employee_name" "text", "total_seconds" bigint, "shift_count" bigint, "currently_clocked_in" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if not exists (
    select 1
    from public.employees
    where id = p_manager_id
      and active = true
      and role = 'manager'
      and pin_hash = extensions.crypt(
        p_pin,
        pin_hash
      )
  ) then
    raise exception 'Manager authorization required';
  end if;

  return query
  select
    e.id,
    e.name,

    coalesce(
      sum(
        case
          when te.id is null then 0
          else greatest(
            0,
            extract(
              epoch from (
                least(
                  coalesce(te.clock_out, now()),
                  p_end_date
                )
                -
                greatest(
                  te.clock_in,
                  p_start_date
                )
              )
            )
          )
        end
      ),
      0
    )::bigint as total_seconds,

    count(te.id)::bigint as shift_count,

    coalesce(
      bool_or(
        te.id is not null
        and te.clock_out is null
        and te.clock_in < p_end_date
      ),
      false
    ) as currently_clocked_in

  from public.employees e

  left join public.time_entries te
    on te.employee_id = e.id
    and te.clock_in < p_end_date
    and coalesce(te.clock_out, now()) > p_start_date

  where e.active = true
    and e.can_clock = true

  group by e.id, e.name
  order by e.name;
end;
$$;


ALTER FUNCTION "public"."get_manager_hour_totals"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_manager_shift_details"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("employee_id" "uuid", "employee_name" "text", "entry_id" "uuid", "clock_in" timestamp with time zone, "clock_out" timestamp with time zone, "total_seconds" numeric, "edited_at" timestamp with time zone, "edit_reason" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if p_end_date <= p_start_date then
    raise exception 'End date must be after start date';
  end if;

  if not exists (
    select 1
    from public.employees e
    where e.id = p_manager_id
      and e.active = true
      and e.role = 'manager'
      and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
  ) then
    raise exception 'Invalid manager or PIN';
  end if;

  return query
  select
    e.id as employee_id,
    e.name as employee_name,
    te.id as entry_id,
    te.clock_in,
    te.clock_out,
    greatest(
      0,
      extract(
        epoch from (
          least(coalesce(te.clock_out, now()), p_end_date)
          - greatest(te.clock_in, p_start_date)
        )
      )
    ) as total_seconds,
    te.edited_at,
    te.edit_reason
  from public.time_entries te
  join public.employees e on e.id = te.employee_id
  where e.active = true
    and e.can_clock = true
    and te.clock_in < p_end_date
    and coalesce(te.clock_out, now()) > p_start_date
  order by e.name asc, te.clock_in asc;
end;
$$;


ALTER FUNCTION "public"."get_manager_shift_details"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pending_correction_requests"("p_manager_id" "uuid", "p_pin" "text") RETURNS TABLE("request_id" "uuid", "request_type" "text", "time_entry_id" "uuid", "employee_id" "uuid", "employee_name" "text", "original_clock_in" timestamp with time zone, "original_clock_out" timestamp with time zone, "requested_clock_in" timestamp with time zone, "requested_clock_out" timestamp with time zone, "reason" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if not exists (
    select 1
    from public.employees e
    where e.id = p_manager_id
      and e.active = true
      and e.role = 'manager'
      and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
  ) then
    raise exception 'Invalid manager or PIN';
  end if;

  return query
  select
    scr.id as request_id,
    scr.request_type,
    scr.time_entry_id,
    scr.employee_id,
    e.name as employee_name,
    te.clock_in as original_clock_in,
    te.clock_out as original_clock_out,
    scr.requested_clock_in,
    scr.requested_clock_out,
    scr.reason,
    scr.created_at
  from public.shift_correction_requests scr
  join public.employees e on e.id = scr.employee_id
  left join public.time_entries te on te.id = scr.time_entry_id
  where scr.status = 'pending'
  order by scr.created_at asc;
end;
$$;


ALTER FUNCTION "public"."get_pending_correction_requests"("p_manager_id" "uuid", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_active_employees"() RETURNS TABLE("id" "uuid", "name" "text", "role" "text", "can_clock" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    employees.id,
    employees.name,
    employees.role,
    employees.can_clock
  from public.employees
  where employees.active = true
  order by employees.name;
$$;


ALTER FUNCTION "public"."list_active_employees"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_active_managers"() RETURNS TABLE("id" "uuid", "name" "text", "role" "text", "can_clock" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    employees.id,
    employees.name,
    employees.role,
    employees.can_clock
  from public.employees
  where employees.active = true
    and employees.role = 'manager'
  order by employees.name;
$$;


ALTER FUNCTION "public"."list_active_managers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_clockable_employees"() RETURNS TABLE("id" "uuid", "name" "text", "role" "text", "can_clock" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    employees.id,
    employees.name,
    employees.role,
    employees.can_clock
  from public.employees
  where employees.active = true
    and employees.can_clock = true
  order by employees.name;
$$;


ALTER FUNCTION "public"."list_clockable_employees"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manager_approve_edited_request"("p_manager_id" "uuid", "p_manager_pin" "text", "p_request_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_request public.shift_correction_requests%rowtype;
  v_reason text;
begin
  v_reason := nullif(btrim(coalesce(p_edit_reason, '')), '');

  if not exists (
    select 1 from public.employees e
    where e.id = p_manager_id
      and e.active = true
      and e.role = 'manager'
      and e.pin_hash = extensions.crypt(p_manager_pin, e.pin_hash)
  ) then
    raise exception 'Invalid manager credentials';
  end if;

  if p_clock_in is null or p_clock_out is null or p_clock_out <= p_clock_in then
    raise exception 'Clock-out must be after clock-in';
  end if;

  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'Manager reason must contain at least 3 characters';
  end if;

  select scr.* into v_request
  from public.shift_correction_requests scr
  where scr.id = p_request_id and scr.status = 'pending'
  for update;

  if not found then
    raise exception 'Pending request not found';
  end if;

  if v_request.request_type not in ('correction', 'missing_shift') then
    raise exception 'Unsupported request type';
  end if;

  if v_request.request_type = 'correction' and not exists (
    select 1 from public.time_entries te
    where te.id = v_request.time_entry_id
      and te.employee_id = v_request.employee_id
  ) then
    raise exception 'Original time entry was not found for this correction';
  end if;

  -- Treat open shifts as running to infinity. Exclude the shift being corrected.
  if exists (
    select 1 from public.time_entries te
    where te.employee_id = v_request.employee_id
      and (v_request.request_type <> 'correction' or te.id <> v_request.time_entry_id)
      and tstzrange(te.clock_in, coalesce(te.clock_out, 'infinity'::timestamptz), '[)')
          && tstzrange(p_clock_in, p_clock_out, '[)')
  ) then
    raise exception 'These edited hours overlap an existing shift';
  end if;

  insert into public.shift_request_edit_log (
    request_id,
    employee_id,
    manager_id,
    original_requested_clock_in,
    original_requested_clock_out,
    approved_clock_in,
    approved_clock_out,
    manager_reason
  ) values (
    v_request.id,
    v_request.employee_id,
    p_manager_id,
    v_request.requested_clock_in,
    v_request.requested_clock_out,
    p_clock_in,
    p_clock_out,
    v_reason
  );

  update public.shift_correction_requests
  set requested_clock_in = p_clock_in,
      requested_clock_out = p_clock_out
  where id = v_request.id;

  -- Reuse the existing, validated approval workflow. Any exception rolls back.
  perform public.review_shift_correction(
    p_manager_id,
    p_manager_pin,
    p_request_id,
    'approved',
    'Edited & approved by manager: ' || v_reason
  );
end;
$$;


ALTER FUNCTION "public"."manager_approve_edited_request"("p_manager_id" "uuid", "p_manager_pin" "text", "p_request_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manager_create_manual_shift"("p_manager_id" "uuid", "p_manager_pin" "text", "p_employee_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") RETURNS TABLE("id" "uuid", "employee_id" "uuid", "employee_name" "text", "clock_in" timestamp with time zone, "clock_out" timestamp with time zone, "hours_worked" numeric, "edited_at" timestamp with time zone, "edit_reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_employee_name text;
  v_new_entry public.time_entries%rowtype;
  v_reason text;
begin
  v_reason := nullif(trim(coalesce(p_edit_reason, '')), '');

  if not exists (
    select 1
    from public.employees manager
    where manager.id = p_manager_id
      and manager.active = true
      and manager.role = 'manager'
      and manager.pin_hash = extensions.crypt(p_manager_pin, manager.pin_hash)
  ) then
    raise exception 'Invalid manager credentials';
  end if;

  select employee.name
  into v_employee_name
  from public.employees employee
  where employee.id = p_employee_id
    and employee.active = true
    and employee.can_clock = true;

  if v_employee_name is null then
    raise exception 'Employee not found or not clockable';
  end if;

  if p_clock_in is null or p_clock_out is null then
    raise exception 'Clock-in and clock-out are required';
  end if;

  if p_clock_out <= p_clock_in then
    raise exception 'Clock-out time must be after clock-in time';
  end if;

  if v_reason is null then
    raise exception 'Edit reason is required';
  end if;

  if exists (
    select 1
    from public.time_entries existing
    where existing.employee_id = p_employee_id
      and tstzrange(
        existing.clock_in,
        coalesce(existing.clock_out, 'infinity'::timestamptz),
        '[)'
      ) && tstzrange(p_clock_in, p_clock_out, '[)')
  ) then
    raise exception 'This manual shift overlaps an existing shift';
  end if;

  insert into public.time_entries (
    employee_id,
    employee_name,
    clock_in,
    clock_out,
    edited_at,
    edited_by,
    edit_reason
  )
  values (
    p_employee_id,
    v_employee_name,
    p_clock_in,
    p_clock_out,
    now(),
    p_manager_id,
    v_reason
  )
  returning *
  into v_new_entry;

  return query
  select
    v_new_entry.id,
    v_new_entry.employee_id,
    v_new_entry.employee_name,
    v_new_entry.clock_in,
    v_new_entry.clock_out,
    extract(epoch from (v_new_entry.clock_out - v_new_entry.clock_in)) / 3600,
    v_new_entry.edited_at,
    v_new_entry.edit_reason;
end;
$$;


ALTER FUNCTION "public"."manager_create_manual_shift"("p_manager_id" "uuid", "p_manager_pin" "text", "p_employee_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manager_update_time_entry"("p_manager_id" "uuid", "p_manager_pin" "text", "p_time_entry_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") RETURNS TABLE("id" "uuid", "employee_id" "uuid", "employee_name" "text", "clock_in" timestamp with time zone, "clock_out" timestamp with time zone, "hours_worked" numeric, "edited_at" timestamp with time zone, "edit_reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_existing_entry public.time_entries%rowtype;
  v_updated_entry public.time_entries%rowtype;
  v_employee_id uuid;
  v_reason text;
begin
  v_reason := nullif(trim(coalesce(p_edit_reason, '')), '');

  if not exists (
    select 1
    from public.employees manager
    where manager.id = p_manager_id
      and manager.active = true
      and manager.role = 'manager'
      and manager.pin_hash = extensions.crypt(p_manager_pin, manager.pin_hash)
  ) then
    raise exception 'Invalid manager credentials';
  end if;

  select *
  into v_existing_entry
  from public.time_entries entry
  where entry.id = p_time_entry_id
  for update;

  if not found then
    raise exception 'Time entry not found';
  end if;

  v_employee_id := v_existing_entry.employee_id;

  if v_employee_id is null then
    select employee.id
    into v_employee_id
    from public.employees employee
    where employee.name = v_existing_entry.employee_name
    limit 1;
  end if;

  if v_employee_id is null then
    raise exception 'Could not find employee for this time entry';
  end if;

  if p_clock_in is null or p_clock_out is null then
    raise exception 'Clock-in and clock-out are required';
  end if;

  if p_clock_out <= p_clock_in then
    raise exception 'Clock-out time must be after clock-in time';
  end if;

  if v_reason is null then
    raise exception 'Edit reason is required';
  end if;

  if exists (
    select 1
    from public.time_entries existing
    where existing.employee_id = v_employee_id
      and existing.id <> p_time_entry_id
      and tstzrange(
        existing.clock_in,
        coalesce(existing.clock_out, 'infinity'::timestamptz),
        '[)'
      ) && tstzrange(p_clock_in, p_clock_out, '[)')
  ) then
    raise exception 'This edited shift overlaps an existing shift';
  end if;

  update public.time_entries
  set
    employee_id = v_employee_id,
    clock_in = p_clock_in,
    clock_out = p_clock_out,
    edited_at = now(),
    edited_by = p_manager_id,
    edit_reason = v_reason
  where time_entries.id = p_time_entry_id
  returning *
  into v_updated_entry;

  return query
  select
    v_updated_entry.id,
    v_updated_entry.employee_id,
    v_updated_entry.employee_name,
    v_updated_entry.clock_in,
    v_updated_entry.clock_out,
    extract(epoch from (v_updated_entry.clock_out - v_updated_entry.clock_in)) / 3600,
    v_updated_entry.edited_at,
    v_updated_entry.edit_reason;
end;
$$;


ALTER FUNCTION "public"."manager_update_time_entry"("p_manager_id" "uuid", "p_manager_pin" "text", "p_time_entry_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_shift_correction"("p_manager_id" "uuid", "p_pin" "text", "p_request_id" "uuid", "p_decision" "text", "p_manager_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_request public.shift_correction_requests%rowtype;
  v_employee_name text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  if not exists (
    select 1
    from public.employees e
    where e.id = p_manager_id
      and e.active = true
      and e.role = 'manager'
      and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
  ) then
    raise exception 'Invalid manager or PIN';
  end if;

  select *
  into v_request
  from public.shift_correction_requests scr
  where scr.id = p_request_id
    and scr.status = 'pending'
  for update;

  if not found then
    raise exception 'Pending request not found';
  end if;

  update public.shift_correction_requests
  set
    status = p_decision,
    reviewed_by = p_manager_id,
    reviewed_at = now(),
    manager_note = p_manager_note
  where id = p_request_id;

  if p_decision = 'approved' then
    if v_request.request_type = 'correction' then
      update public.time_entries
      set
        clock_in = v_request.requested_clock_in,
        clock_out = v_request.requested_clock_out,
        edited_at = now(),
        edited_by = p_manager_id,
        edit_reason = concat('Approved correction request: ', v_request.reason)
      where id = v_request.time_entry_id;
    elsif v_request.request_type = 'missing_shift' then
      select e.name
      into v_employee_name
      from public.employees e
      where e.id = v_request.employee_id;

      insert into public.time_entries (
        employee_id,
        employee_name,
        clock_in,
        clock_out,
        edited_at,
        edited_by,
        edit_reason
      ) values (
        v_request.employee_id,
        v_employee_name,
        v_request.requested_clock_in,
        v_request.requested_clock_out,
        now(),
        p_manager_id,
        concat('Approved missed shift request: ', v_request.reason)
      );
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."review_shift_correction"("p_manager_id" "uuid", "p_pin" "text", "p_request_id" "uuid", "p_decision" "text", "p_manager_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_missed_shift_request"("p_employee_id" "uuid", "p_pin" "text", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if not exists (
    select 1
    from public.employees e
    where e.id = p_employee_id
      and e.active = true
      and e.can_clock = true
      and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
  ) then
    raise exception 'Invalid employee or PIN';
  end if;

  if p_requested_clock_out <= p_requested_clock_in then
    raise exception 'Clock-out must be after clock-in';
  end if;

  if exists (
    select 1
    from public.time_entries te
    where te.employee_id = p_employee_id
      and te.clock_out is not null
      and tstzrange(te.clock_in, te.clock_out, '[)')
          && tstzrange(p_requested_clock_in, p_requested_clock_out, '[)')
  ) then
    raise exception 'This missed shift overlaps an existing shift';
  end if;

  if exists (
    select 1
    from public.shift_correction_requests scr
    where scr.employee_id = p_employee_id
      and scr.status = 'pending'
      and tstzrange(scr.requested_clock_in, scr.requested_clock_out, '[)')
          && tstzrange(p_requested_clock_in, p_requested_clock_out, '[)')
  ) then
    raise exception 'A pending request already overlaps this time';
  end if;

  insert into public.shift_correction_requests (
    request_type,
    time_entry_id,
    employee_id,
    requested_clock_in,
    requested_clock_out,
    reason
  ) values (
    'missing_shift',
    null,
    p_employee_id,
    p_requested_clock_in,
    p_requested_clock_out,
    p_reason
  );
end;
$$;


ALTER FUNCTION "public"."submit_missed_shift_request"("p_employee_id" "uuid", "p_pin" "text", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_shift_correction"("p_employee_id" "uuid", "p_pin" "text", "p_time_entry_id" "uuid", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if not exists (
    select 1
    from public.employees e
    where e.id = p_employee_id
      and e.active = true
      and e.can_clock = true
      and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
  ) then
    raise exception 'Invalid employee or PIN';
  end if;

  if p_requested_clock_out <= p_requested_clock_in then
    raise exception 'Clock-out must be after clock-in';
  end if;

  if not exists (
    select 1
    from public.time_entries te
    where te.id = p_time_entry_id
      and te.employee_id = p_employee_id
      and te.clock_out is not null
  ) then
    raise exception 'Shift not found or still active';
  end if;

  if exists (
    select 1
    from public.time_entries te
    where te.employee_id = p_employee_id
      and te.id <> p_time_entry_id
      and te.clock_out is not null
      and tstzrange(te.clock_in, te.clock_out, '[)')
          && tstzrange(p_requested_clock_in, p_requested_clock_out, '[)')
  ) then
    raise exception 'This correction overlaps another existing shift';
  end if;

  if exists (
    select 1
    from public.shift_correction_requests scr
    where scr.time_entry_id = p_time_entry_id
      and scr.status = 'pending'
      and scr.request_type = 'correction'
  ) then
    raise exception 'A correction request is already pending for this shift';
  end if;

  if exists (
    select 1
    from public.shift_correction_requests scr
    where scr.employee_id = p_employee_id
      and scr.status = 'pending'
      and scr.id is not null
      and tstzrange(scr.requested_clock_in, scr.requested_clock_out, '[)')
          && tstzrange(p_requested_clock_in, p_requested_clock_out, '[)')
  ) then
    raise exception 'A pending request already overlaps this time';
  end if;

  insert into public.shift_correction_requests (
    request_type,
    time_entry_id,
    employee_id,
    requested_clock_in,
    requested_clock_out,
    reason
  ) values (
    'correction',
    p_time_entry_id,
    p_employee_id,
    p_requested_clock_in,
    p_requested_clock_out,
    p_reason
  );
end;
$$;


ALTER FUNCTION "public"."submit_shift_correction"("p_employee_id" "uuid", "p_pin" "text", "p_time_entry_id" "uuid", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_employee_pin"("p_employee_id" "uuid", "p_pin" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select exists (
    select 1
    from public.employees
    where id = p_employee_id
      and active = true
      and pin_hash = extensions.crypt(
        p_pin,
        pin_hash
      )
  );
$$;


ALTER FUNCTION "public"."verify_employee_pin"("p_employee_id" "uuid", "p_pin" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "pin_hash" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'employee'::"text" NOT NULL,
    "can_clock" boolean DEFAULT true NOT NULL,
    CONSTRAINT "employees_role_check" CHECK (("role" = ANY (ARRAY['employee'::"text", 'manager'::"text"])))
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_correction_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "time_entry_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "requested_clock_in" timestamp with time zone,
    "requested_clock_out" timestamp with time zone,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "manager_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_type" "text" DEFAULT 'correction'::"text" NOT NULL,
    CONSTRAINT "shift_correction_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['correction'::"text", 'missing_shift'::"text"]))),
    CONSTRAINT "shift_correction_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "shift_correction_requests_time_entry_by_type_check" CHECK (((("request_type" = 'correction'::"text") AND ("time_entry_id" IS NOT NULL)) OR (("request_type" = 'missing_shift'::"text") AND ("time_entry_id" IS NULL))))
);


ALTER TABLE "public"."shift_correction_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_request_edit_log" (
    "id" bigint NOT NULL,
    "request_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "manager_id" "uuid" NOT NULL,
    "original_requested_clock_in" timestamp with time zone,
    "original_requested_clock_out" timestamp with time zone,
    "approved_clock_in" timestamp with time zone NOT NULL,
    "approved_clock_out" timestamp with time zone NOT NULL,
    "manager_reason" "text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shift_request_edit_log" OWNER TO "postgres";


ALTER TABLE "public"."shift_request_edit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."shift_request_edit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."time_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_name" "text" NOT NULL,
    "clock_in" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clock_out" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "employee_id" "uuid",
    "edited_at" timestamp with time zone,
    "edited_by" "uuid",
    "edit_reason" "text"
);


ALTER TABLE "public"."time_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_entry_audit_log" (
    "id" bigint NOT NULL,
    "time_entry_id" "uuid",
    "action" "text" NOT NULL,
    "employee_id" "uuid",
    "employee_name" "text",
    "old_clock_in" timestamp with time zone,
    "old_clock_out" timestamp with time zone,
    "old_created_at" timestamp with time zone,
    "old_edited_at" timestamp with time zone,
    "old_edited_by" "uuid",
    "old_edit_reason" "text",
    "new_clock_in" timestamp with time zone,
    "new_clock_out" timestamp with time zone,
    "new_created_at" timestamp with time zone,
    "new_edited_at" timestamp with time zone,
    "new_edited_by" "uuid",
    "new_edit_reason" "text",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by_database_user" "text" DEFAULT CURRENT_USER NOT NULL,
    CONSTRAINT "time_entry_audit_log_action_check" CHECK (("action" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text"])))
);


ALTER TABLE "public"."time_entry_audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."time_entry_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."time_entry_audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."time_entry_audit_log_id_seq" OWNED BY "public"."time_entry_audit_log"."id";



ALTER TABLE ONLY "public"."time_entry_audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."time_entry_audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_correction_requests"
    ADD CONSTRAINT "shift_correction_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_request_edit_log"
    ADD CONSTRAINT "shift_request_edit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_entry_audit_log"
    ADD CONSTRAINT "time_entry_audit_log_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "one_open_shift_per_employee" ON "public"."time_entries" USING "btree" ("employee_id") WHERE (("clock_out" IS NULL) AND ("employee_id" IS NOT NULL));



CREATE UNIQUE INDEX "one_pending_request_per_shift" ON "public"."shift_correction_requests" USING "btree" ("time_entry_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "shift_request_edit_log_request_id_idx" ON "public"."shift_request_edit_log" USING "btree" ("request_id", "changed_at" DESC);



CREATE INDEX "time_entries_employee_id_idx" ON "public"."time_entries" USING "btree" ("employee_id");



CREATE OR REPLACE TRIGGER "audit_time_entries_changes_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."time_entries" FOR EACH ROW EXECUTE FUNCTION "public"."audit_time_entries_changes"();



ALTER TABLE ONLY "public"."shift_correction_requests"
    ADD CONSTRAINT "shift_correction_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."shift_correction_requests"
    ADD CONSTRAINT "shift_correction_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."shift_correction_requests"
    ADD CONSTRAINT "shift_correction_requests_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_correction_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_request_edit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_entry_audit_log" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_time_entries_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_time_entries_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_time_entries_changes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clock_in_employee"("p_employee_id" "uuid", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clock_in_employee"("p_employee_id" "uuid", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."clock_in_employee"("p_employee_id" "uuid", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clock_in_employee"("p_employee_id" "uuid", "p_pin" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clock_out_employee"("p_employee_id" "uuid", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clock_out_employee"("p_employee_id" "uuid", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."clock_out_employee"("p_employee_id" "uuid", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clock_out_employee"("p_employee_id" "uuid", "p_pin" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_employee_all_entries"("p_employee_id" "uuid", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_employee_all_entries"("p_employee_id" "uuid", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_employee_all_entries"("p_employee_id" "uuid", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_employee_all_entries"("p_employee_id" "uuid", "p_pin" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_employee_correction_requests"("p_employee_id" "uuid", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_employee_correction_requests"("p_employee_id" "uuid", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_employee_correction_requests"("p_employee_id" "uuid", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_employee_correction_requests"("p_employee_id" "uuid", "p_pin" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_employee_entries"("p_employee_id" "uuid", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_employee_entries"("p_employee_id" "uuid", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_employee_entries"("p_employee_id" "uuid", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_employee_entries"("p_employee_id" "uuid", "p_pin" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_manager_hour_totals"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_manager_hour_totals"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_manager_hour_totals"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_manager_hour_totals"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_manager_shift_details"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_manager_shift_details"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_manager_shift_details"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_manager_shift_details"("p_manager_id" "uuid", "p_pin" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_pending_correction_requests"("p_manager_id" "uuid", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_pending_correction_requests"("p_manager_id" "uuid", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_correction_requests"("p_manager_id" "uuid", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_correction_requests"("p_manager_id" "uuid", "p_pin" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_active_employees"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_active_employees"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_active_employees"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_active_employees"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_active_managers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_active_managers"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_active_managers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_active_managers"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_clockable_employees"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_clockable_employees"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_clockable_employees"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_clockable_employees"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."manager_approve_edited_request"("p_manager_id" "uuid", "p_manager_pin" "text", "p_request_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manager_approve_edited_request"("p_manager_id" "uuid", "p_manager_pin" "text", "p_request_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."manager_approve_edited_request"("p_manager_id" "uuid", "p_manager_pin" "text", "p_request_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manager_approve_edited_request"("p_manager_id" "uuid", "p_manager_pin" "text", "p_request_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."manager_create_manual_shift"("p_manager_id" "uuid", "p_manager_pin" "text", "p_employee_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manager_create_manual_shift"("p_manager_id" "uuid", "p_manager_pin" "text", "p_employee_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."manager_create_manual_shift"("p_manager_id" "uuid", "p_manager_pin" "text", "p_employee_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manager_create_manual_shift"("p_manager_id" "uuid", "p_manager_pin" "text", "p_employee_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."manager_update_time_entry"("p_manager_id" "uuid", "p_manager_pin" "text", "p_time_entry_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manager_update_time_entry"("p_manager_id" "uuid", "p_manager_pin" "text", "p_time_entry_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."manager_update_time_entry"("p_manager_id" "uuid", "p_manager_pin" "text", "p_time_entry_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manager_update_time_entry"("p_manager_id" "uuid", "p_manager_pin" "text", "p_time_entry_id" "uuid", "p_clock_in" timestamp with time zone, "p_clock_out" timestamp with time zone, "p_edit_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_shift_correction"("p_manager_id" "uuid", "p_pin" "text", "p_request_id" "uuid", "p_decision" "text", "p_manager_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_shift_correction"("p_manager_id" "uuid", "p_pin" "text", "p_request_id" "uuid", "p_decision" "text", "p_manager_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."review_shift_correction"("p_manager_id" "uuid", "p_pin" "text", "p_request_id" "uuid", "p_decision" "text", "p_manager_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_shift_correction"("p_manager_id" "uuid", "p_pin" "text", "p_request_id" "uuid", "p_decision" "text", "p_manager_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_missed_shift_request"("p_employee_id" "uuid", "p_pin" "text", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_missed_shift_request"("p_employee_id" "uuid", "p_pin" "text", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_missed_shift_request"("p_employee_id" "uuid", "p_pin" "text", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_missed_shift_request"("p_employee_id" "uuid", "p_pin" "text", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_shift_correction"("p_employee_id" "uuid", "p_pin" "text", "p_time_entry_id" "uuid", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_shift_correction"("p_employee_id" "uuid", "p_pin" "text", "p_time_entry_id" "uuid", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_shift_correction"("p_employee_id" "uuid", "p_pin" "text", "p_time_entry_id" "uuid", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_shift_correction"("p_employee_id" "uuid", "p_pin" "text", "p_time_entry_id" "uuid", "p_requested_clock_in" timestamp with time zone, "p_requested_clock_out" timestamp with time zone, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_employee_pin"("p_employee_id" "uuid", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_employee_pin"("p_employee_id" "uuid", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_employee_pin"("p_employee_id" "uuid", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_employee_pin"("p_employee_id" "uuid", "p_pin" "text") TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."shift_correction_requests" TO "service_role";



GRANT ALL ON TABLE "public"."shift_request_edit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shift_request_edit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shift_request_edit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shift_request_edit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."time_entries" TO "service_role";



GRANT ALL ON TABLE "public"."time_entry_audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."time_entry_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."time_entry_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."time_entry_audit_log_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
