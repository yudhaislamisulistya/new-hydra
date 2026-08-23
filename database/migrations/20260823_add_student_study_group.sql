BEGIN;

ALTER TABLE public.student_profiles
ADD COLUMN IF NOT EXISTS study_group text;

UPDATE public.student_profiles
SET study_group = 'intervention'
WHERE study_group IS NULL;

ALTER TABLE public.student_profiles
  ALTER COLUMN study_group SET DEFAULT 'intervention',
  ALTER COLUMN study_group SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.student_profiles'::regclass
      AND conname = 'student_profiles_study_group_chk'
  ) THEN
    ALTER TABLE public.student_profiles
      ADD CONSTRAINT student_profiles_study_group_chk
      CHECK (study_group IN ('control', 'intervention'));
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.student_profiles
    WHERE study_group NOT IN ('control', 'intervention')
  ) THEN
    RAISE EXCEPTION 'Invalid student study group found after migration';
  END IF;
END
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
