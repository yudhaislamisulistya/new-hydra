-- Run after 20261108_daily_activity_and_evaluation_corrections.sql. All fixtures roll back.
\ir evaluation_excel_import.sql
BEGIN;
CREATE TEMP TABLE correction_actors (kind text, id uuid DEFAULT gen_random_uuid());
INSERT INTO correction_actors(kind) VALUES ('student'),('other_student'),('parent'),('teacher'),('admin');
INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT id,id::text || '@hydra-corrections.invalid',jsonb_build_object('role',CASE WHEN kind IN ('parent','teacher') THEN kind ELSE 'student' END,'username',id::text,'full_name','Correction test') FROM correction_actors;
DELETE FROM public.profiles WHERE id = (SELECT id FROM correction_actors WHERE kind='admin');
INSERT INTO public.profiles(id,role,username,full_name) SELECT id,'admin',id::text,'Correction admin' FROM correction_actors WHERE kind='admin';
INSERT INTO public.student_profiles(id) SELECT id FROM correction_actors WHERE kind IN ('student','other_student');
INSERT INTO public.parent_children(parent_id,child_id) SELECT id,(SELECT id FROM correction_actors WHERE kind='student') FROM correction_actors WHERE kind='parent';
INSERT INTO public.teacher_profiles(id) SELECT id FROM correction_actors WHERE kind='teacher';
INSERT INTO public.teacher_students(teacher_id,student_id) SELECT id,(SELECT id FROM correction_actors WHERE kind='student') FROM correction_actors WHERE kind='teacher';
CREATE TEMP TABLE correction_catalog(kind text,id uuid DEFAULT gen_random_uuid(),question1 uuid DEFAULT gen_random_uuid(),question2 uuid DEFAULT gen_random_uuid());
INSERT INTO correction_catalog(kind) VALUES('sikap'),('kuis');
INSERT INTO public.surveys(id,title,survey_type,target_role) SELECT id,'Correction test',kind,'student' FROM correction_catalog;
INSERT INTO public.survey_questions(id,survey_id,question_text,question_type,options)
SELECT question1,id,'Soal satu','multiple_choice'::public.question_type,'["Ya","Tidak"]'::jsonb FROM correction_catalog UNION ALL
SELECT question2,id,'Soal dua','multiple_choice'::public.question_type,'["Ya","Tidak"]'::jsonb FROM correction_catalog;
GRANT SELECT ON correction_actors,correction_catalog TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
DECLARE actor record; child uuid := (SELECT id FROM correction_actors WHERE kind='student');
  other_child uuid := (SELECT id FROM correction_actors WHERE kind='other_student');
  parent uuid := (SELECT id FROM correction_actors WHERE kind='parent');
  admin uuid := (SELECT id FROM correction_actors WHERE kind='admin');
  evaluation uuid := (SELECT id FROM correction_catalog WHERE kind='sikap');
  quiz uuid := (SELECT id FROM correction_catalog WHERE kind='kuis');
  q1 uuid := (SELECT question1 FROM correction_catalog WHERE kind='sikap');
  q2 uuid := (SELECT question2 FROM correction_catalog WHERE kind='sikap');
  day date := DATE '2012-01-01'; entry jsonb; result jsonb; response_id uuid; saved_at timestamptz; answer jsonb;
