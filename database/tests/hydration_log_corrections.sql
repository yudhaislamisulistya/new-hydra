-- Run after the migration as postgres, e.g.:
-- docker exec -i hydra_postgres_db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/tests/hydration_log_corrections.sql
-- All fixture accounts and logs are rolled back, including on failure/disconnect.
BEGIN;

CREATE TEMP TABLE correction_actors (kind text, id uuid DEFAULT gen_random_uuid());
INSERT INTO correction_actors (kind) VALUES ('student'), ('sibling'), ('parent'), ('teacher'), ('admin'), ('outsider');
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT id, id::text || '@hydration-test.invalid',
       jsonb_build_object('role', CASE WHEN kind IN ('parent', 'teacher') THEN kind ELSE 'student' END,
                          'full_name', 'Hydration correction test', 'username', id::text)
FROM correction_actors;

-- The signup trigger intentionally disallows admin signup. Create this test
-- profile as postgres while retaining its fixture auth account.
DELETE FROM public.profiles WHERE id = (SELECT id FROM correction_actors WHERE kind = 'admin');
INSERT INTO public.profiles (id, role, username, full_name)
SELECT id, 'admin', id::text, 'Hydration correction test admin' FROM correction_actors WHERE kind = 'admin';

INSERT INTO public.student_profiles (id)
SELECT id FROM correction_actors WHERE kind IN ('student', 'sibling');
INSERT INTO public.parent_children (parent_id, child_id)
SELECT parent.id, child.id FROM correction_actors parent CROSS JOIN correction_actors child
WHERE parent.kind = 'parent' AND child.kind IN ('student', 'sibling');
INSERT INTO public.teacher_profiles (id)
SELECT id FROM correction_actors WHERE kind = 'teacher';
INSERT INTO public.teacher_students (teacher_id, student_id)
SELECT teacher.id, child.id FROM correction_actors teacher CROSS JOIN correction_actors child
WHERE teacher.kind = 'teacher' AND child.kind = 'student';
GRANT SELECT ON correction_actors TO authenticated;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  actor record;
  child uuid := (SELECT id FROM correction_actors WHERE kind = 'student');
  sibling uuid := (SELECT id FROM correction_actors WHERE kind = 'sibling');
  parent uuid := (SELECT id FROM correction_actors WHERE kind = 'parent');
  outsider uuid := (SELECT id FROM correction_actors WHERE kind = 'outsider');
  log_id uuid;
  affected integer;
  result public.hydration_logs;
BEGIN
  FOR actor IN SELECT * FROM correction_actors WHERE kind IN ('student', 'parent', 'teacher', 'admin') LOOP
    -- The parent records a drink; every authorized role must be able to correct it.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', parent, 'role', 'authenticated')::text, true);
    INSERT INTO public.hydration_logs (student_id, amount_ml, drink_type, logged_at)
    VALUES (child, 250, 'Air putih/air matang', '2026-09-24 08:17:23+07') RETURNING id INTO log_id;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor.id, 'role', 'authenticated')::text, true);
    UPDATE public.hydration_logs SET amount_ml = 125, drink_type = 'Air kelapa', logged_at = '2026-09-23 16:00:00+07'
    WHERE id = log_id RETURNING * INTO result;
    IF NOT FOUND OR result.amount_ml <> 125 OR result.drink_type <> 'Air kelapa'
      OR result.logged_at <> '2026-09-23 16:00:00+07'::timestamptz
      OR result.recorded_by <> parent OR result.recorded_by_role <> 'parent'
      OR result.recorded_by_name <> 'Hydration correction test' THEN
      RAISE EXCEPTION 'Correction or attribution failed for %', actor.kind;
    END IF;

    BEGIN
      UPDATE public.hydration_logs SET amount_ml = 0 WHERE id = log_id;
      RAISE EXCEPTION 'Zero volume accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
      UPDATE public.hydration_logs SET amount_ml = -1 WHERE id = log_id;
      RAISE EXCEPTION 'Negative volume accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
      UPDATE public.hydration_logs SET recorded_by_name = 'Changed recorder' WHERE id = log_id;
      RAISE EXCEPTION 'Recorder attribution changed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      UPDATE public.hydration_logs SET student_id = sibling WHERE id = log_id;
      RAISE EXCEPTION 'Student ownership changed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', outsider, 'role', 'authenticated')::text, true);
    UPDATE public.hydration_logs SET amount_ml = 999 WHERE id = log_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Unrelated account updated a log'; END IF;
    DELETE FROM public.hydration_logs WHERE id = log_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Unrelated account deleted a log'; END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor.id, 'role', 'authenticated')::text, true);
    DELETE FROM public.hydration_logs WHERE id = log_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 OR EXISTS (SELECT 1 FROM public.hydration_logs WHERE id = log_id) THEN
      RAISE EXCEPTION 'Delete failed for %', actor.kind;
    END IF;
    IF (SELECT coalesce(sum(amount_ml), 0) FROM public.hydration_logs WHERE student_id = child) <> 0 THEN
      RAISE EXCEPTION 'Total intake was not cleared';
    END IF;
    RAISE NOTICE 'PASS: % correction, deletion, attribution, validation and unrelated-account isolation', actor.kind;
  END LOOP;
END;
$$;
ROLLBACK;
