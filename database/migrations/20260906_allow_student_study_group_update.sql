BEGIN;

CREATE OR REPLACE FUNCTION public.protect_student_study_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.study_group IS DISTINCT FROM OLD.study_group
    AND NOT public.is_admin()
    AND NOT coalesce(NEW.id = auth.uid() AND public.current_user_role() = 'student', false) THEN
    RAISE EXCEPTION 'Only administrators or the student can change a student study group' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
