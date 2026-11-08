-- Run after 20261108_daily_activity_and_evaluation_corrections.sql. No rows are deleted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.hydration_logs ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Restrictive policies also constrain the existing permissive administrator policies.
DROP POLICY IF EXISTS hydration_logs_active_only ON public.hydration_logs;
CREATE POLICY hydration_logs_active_only ON public.hydration_logs AS RESTRICTIVE
FOR ALL TO authenticated USING (archived_at IS NULL) WITH CHECK (archived_at IS NULL);
DROP POLICY IF EXISTS survey_responses_active_only ON public.survey_responses;
CREATE POLICY survey_responses_active_only ON public.survey_responses AS RESTRICTIVE
FOR ALL TO authenticated USING (archived_at IS NULL) WITH CHECK (archived_at IS NULL);
DROP POLICY IF EXISTS survey_answers_active_only ON public.survey_answers;
CREATE POLICY survey_answers_active_only ON public.survey_answers AS RESTRICTIVE
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.survey_responses response WHERE response.id = response_id AND response.archived_at IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM public.survey_responses response WHERE response.id = response_id AND response.archived_at IS NULL));

CREATE SCHEMA IF NOT EXISTS hydra_private;
REVOKE ALL ON SCHEMA hydra_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS hydra_private.data_archives (
  archive_id text PRIMARY KEY,
  archived_at timestamptz NOT NULL,
  hydration_count bigint NOT NULL,
  evaluation_count bigint NOT NULL
);
REVOKE ALL ON hydra_private.data_archives FROM PUBLIC, anon, authenticated;

