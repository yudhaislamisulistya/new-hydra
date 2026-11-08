-- Run as postgres after 20261108_hide_existing_entries.sql. All fixtures roll back.
BEGIN;
CREATE TEMP TABLE archive_actors (kind text, id uuid DEFAULT gen_random_uuid());
INSERT INTO archive_actors(kind) VALUES ('student'),('other_student'),('parent'),('teacher'),('admin');
INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT id,id::text || '@archive-test.invalid',jsonb_build_object('role',CASE WHEN kind IN ('parent','teacher') THEN kind ELSE 'student' END,'username',id::text,'full_name','Archive test') FROM archive_actors;
DELETE FROM public.profiles WHERE id=(SELECT id FROM archive_actors WHERE kind='admin');
INSERT INTO public.profiles(id,role,username,full_name) SELECT id,'admin',id::text,'Archive admin' FROM archive_actors WHERE kind='admin';
INSERT INTO public.student_profiles(id) SELECT id FROM archive_actors WHERE kind IN ('student','other_student');
INSERT INTO public.parent_children(parent_id,child_id) SELECT id,(SELECT id FROM archive_actors WHERE kind='student') FROM archive_actors WHERE kind='parent';
INSERT INTO public.teacher_profiles(id) SELECT id FROM archive_actors WHERE kind='teacher';
INSERT INTO public.teacher_students(teacher_id,student_id) SELECT id,(SELECT id FROM archive_actors WHERE kind='student') FROM archive_actors WHERE kind='teacher';
CREATE TEMP TABLE archive_catalog(kind text,id uuid DEFAULT gen_random_uuid(),question uuid DEFAULT gen_random_uuid(),old_response uuid DEFAULT gen_random_uuid());
INSERT INTO archive_catalog(kind) VALUES('pengetahuan'),('sikap'),('kuis');
INSERT INTO public.surveys(id,title,survey_type,target_role) SELECT id,'Archive test',kind,'student' FROM archive_catalog;
INSERT INTO public.survey_questions(id,survey_id,question_text,question_type,options)
SELECT question,id,'Soal arsip','multiple_choice','["Ya","Tidak"]'::jsonb FROM archive_catalog;
INSERT INTO public.survey_responses(id,survey_id,respondent_id,student_id,response_date,answers)
SELECT old_response,id,(SELECT id FROM archive_actors WHERE kind='student'),(SELECT id FROM archive_actors WHERE kind='student'),DATE '2011-01-01',jsonb_build_object(question::text,jsonb_build_object('question_text','Soal arsip','answer','Ya')) FROM archive_catalog;
-- Retain an old duplicate using the legacy respondent-only schema as well.
INSERT INTO public.survey_responses(survey_id,respondent_id,response_date,answers)
SELECT id,(SELECT id FROM archive_actors WHERE kind='student'),DATE '2011-01-01','{}'::jsonb FROM archive_catalog WHERE kind='sikap';
INSERT INTO public.survey_answers(response_id,question_id,answer_text) SELECT old_response,question,'Ya' FROM archive_catalog;
INSERT INTO public.hydration_logs(student_id,amount_ml,drink_type,logged_at,recorded_by,recorded_by_name,recorded_by_role)
SELECT id,250,'Air putih','2011-01-01 08:00:00+07',id,'Original recorder','student' FROM archive_actors WHERE kind='student';
CREATE TEMP TABLE archive_snapshots AS
SELECT 'hydration' AS kind,id,to_jsonb(entry)-'archived_at' AS body FROM public.hydration_logs entry WHERE student_id=(SELECT id FROM archive_actors WHERE kind='student')
UNION ALL SELECT 'evaluation',id,to_jsonb(entry)-'archived_at' FROM public.survey_responses entry WHERE respondent_id=(SELECT id FROM archive_actors WHERE kind='student');
UPDATE public.hydration_logs SET archived_at=now() WHERE id IN(SELECT id FROM archive_snapshots WHERE kind='hydration');
UPDATE public.survey_responses SET archived_at=now() WHERE id IN(SELECT id FROM archive_snapshots WHERE kind='evaluation');
GRANT SELECT ON archive_actors,archive_catalog,archive_snapshots TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  actor record; evaluation record; affected integer; result jsonb; new_response uuid; new_log uuid;
  child uuid := (SELECT id FROM archive_actors WHERE kind='student');
  entry jsonb;
