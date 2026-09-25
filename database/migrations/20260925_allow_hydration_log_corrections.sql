BEGIN;

DROP POLICY IF EXISTS hydration_logs_update_self ON public.hydration_logs;
DROP POLICY IF EXISTS hydration_logs_update_accessible ON public.hydration_logs;
CREATE POLICY hydration_logs_update_accessible
ON public.hydration_logs FOR UPDATE TO authenticated
USING (public.can_access_student(student_id))
WITH CHECK (public.can_access_student(student_id));

DROP POLICY IF EXISTS hydration_logs_delete_self ON public.hydration_logs;
DROP POLICY IF EXISTS hydration_logs_delete_accessible ON public.hydration_logs;
CREATE POLICY hydration_logs_delete_accessible
ON public.hydration_logs FOR DELETE TO authenticated
USING (public.can_access_student(student_id));

CREATE OR REPLACE FUNCTION public.stamp_hydration_log_recorder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid;
  actor_name text;
  actor_role public.user_role;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'Hydration logs cannot be transferred to another student' USING ERRCODE = '42501';
    END IF;
    IF NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
      OR NEW.recorded_by_name IS DISTINCT FROM OLD.recorded_by_name
      OR NEW.recorded_by_role IS DISTINCT FROM OLD.recorded_by_role THEN
      RAISE EXCEPTION 'Hydration log recorder attribution is immutable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  actor_id := auth.uid();
  IF actor_id IS NULL THEN
    IF NEW.recorded_by IS NULL OR NEW.recorded_by_name IS NULL OR NEW.recorded_by_role IS NULL THEN
      RAISE EXCEPTION 'Hydration log recorder attribution is required' USING ERRCODE = '23502';
    END IF;
    RETURN NEW;
  END IF;

  SELECT profile.id,
         coalesce(nullif(trim(profile.full_name), ''), profile.username, 'Pengguna'),
         profile.role
  INTO actor_id, actor_name, actor_role
  FROM public.profiles profile
  WHERE profile.id = actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hydration log recorder profile was not found' USING ERRCODE = '42501';
  END IF;

  NEW.recorded_by := actor_id;
  NEW.recorded_by_name := actor_name;
  NEW.recorded_by_role := actor_role;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.hydration_logs'::regclass
      AND conname = 'hydration_logs_amount_positive'
  ) THEN
    ALTER TABLE public.hydration_logs
      ADD CONSTRAINT hydration_logs_amount_positive CHECK (amount_ml > 0) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.hydration_logs VALIDATE CONSTRAINT hydration_logs_amount_positive;

COMMIT;
NOTIFY pgrst, 'reload schema';
