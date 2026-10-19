BEGIN;

CREATE INDEX IF NOT EXISTS survey_responses_student_date_idx
ON public.survey_responses (student_id, response_date, survey_id);

-- Keep existing responses, including historical duplicates; never overwrite them during import.
CREATE OR REPLACE FUNCTION public.submit_student_evaluations(entries jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  entry jsonb;
  child uuid;
  evaluation uuid;
  response_day date;
  question record;
  question_count integer;
  added integer := 0;
  skipped integer := 0;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Silakan masuk terlebih dahulu.' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(entries) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Data evaluasi harus berupa daftar.'; END IF;
  IF jsonb_array_length(entries) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Isi 1 sampai 500 evaluasi per impor.'; END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(entries)
    ORDER BY value->>'student_id', value->>'survey_id', value->>'response_date'
  LOOP
    child := (entry->>'student_id')::uuid;
    evaluation := (entry->>'survey_id')::uuid;
    IF child IS NULL OR public.can_access_student(child) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Anda tidak memiliki akses untuk siswa ini.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.surveys WHERE id = evaluation AND is_active
      AND target_role = 'student' AND survey_type IN ('pengetahuan', 'sikap')) THEN
      RAISE EXCEPTION 'Evaluasi tidak aktif atau tidak sesuai. Unduh ulang template.';
    END IF;
    IF COALESCE(entry->>'response_date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Tanggal evaluasi tidak valid.'; END IF;
    response_day := (entry->>'response_date')::date;
    IF response_day < DATE '1900-01-01' OR response_day > (now() AT TIME ZONE 'Asia/Jakarta')::date THEN
      RAISE EXCEPTION 'Tanggal evaluasi tidak boleh di masa mendatang.';
    END IF;
    IF jsonb_typeof(entry->'answers') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Jawaban harus lengkap.'; END IF;
    SELECT count(*) INTO question_count FROM public.survey_questions WHERE survey_id = evaluation;
    IF question_count = 0 OR (SELECT count(*) FROM jsonb_object_keys(entry->'answers')) <> question_count THEN
      RAISE EXCEPTION 'Jumlah jawaban tidak sesuai soal terbaru. Unduh ulang template.';
    END IF;
    FOR question IN SELECT id, question_text, options FROM public.survey_questions WHERE survey_id = evaluation LOOP
      IF (entry->'answers'->question.id::text->>'question_text') IS DISTINCT FROM question.question_text
        OR jsonb_typeof(entry->'answers'->question.id::text->'answer') IS DISTINCT FROM 'string'
        OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(question.options) AS option(value)
          WHERE option.value = entry->'answers'->question.id::text->>'answer') THEN
        RAISE EXCEPTION 'Jawaban tidak sesuai soal atau pilihan terbaru. Periksa template.';
      END IF;
    END LOOP;

    -- Manual submissions and imports use the same lock, so concurrent retries stay idempotent.
    PERFORM pg_advisory_xact_lock(hashtextextended(child::text || evaluation::text || response_day::text, 0));
    IF EXISTS (SELECT 1 FROM public.survey_responses WHERE survey_id = evaluation
      AND response_date = response_day AND COALESCE(student_id, respondent_id) = child) THEN
      skipped := skipped + 1;
    ELSE
      INSERT INTO public.survey_responses (survey_id, respondent_id, student_id, response_date, answers)
      VALUES (evaluation, actor, child, response_day, entry->'answers');
      added := added + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('added', added, 'skipped', skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_student_evaluations(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_evaluations(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (id uuid, name text, survey_count bigint, hydration_count bigint, checkin_count bigint, checkin_xp bigint, total_xp bigint, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH survey_totals AS (
    SELECT COALESCE(student_id, respondent_id) AS student_id, count(*)::bigint AS survey_count
    FROM public.survey_responses GROUP BY COALESCE(student_id, respondent_id)
  ), hydration_totals AS (
    SELECT student_id, count(*)::bigint AS hydration_count FROM public.hydration_logs GROUP BY student_id
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

COMMIT;
NOTIFY pgrst, 'reload schema';
