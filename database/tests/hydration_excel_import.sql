-- Run as postgres. All test accounts and imported rows are rolled back.
-- docker exec -i hydra_postgres_db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/tests/hydration_excel_import.sql
BEGIN;
CREATE TEMP TABLE excel_actors (kind text, id uuid DEFAULT gen_random_uuid());
INSERT INTO excel_actors (kind) VALUES ('student'), ('other_student'), ('parent'), ('teacher'), ('admin');
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT id, id::text || '@excel-import-test.invalid',
  jsonb_build_object('role', CASE WHEN kind IN ('parent', 'teacher') THEN kind ELSE 'student' END, 'username', id::text, 'full_name', 'Excel import test')
FROM excel_actors;
DELETE FROM public.profiles WHERE id = (SELECT id FROM excel_actors WHERE kind = 'admin');
INSERT INTO public.profiles (id, role, username, full_name)
SELECT id, 'admin', id::text, 'Excel import admin' FROM excel_actors WHERE kind = 'admin';
INSERT INTO public.student_profiles (id) SELECT id FROM excel_actors WHERE kind IN ('student', 'other_student');
INSERT INTO public.parent_children (parent_id, child_id)
SELECT id, (SELECT id FROM excel_actors WHERE kind = 'student') FROM excel_actors WHERE kind = 'parent';
INSERT INTO public.teacher_profiles (id) SELECT id FROM excel_actors WHERE kind = 'teacher';
INSERT INTO public.teacher_students (teacher_id, student_id)
SELECT id, (SELECT id FROM excel_actors WHERE kind = 'student') FROM excel_actors WHERE kind = 'teacher';
GRANT SELECT ON excel_actors TO authenticated;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  actor record;
  child uuid := (SELECT id FROM excel_actors WHERE kind = 'student');
  other_child uuid := (SELECT id FROM excel_actors WHERE kind = 'other_student');
  parent uuid := (SELECT id FROM excel_actors WHERE kind = 'parent');
  first_id uuid;
  second_id uuid;
  denied_id uuid;
  affected integer;
BEGIN
  FOR actor IN SELECT * FROM excel_actors WHERE kind <> 'other_student' LOOP
    first_id := gen_random_uuid();
    second_id := gen_random_uuid();
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor.id, 'role', 'authenticated')::text, true);
    WITH inserted AS (
      INSERT INTO public.hydration_logs (id, student_id, amount_ml, drink_type, logged_at) VALUES
      (first_id, child, 250, 'Air putih/air matang', '2026-10-12 08:00:00+07'),
      (second_id, child, 125, 'Air kelapa', '2026-10-12 16:00:00+07')
      ON CONFLICT (id) DO NOTHING RETURNING id
    ) SELECT count(*) INTO affected FROM inserted;
    IF affected <> 2 THEN RAISE EXCEPTION 'Bulk import failed for %', actor.kind; END IF;
    IF (SELECT sum(amount_ml) FROM public.hydration_logs WHERE id IN (first_id, second_id)) <> 375
      OR EXISTS (SELECT 1 FROM public.hydration_logs WHERE id IN (first_id, second_id) AND recorded_by <> actor.id) THEN
      RAISE EXCEPTION 'Total or attribution mismatch for %', actor.kind;
    END IF;

    -- Retrying the same rows from another authorized account must not duplicate
    -- the intake or replace the original recorder.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', parent, 'role', 'authenticated')::text, true);
    WITH inserted AS (
      INSERT INTO public.hydration_logs (id, student_id, amount_ml, drink_type, logged_at) VALUES
      (first_id, child, 250, 'Air putih/air matang', '2026-10-12 08:00:00+07'),
      (second_id, child, 125, 'Air kelapa', '2026-10-12 16:00:00+07')
      ON CONFLICT (id) DO NOTHING RETURNING id
    ) SELECT count(*) INTO affected FROM inserted;
    IF affected <> 0 OR EXISTS (SELECT 1 FROM public.hydration_logs WHERE id IN (first_id, second_id) AND recorded_by <> actor.id) THEN
      RAISE EXCEPTION 'Retry duplicated or changed attribution';
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor.id, 'role', 'authenticated')::text, true);
    IF actor.kind <> 'admin' THEN
      denied_id := gen_random_uuid();
      BEGIN
        INSERT INTO public.hydration_logs (id, student_id, amount_ml) VALUES
        (denied_id, child, 100), (gen_random_uuid(), other_child, 100)
        ON CONFLICT (id) DO NOTHING;
        RAISE EXCEPTION 'Unauthorized batch accepted';
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      IF EXISTS (SELECT 1 FROM public.hydration_logs WHERE id = denied_id) THEN
        RAISE EXCEPTION 'Failed batch partially committed';
      END IF;
    END IF;
    DELETE FROM public.hydration_logs WHERE id IN (first_id, second_id);
    RAISE NOTICE 'PASS: % bulk import, total, attribution, duplicate retry and atomic access checks', actor.kind;
  END LOOP;
END;
$$;
ROLLBACK;