BEGIN
  IF has_function_privilege('anon','public.save_student_daily_activity(uuid,date,text)','EXECUTE') OR has_function_privilege('anon','public.delete_student_evaluation(uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous mutation granted'; END IF;
  FOR actor IN SELECT * FROM correction_actors WHERE kind <> 'other_student' LOOP
    day := day + 10;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
    PERFORM public.save_student_daily_activity(child,day,'rendah');
    PERFORM public.save_student_daily_activity(child,day,'tinggi');
    IF (SELECT count(*) FROM public.student_daily_activity WHERE student_id=child AND activity_date=day) <> 1 OR NOT EXISTS(SELECT 1 FROM public.student_daily_activity WHERE student_id=child AND activity_date=day AND activity_level='tinggi' AND NOT is_estimated AND updated_by=actor.id) THEN RAISE EXCEPTION 'Activity upsert or attribution failed'; END IF;
    IF actor.kind <> 'admin' THEN
      BEGIN PERFORM public.save_student_daily_activity(other_child,day,'rendah'); RAISE EXCEPTION 'Other student activity accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      IF EXISTS(SELECT 1 FROM public.student_daily_activity WHERE student_id=other_child) THEN RAISE EXCEPTION 'Activity visibility leak'; END IF;
    END IF;
    BEGIN PERFORM public.save_student_daily_activity(child,DATE '2999-01-01','rendah'); RAISE EXCEPTION 'FUTURE_ACCEPTED'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FUTURE_ACCEPTED' THEN RAISE; END IF; END;
    BEGIN PERFORM public.save_student_daily_activity(child,day,'invalid'); RAISE EXCEPTION 'LEVEL_ACCEPTED'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='LEVEL_ACCEPTED' THEN RAISE; END IF; END;
    answer := jsonb_build_object(q1::text,jsonb_build_object('question_text','Soal satu','answer','Ya'),q2::text,jsonb_build_object('question_text','Soal dua','answer','Ya'));
    entry := jsonb_build_object('student_id',child,'survey_id',evaluation,'response_date',day,'answers',answer);
    result := public.submit_student_evaluations(jsonb_build_array(entry));
    IF result->>'added' <> '1' THEN RAISE EXCEPTION 'Initial response failed'; END IF;
    SELECT id,submitted_at INTO response_id,saved_at FROM public.survey_responses WHERE student_id=child AND survey_id=evaluation AND response_date=day;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',parent,'role','authenticated')::text,true);
    entry := entry || jsonb_build_object('response_id',response_id,'answers',jsonb_set(answer,ARRAY[q1::text,'answer'],'"Tidak"'));
    result := public.submit_student_evaluations(jsonb_build_array(entry),true);
    IF result->>'updated' <> '1' OR NOT EXISTS(SELECT 1 FROM public.survey_responses WHERE id=response_id AND respondent_id=actor.id AND submitted_at=saved_at AND updated_by=parent AND updated_at IS NOT NULL AND answers->q1::text->>'answer'='Tidak') THEN RAISE EXCEPTION 'Overwrite lost response or audit identity'; END IF;
    IF (SELECT count(*) FROM public.survey_responses WHERE student_id=child AND survey_id=evaluation AND response_date=day) <> 1 THEN RAISE EXCEPTION 'Overwrite duplicated response'; END IF;
    result := public.submit_student_evaluations(jsonb_build_array(entry),false);
    IF result->>'skipped' <> '1' THEN RAISE EXCEPTION 'Safe import retry changed'; END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_child,'role','authenticated')::text,true);
    BEGIN PERFORM public.delete_student_evaluation(response_id); RAISE EXCEPTION 'Other student deletion accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.submit_student_evaluations(jsonb_build_array(entry),true); RAISE EXCEPTION 'Other student overwrite accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);
    INSERT INTO public.survey_responses(survey_id,respondent_id,student_id,response_date,answers) VALUES(evaluation,child,NULL,day,answer);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',parent,'role','authenticated')::text,true);
    IF public.delete_student_evaluation(response_id,true) <> 2 THEN RAISE EXCEPTION 'Logical-date deletion did not include legacy duplicate'; END IF;
    IF EXISTS(SELECT 1 FROM public.survey_responses WHERE survey_id=evaluation AND response_date=day AND COALESCE(student_id,respondent_id)=child) THEN RAISE EXCEPTION 'Delete left stale completion'; END IF;
    SELECT jsonb_build_object(question1::text,jsonb_build_object('question_text','Soal satu','answer','Ya')) INTO answer FROM correction_catalog WHERE id=quiz;
    result := public.submit_student_evaluations(jsonb_build_array(jsonb_build_object('student_id',child,'survey_id',quiz,'response_date',day,'answers',answer)),true);
    IF result->>'added' <> '1' THEN RAISE EXCEPTION 'Daily one-question quiz rejected'; END IF;
    RAISE NOTICE 'PASS: % daily activity persistence, permissions, overwrite audit, duplicate deletion and daily quiz subset',actor.kind;
  END LOOP;
END $$;
ROLLBACK;
