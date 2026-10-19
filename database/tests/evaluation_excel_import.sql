-- Run as postgres after 20261019_import_evaluations.sql. No real accounts are modified.
BEGIN;
CREATE TEMP TABLE evaluation_actors (kind text, id uuid DEFAULT gen_random_uuid());
INSERT INTO evaluation_actors (kind) VALUES ('student'), ('other_student'), ('parent'), ('teacher'), ('admin');
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT id, id::text || '@evaluation-import-test.invalid',
  jsonb_build_object('role', CASE WHEN kind IN ('parent', 'teacher') THEN kind ELSE 'student' END, 'username', id::text, 'full_name', 'Evaluation import test')
FROM evaluation_actors;
DELETE FROM public.profiles WHERE id = (SELECT id FROM evaluation_actors WHERE kind = 'admin');
INSERT INTO public.profiles (id, role, username, full_name)
SELECT id, 'admin', id::text, 'Evaluation import admin' FROM evaluation_actors WHERE kind = 'admin';
INSERT INTO public.student_profiles (id) SELECT id FROM evaluation_actors WHERE kind IN ('student', 'other_student');
INSERT INTO public.parent_children (parent_id, child_id)
SELECT id, (SELECT id FROM evaluation_actors WHERE kind = 'student') FROM evaluation_actors WHERE kind = 'parent';
INSERT INTO public.teacher_profiles (id) SELECT id FROM evaluation_actors WHERE kind = 'teacher';
INSERT INTO public.teacher_students (teacher_id, student_id)
SELECT id, (SELECT id FROM evaluation_actors WHERE kind = 'student') FROM evaluation_actors WHERE kind = 'teacher';
CREATE TEMP TABLE evaluation_catalog (survey uuid DEFAULT gen_random_uuid(), question uuid DEFAULT gen_random_uuid());
INSERT INTO evaluation_catalog DEFAULT VALUES;
INSERT INTO public.surveys (id, title, survey_type, target_role) SELECT survey, 'Evaluation import test', 'sikap', 'student' FROM evaluation_catalog;
INSERT INTO public.survey_questions (id, survey_id, question_text, question_type, options)
SELECT question, survey, 'Soal uji', 'multiple_choice', '["Tidak Setuju", "Setuju"]'::jsonb FROM evaluation_catalog;
GRANT SELECT ON evaluation_actors, evaluation_catalog TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  actor record;
  child uuid := (SELECT id FROM evaluation_actors WHERE kind = 'student');
  other_child uuid := (SELECT id FROM evaluation_actors WHERE kind = 'other_student');
  parent uuid := (SELECT id FROM evaluation_actors WHERE kind = 'parent');
  survey uuid := (SELECT evaluation_catalog.survey FROM evaluation_catalog);
  question uuid := (SELECT evaluation_catalog.question FROM evaluation_catalog);
  day date := DATE '2010-01-01';
  entry jsonb;
  invalid_entry jsonb;
  result jsonb;
BEGIN
  IF has_function_privilege('anon', 'public.submit_student_evaluations(jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'Anonymous execute was granted'; END IF;
  FOR actor IN SELECT * FROM evaluation_actors WHERE kind <> 'other_student' LOOP
    day := day + 10;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor.id, 'role', 'authenticated')::text, true);
    entry := jsonb_build_object('student_id', child, 'survey_id', survey, 'response_date', day,
      'answers', jsonb_build_object(question::text, jsonb_build_object('question_text', 'Soal uji', 'answer', 'Setuju')));
    result := public.submit_student_evaluations(jsonb_build_array(entry, entry || jsonb_build_object('response_date', day + 1)));
    IF result <> '{"added":2,"skipped":0}'::jsonb THEN RAISE EXCEPTION 'Bulk submit failed for %: %', actor.kind, result; END IF;
    IF (SELECT count(*) FROM public.survey_responses WHERE survey_id = survey AND response_date IN (day, day + 1) AND student_id = child AND respondent_id = actor.id) <> 2 THEN
      RAISE EXCEPTION 'Student or actor attribution failed';
    END IF;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', parent, 'role', 'authenticated')::text, true);
    result := public.submit_student_evaluations(jsonb_build_array(jsonb_set(entry, ARRAY['answers',question::text,'answer'], '"Tidak Setuju"')));
    IF result <> '{"added":0,"skipped":1}'::jsonb THEN RAISE EXCEPTION 'Retry was not skipped'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.survey_responses WHERE student_id = child AND survey_id = survey AND response_date = day AND respondent_id = actor.id AND answers->question::text->>'answer' = 'Setuju') THEN
      RAISE EXCEPTION 'Retry overwrote original actor or answers';
    END IF;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', child, 'role', 'authenticated')::text, true);
    IF NOT EXISTS (SELECT 1 FROM public.survey_responses WHERE student_id = child AND survey_id = survey AND response_date = day) THEN RAISE EXCEPTION 'Student cannot see imported completion'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.get_leaderboard() WHERE id = child AND survey_count >= 2) THEN RAISE EXCEPTION 'Import did not count for student XP'; END IF;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor.id, 'role', 'authenticated')::text, true);
    entry := entry || jsonb_build_object('response_date', day + 2);
    IF actor.kind <> 'admin' THEN
      BEGIN
        PERFORM public.submit_student_evaluations(jsonb_build_array(entry, entry || jsonb_build_object('student_id', other_child)));
        RAISE EXCEPTION 'Unauthorized student accepted';
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      IF EXISTS (SELECT 1 FROM public.survey_responses WHERE student_id = child AND survey_id = survey AND response_date = day + 2) THEN RAISE EXCEPTION 'Unauthorized batch partially saved'; END IF;
    END IF;
    FOREACH invalid_entry IN ARRAY ARRAY[
      entry || jsonb_build_object('answers', '{}'::jsonb),
      entry || jsonb_build_object('response_date', '2999-01-01'),
      jsonb_set(entry, ARRAY['answers',question::text,'answer'], '"Invalid option"'),
      jsonb_set(entry, ARRAY['answers',question::text,'question_text'], '"Stale question"')
    ] LOOP
      BEGIN
        PERFORM public.submit_student_evaluations(jsonb_build_array(entry, invalid_entry || jsonb_build_object('response_date', COALESCE(invalid_entry->>'response_date', (day + 3)::text))));
        RAISE EXCEPTION 'INVALID_ACCEPTED';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM = 'INVALID_ACCEPTED' THEN RAISE; END IF;
      END;
      IF EXISTS (SELECT 1 FROM public.survey_responses WHERE student_id = child AND survey_id = survey AND response_date = day + 2) THEN RAISE EXCEPTION 'Invalid batch partially saved'; END IF;
    END LOOP;
    RAISE NOTICE 'PASS: % evaluation import, attribution, completion, XP, duplicate protection, validation and atomic scope checks', actor.kind;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN
    PERFORM public.submit_student_evaluations(jsonb_build_array(entry)); RAISE EXCEPTION 'Anonymous actor accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
ROLLBACK;