BEGIN
  IF has_schema_privilege('authenticated','hydra_private','USAGE') OR has_schema_privilege('anon','hydra_private','USAGE') THEN RAISE EXCEPTION 'Archive ledger is exposed'; END IF;
  FOR actor IN SELECT * FROM archive_actors WHERE kind <> 'other_student' LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
    IF EXISTS(SELECT 1 FROM public.hydration_logs WHERE student_id=child) THEN RAISE EXCEPTION 'Archived hydration visible to %',actor.kind; END IF;
    IF EXISTS(SELECT 1 FROM public.survey_responses WHERE COALESCE(student_id,respondent_id)=child) THEN RAISE EXCEPTION 'Archived response visible to %',actor.kind; END IF;
    IF EXISTS(SELECT 1 FROM public.survey_answers WHERE response_id IN(SELECT old_response FROM archive_catalog)) THEN RAISE EXCEPTION 'Archived answers visible to %',actor.kind; END IF;
    IF EXISTS(SELECT 1 FROM public.get_leaderboard() WHERE id=child AND (hydration_count<>0 OR survey_count<>0)) THEN RAISE EXCEPTION 'Archive still contributes to counts/XP'; END IF;
    UPDATE public.hydration_logs SET archived_at=NULL,amount_ml=999 WHERE id IN(SELECT id FROM archive_snapshots WHERE kind='hydration');
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected<>0 THEN RAISE EXCEPTION 'Archived hydration could be changed'; END IF;
    DELETE FROM public.hydration_logs WHERE student_id=child;
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected<>0 THEN RAISE EXCEPTION 'Archived hydration could be deleted'; END IF;
    UPDATE public.survey_responses SET archived_at=NULL,answers='{}'::jsonb WHERE id IN(SELECT old_response FROM archive_catalog);
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected<>0 THEN RAISE EXCEPTION 'Archived evaluation could be changed'; END IF;

    -- New backdated entries must remain available, even for a previously archived date.
    INSERT INTO public.hydration_logs(student_id,amount_ml,drink_type,logged_at)
    VALUES(child,350,'Air putih','2011-01-01 08:00:00+07') RETURNING id INTO new_log;
    IF NOT EXISTS(SELECT 1 FROM public.hydration_logs WHERE id=new_log AND archived_at IS NULL AND recorded_by=actor.id) THEN RAISE EXCEPTION 'New hydration is hidden or misattributed'; END IF;
    BEGIN
      UPDATE public.hydration_logs SET archived_at=now() WHERE id=new_log;
      RAISE EXCEPTION 'ARCHIVE_FLAG_ACCEPTED';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    FOR evaluation IN SELECT * FROM archive_catalog LOOP
      entry:=jsonb_build_object('student_id',child,'survey_id',evaluation.id,'response_date','2011-01-01',
        'answers',jsonb_build_object(evaluation.question::text,jsonb_build_object('question_text','Soal arsip','answer','Tidak')));
      result:=public.submit_student_evaluations(jsonb_build_array(entry),true);
      IF result->>'added'<>'1' OR result->>'updated'<>'0' THEN RAISE EXCEPTION 'New evaluation reused an archived response'; END IF;
      SELECT id INTO new_response FROM public.survey_responses WHERE survey_id=evaluation.id AND student_id=child;
      IF new_response IS NULL OR new_response=evaluation.old_response THEN RAISE EXCEPTION 'New evaluation missing'; END IF;
      result:=public.submit_student_evaluations(jsonb_build_array(entry),false);
      IF result->>'skipped'<>'1' THEN RAISE EXCEPTION 'Active import retry is no longer idempotent'; END IF;
      BEGIN
        PERFORM public.submit_student_evaluations(jsonb_build_array(entry||jsonb_build_object('response_id',evaluation.old_response)),true);
        RAISE EXCEPTION 'ARCHIVED_OVERWRITE_ACCEPTED';
      EXCEPTION WHEN raise_exception THEN IF SQLERRM='ARCHIVED_OVERWRITE_ACCEPTED' THEN RAISE; END IF;
      END;
      BEGIN
        PERFORM public.delete_student_evaluation(evaluation.old_response,true);
        RAISE EXCEPTION 'ARCHIVED_DELETE_ACCEPTED';
      EXCEPTION WHEN raise_exception THEN IF SQLERRM='ARCHIVED_DELETE_ACCEPTED' THEN RAISE; END IF;
      END;
      IF NOT EXISTS(SELECT 1 FROM public.get_leaderboard() WHERE id=child AND survey_count=1 AND hydration_count=1) THEN RAISE EXCEPTION 'Active counts/XP incorrect'; END IF;
      IF public.delete_student_evaluation(new_response,true)<>1 THEN RAISE EXCEPTION 'Active deletion touched archived duplicates'; END IF;
    END LOOP;
    DELETE FROM public.hydration_logs WHERE id=new_log;
    IF NOT EXISTS(SELECT 1 FROM public.get_leaderboard() WHERE id=child AND survey_count=0 AND hydration_count=0) THEN RAISE EXCEPTION 'Active deletion left stale counts'; END IF;
    RAISE NOTICE 'PASS: % cannot read/export/change archived entries; new backdated hydration and evaluations remain usable',actor.kind;
  END LOOP;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.hydration_logs WHERE id IN(SELECT id FROM archive_snapshots WHERE kind='hydration') AND archived_at IS NOT NULL)<>1
    OR (SELECT count(*) FROM public.survey_responses WHERE id IN(SELECT id FROM archive_snapshots WHERE kind='evaluation') AND archived_at IS NOT NULL)<>4 THEN RAISE EXCEPTION 'Archived rows were removed'; END IF;
  IF EXISTS(SELECT 1 FROM archive_snapshots snapshot JOIN public.hydration_logs entry USING(id) WHERE snapshot.kind='hydration' AND snapshot.body IS DISTINCT FROM to_jsonb(entry)-'archived_at')
    OR EXISTS(SELECT 1 FROM archive_snapshots snapshot JOIN public.survey_responses entry USING(id) WHERE snapshot.kind='evaluation' AND snapshot.body IS DISTINCT FROM to_jsonb(entry)-'archived_at') THEN RAISE EXCEPTION 'Original archive contents changed'; END IF;
  IF (SELECT count(*) FROM public.survey_answers WHERE response_id IN(SELECT old_response FROM archive_catalog))<>3 THEN RAISE EXCEPTION 'Archived answer rows were removed'; END IF;
  RAISE NOTICE 'PASS: all archived originals, timestamps, answers, and recorder identities are preserved';
END $$;
ROLLBACK;
