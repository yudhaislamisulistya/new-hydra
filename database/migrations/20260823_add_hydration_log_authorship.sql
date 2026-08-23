BEGIN;

ALTER TABLE public.hydration_logs
  ADD COLUMN IF NOT EXISTS recorded_by uuid,
  ADD COLUMN IF NOT EXISTS recorded_by_name text,
  ADD COLUMN IF NOT EXISTS recorded_by_role public.user_role;

ALTER TABLE public.hydration_logs
  DROP CONSTRAINT IF EXISTS hydration_logs_recorded_by_fkey;

UPDATE public.hydration_logs hydration
SET recorded_by = coalesce(hydration.recorded_by, hydration.student_id),
    recorded_by_name = coalesce(
      hydration.recorded_by_name,
      nullif(trim(profile.full_name), ''),
      profile.username,
      'Siswa'
    ),
    recorded_by_role = coalesce(hydration.recorded_by_role, 'student'::public.user_role)
FROM public.profiles profile
WHERE profile.id = hydration.student_id
  AND (
    hydration.recorded_by IS NULL
    OR hydration.recorded_by_name IS NULL
    OR hydration.recorded_by_role IS NULL
  );

UPDATE public.hydration_logs
SET recorded_by_name = coalesce(recorded_by_name, 'Siswa'),
    recorded_by_role = coalesce(recorded_by_role, 'student'::public.user_role)
WHERE recorded_by_name IS NULL OR recorded_by_role IS NULL;

ALTER TABLE public.hydration_logs
  ALTER COLUMN recorded_by SET NOT NULL,
  ALTER COLUMN recorded_by_name SET DEFAULT 'Siswa',
  ALTER COLUMN recorded_by_name SET NOT NULL,
  ALTER COLUMN recorded_by_role SET DEFAULT 'student'::public.user_role,
  ALTER COLUMN recorded_by_role SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.hydration_logs
    WHERE recorded_by IS NULL OR recorded_by_name IS NULL OR recorded_by_role IS NULL
  ) THEN
    RAISE EXCEPTION 'Hydration log recorder migration left incomplete attribution';
  END IF;
END
$$;

COMMENT ON COLUMN public.hydration_logs.recorded_by IS 'Recorder profile-ID snapshot retained even if that account is later deleted.';
COMMENT ON COLUMN public.hydration_logs.recorded_by_name IS 'Recorder display-name snapshot retained for audit history.';
COMMENT ON COLUMN public.hydration_logs.recorded_by_role IS 'Recorder role snapshot retained for audit history.';

COMMIT;
NOTIFY pgrst, 'reload schema';