-- SECURITY DEFINER operations must explicitly exclude archived rows too.
CREATE OR REPLACE FUNCTION public.submit_student_evaluations(entries jsonb, overwrite_existing boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid(); entry jsonb; child uuid; evaluation uuid; response_day date;
  question record; question_count integer; existing_id uuid; is_quiz boolean;
  added integer := 0; skipped integer := 0; updated integer := 0;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Silakan masuk terlebih dahulu.' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(entries) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Data evaluasi harus berupa daftar.'; END IF;
  IF jsonb_array_length(entries) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Isi 1 sampai 500 evaluasi per impor.'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(entries) ORDER BY value->>'student_id', value->>'survey_id', value->>'response_date' LOOP
    child := (entry->>'student_id')::uuid; evaluation := (entry->>'survey_id')::uuid;
    IF child IS NULL OR public.can_access_student(child) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Anda tidak memiliki akses untuk siswa ini.' USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.surveys WHERE id = evaluation AND (is_active OR public.is_admin())
      AND target_role = 'student' AND survey_type IN ('pengetahuan', 'sikap', 'kuis', 'survey')) THEN RAISE EXCEPTION 'Evaluasi tidak aktif atau tidak sesuai. Unduh ulang template.'; END IF;
    IF COALESCE(entry->>'response_date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Tanggal evaluasi tidak valid.'; END IF;
    response_day := (entry->>'response_date')::date;
    IF response_day < DATE '1900-01-01' OR response_day > (now() AT TIME ZONE 'Asia/Jakarta')::date THEN RAISE EXCEPTION 'Tanggal evaluasi tidak boleh di masa mendatang.'; END IF;
    IF jsonb_typeof(entry->'answers') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Jawaban harus lengkap.'; END IF;
    SELECT survey_type IN ('kuis', 'survey') INTO is_quiz FROM public.surveys WHERE id = evaluation;
    SELECT count(*) INTO question_count FROM public.survey_questions WHERE survey_id = evaluation
      AND (NOT is_quiz OR entry->'answers' ? id::text);
    IF question_count = 0 OR (SELECT count(*) FROM jsonb_object_keys(entry->'answers')) <> question_count THEN RAISE EXCEPTION 'Jumlah jawaban tidak sesuai soal terbaru. Unduh ulang template.'; END IF;
    FOR question IN SELECT id, question_text, question_type, options FROM public.survey_questions WHERE survey_id = evaluation
      AND (NOT is_quiz OR entry->'answers' ? id::text) LOOP
      IF (entry->'answers'->question.id::text->>'question_text') IS DISTINCT FROM question.question_text
        OR jsonb_typeof(entry->'answers'->question.id::text->'answer') IS DISTINCT FROM 'string'
        OR length(trim(entry->'answers'->question.id::text->>'answer')) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Jawaban tidak sesuai soal terbaru atau masih kosong.'; END IF;
      IF question.question_type <> 'text' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(question.options) AS option(value)
        WHERE option.value = entry->'answers'->question.id::text->>'answer') THEN RAISE EXCEPTION 'Jawaban tidak sesuai pilihan terbaru.'; END IF;
    END LOOP;
    PERFORM pg_advisory_xact_lock(hashtextextended(child::text || evaluation::text || response_day::text, 0));
    existing_id := NULL;
    IF entry->>'response_id' IS NOT NULL THEN
      SELECT id INTO existing_id FROM public.survey_responses WHERE archived_at IS NULL AND id = (entry->>'response_id')::uuid
        AND survey_id = evaluation AND response_date = response_day AND COALESCE(student_id, respondent_id) = child;
      IF existing_id IS NULL THEN RAISE EXCEPTION 'Data jawaban sudah berubah. Muat ulang halaman.'; END IF;
    ELSE
      SELECT id INTO existing_id FROM public.survey_responses WHERE archived_at IS NULL AND survey_id = evaluation AND response_date = response_day
        AND COALESCE(student_id, respondent_id) = child ORDER BY submitted_at DESC, id DESC LIMIT 1;
    END IF;
    IF existing_id IS NOT NULL AND overwrite_existing THEN
      UPDATE public.survey_responses SET answers = entry->'answers', updated_by = actor, updated_at = now() WHERE id = existing_id AND archived_at IS NULL;
      updated := updated + 1;
    ELSIF existing_id IS NOT NULL THEN skipped := skipped + 1;
    ELSE
      INSERT INTO public.survey_responses (survey_id, respondent_id, student_id, response_date, answers)
      VALUES (evaluation, actor, child, response_day, entry->'answers'); added := added + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('added', added, 'skipped', skipped, 'updated', updated);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_student_evaluations(jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_evaluations(jsonb,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_student_evaluation(response_id_input uuid, delete_all_for_day boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE response public.survey_responses; affected integer;
BEGIN
  SELECT * INTO response FROM public.survey_responses WHERE id = response_id_input AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Data jawaban tidak ditemukan. Muat ulang halaman.'; END IF;
  IF auth.uid() IS NULL OR public.can_access_student(COALESCE(response.student_id,response.respondent_id)) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses untuk menghapus jawaban ini.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(response.student_id,response.respondent_id)::text || response.survey_id::text || response.response_date::text, 0));
  DELETE FROM public.survey_responses WHERE archived_at IS NULL AND (id = response_id_input OR delete_all_for_day)
    AND survey_id = response.survey_id AND response_date = response.response_date
    AND COALESCE(student_id,respondent_id) = COALESCE(response.student_id,response.respondent_id);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_student_evaluation(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_student_evaluation(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (id uuid, name text, survey_count bigint, hydration_count bigint, checkin_count bigint, checkin_xp bigint, total_xp bigint, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH survey_totals AS (
    SELECT COALESCE(student_id, respondent_id) AS student_id, count(*)::bigint AS survey_count
    FROM public.survey_responses WHERE archived_at IS NULL GROUP BY COALESCE(student_id, respondent_id)
  ), hydration_totals AS (
    SELECT student_id, count(*)::bigint AS hydration_count FROM public.hydration_logs WHERE archived_at IS NULL GROUP BY student_id
  ), checkin_totals AS (
    SELECT student_id, count(*)::bigint AS checkin_count, coalesce(sum(xp_earned), 0)::bigint AS checkin_xp
    FROM public.daily_checkins GROUP BY student_id
  ), scores AS (
    SELECT student.id, coalesce(profile.full_name, 'Siswa') AS name,
      coalesce(survey.survey_count, 0)::bigint AS survey_count,
      coalesce(hydration.hydration_count, 0)::bigint AS hydration_count,
      coalesce(checkin.checkin_count, 0)::bigint AS checkin_count,
      coalesce(checkin.checkin_xp, 0)::bigint AS checkin_xp,
      (coalesce(survey.survey_count, 0) * 100 + coalesce(hydration.hydration_count, 0) * 10 + coalesce(checkin.checkin_xp, 0))::bigint AS total_xp
    FROM public.student_profiles student JOIN public.profiles profile ON profile.id = student.id
    LEFT JOIN survey_totals survey ON survey.student_id = student.id
    LEFT JOIN hydration_totals hydration ON hydration.student_id = student.id
    LEFT JOIN checkin_totals checkin ON checkin.student_id = student.id
  )
  SELECT scores.*, row_number() OVER (ORDER BY total_xp DESC, name ASC, id ASC)::bigint AS rank FROM scores ORDER BY rank
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;

DO $archive$
DECLARE
  archive_key constant text := '20261108_hide_existing_entries';
  archive_time timestamptz := clock_timestamp();
  hydration_before text; evaluations_before text;
  hydration_after text; evaluations_after text;
  hydration_rows bigint; evaluation_rows bigint;
BEGIN
  -- Re-running this migration must never hide entries submitted after activation.
  IF EXISTS (SELECT 1 FROM hydra_private.data_archives WHERE archive_id = archive_key) THEN RETURN; END IF;
  LOCK TABLE public.hydration_logs, public.survey_responses IN SHARE ROW EXCLUSIVE MODE;
  SELECT md5(coalesce(string_agg((to_jsonb(entry) - 'archived_at')::text, '' ORDER BY id), ''))
    INTO hydration_before FROM public.hydration_logs entry;
  SELECT md5(coalesce(string_agg((to_jsonb(entry) - 'archived_at')::text, '' ORDER BY id), ''))
    INTO evaluations_before FROM public.survey_responses entry;

  UPDATE public.hydration_logs SET archived_at = archive_time WHERE archived_at IS NULL;
  GET DIAGNOSTICS hydration_rows = ROW_COUNT;
  UPDATE public.survey_responses SET archived_at = archive_time WHERE archived_at IS NULL;
  GET DIAGNOSTICS evaluation_rows = ROW_COUNT;

  SELECT md5(coalesce(string_agg((to_jsonb(entry) - 'archived_at')::text, '' ORDER BY id), ''))
    INTO hydration_after FROM public.hydration_logs entry;
  SELECT md5(coalesce(string_agg((to_jsonb(entry) - 'archived_at')::text, '' ORDER BY id), ''))
    INTO evaluations_after FROM public.survey_responses entry;
  IF hydration_before IS DISTINCT FROM hydration_after OR evaluations_before IS DISTINCT FROM evaluations_after THEN
    RAISE EXCEPTION 'Pengarsipan dibatalkan karena isi data asli berubah.';
  END IF;
  INSERT INTO hydra_private.data_archives VALUES (archive_key, archive_time, hydration_rows, evaluation_rows);
  RAISE NOTICE 'Arsip selesai: % catatan asupan, % hasil evaluasi. Data asli tetap tersimpan.', hydration_rows, evaluation_rows;
END;
$archive$;

COMMIT;
NOTIFY pgrst, 'reload schema';

