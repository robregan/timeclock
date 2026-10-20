-- ShiftClock: prevent overlapping shifts for the same employee.
-- DEVELOPMENT FIRST. Do not apply to production until separately reviewed and tested.
-- This migration adds constraints; it does not change existing shift timestamps.
-- Excludes legacy rows with NULL employee_id (they need separate reconciliation).

-- Required for equality comparisons on UUIDs inside GiST exclusion constraints.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Find operator classes even when btree_gist lives in the extensions schema.
SET search_path TO public, extensions;

-- Refuse to continue if existing records would violate the constraints.
-- No existing records are automatically modified or deleted.
DO $preflight$
DECLARE
  invalid_duration_count bigint;
  overlap_pair_count bigint;
BEGIN
  SELECT count(*) INTO invalid_duration_count
  FROM public.time_entries
  WHERE clock_out IS NOT NULL AND clock_out <= clock_in;

  IF invalid_duration_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add shift constraints: % shifts have clock_out <= clock_in',
      invalid_duration_count;
  END IF;

  SELECT count(*) INTO overlap_pair_count
  FROM public.time_entries a
  JOIN public.time_entries b
    ON a.employee_id = b.employee_id
   AND a.id < b.id
  WHERE a.employee_id IS NOT NULL
    AND tstzrange(
      a.clock_in, coalesce(a.clock_out, 'infinity'::timestamptz), '[)'
    ) && tstzrange(
      b.clock_in, coalesce(b.clock_out, 'infinity'::timestamptz), '[)'
    );

  IF overlap_pair_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add shift constraints: % pairs of existing shifts overlap',
      overlap_pair_count;
  END IF;
END;
$preflight$;

-- Every completed shift must end later than it starts.
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_positive_duration
  CHECK (clock_out IS NULL OR clock_out > clock_in);

-- Protect both completed shifts and currently open shifts. Adjacent shifts
-- (one ends exactly when the next starts) are allowed via '[)' bounds.
-- Existing "one_open_shift_per_employee" unique index remains in place.
ALTER TABLE public.time_entries
  ADD CONSTRAINT no_overlapping_employee_shifts
  EXCLUDE USING gist (
    employee_id WITH =,
    tstzrange(
      clock_in, coalesce(clock_out, 'infinity'::timestamptz), '[)'
    ) WITH &&
  )
  WHERE (employee_id IS NOT NULL);

RESET search_path;
