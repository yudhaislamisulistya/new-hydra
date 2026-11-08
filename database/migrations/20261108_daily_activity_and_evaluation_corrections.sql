BEGIN;

CREATE TABLE IF NOT EXISTS public.student_daily_activity (
  student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  activity_date date NOT NULL CHECK (activity_date >= DATE '1900-01-01'),
  activity_level text NOT NULL CHECK (activity_level IN ('rendah', 'sedang', 'tinggi')),
  is_estimated boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, activity_date)
);
ALTER TABLE public.student_daily_activity ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS student_daily_activity_date_idx ON public.student_daily_activity(activity_date, student_id);
DROP POLICY IF EXISTS activity_read_accessible ON public.student_daily_activity;
CREATE POLICY activity_read_accessible ON public.student_daily_activity FOR SELECT TO authenticated
USING (public.can_access_student(student_id));
REVOKE ALL ON public.student_daily_activity FROM anon, authenticated;
GRANT SELECT ON public.student_daily_activity TO authenticated;

-- Historical logs did not store activity. Mark generated defaults honestly, never replace a saved choice.
INSERT INTO public.student_daily_activity (student_id, activity_date, activity_level, is_estimated)
SELECT DISTINCT student_id, (logged_at AT TIME ZONE 'Asia/Jakarta')::date, 'sedang', true
FROM public.hydration_logs
ON CONFLICT (student_id, activity_date) DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_student_daily_activity(student_id_input uuid, date_input date, level_input text)
RETURNS public.student_daily_activity LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public.student_daily_activity;
BEGIN
  IF auth.uid() IS NULL OR public.can_access_student(student_id_input) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses untuk siswa ini.' USING ERRCODE = '42501';
  END IF;
  IF date_input IS NULL OR date_input < DATE '1900-01-01' OR date_input > (now() AT TIME ZONE 'Asia/Jakarta')::date THEN RAISE EXCEPTION 'Tanggal aktivitas tidak valid.'; END IF;
  IF level_input IS NULL OR level_input NOT IN ('rendah', 'sedang', 'tinggi') THEN RAISE EXCEPTION 'Aktivitas harus rendah, sedang, atau tinggi.'; END IF;
  INSERT INTO public.student_daily_activity (student_id, activity_date, activity_level, is_estimated, updated_by)
  VALUES (student_id_input, date_input, level_input, false, auth.uid())
  ON CONFLICT (student_id, activity_date) DO UPDATE SET activity_level = EXCLUDED.activity_level,
    is_estimated = false, updated_by = auth.uid(), updated_at = now()
  RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_student_daily_activity(uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_student_daily_activity(uuid,date,text) TO authenticated;

ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
DROP FUNCTION IF EXISTS public.submit_student_evaluations(jsonb);
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
      SELECT id INTO existing_id FROM public.survey_responses WHERE id = (entry->>'response_id')::uuid
        AND survey_id = evaluation AND response_date = response_day AND COALESCE(student_id, respondent_id) = child;
      IF existing_id IS NULL THEN RAISE EXCEPTION 'Data jawaban sudah berubah. Muat ulang halaman.'; END IF;
    ELSE
      SELECT id INTO existing_id FROM public.survey_responses WHERE survey_id = evaluation AND response_date = response_day
        AND COALESCE(student_id, respondent_id) = child ORDER BY submitted_at DESC, id DESC LIMIT 1;
    END IF;
    IF existing_id IS NOT NULL AND overwrite_existing THEN
      UPDATE public.survey_responses SET answers = entry->'answers', updated_by = actor, updated_at = now() WHERE id = existing_id;
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
  SELECT * INTO response FROM public.survey_responses WHERE id = response_id_input;
  IF NOT FOUND THEN RAISE EXCEPTION 'Data jawaban tidak ditemukan. Muat ulang halaman.'; END IF;
  IF auth.uid() IS NULL OR public.can_access_student(COALESCE(response.student_id,response.respondent_id)) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses untuk menghapus jawaban ini.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(response.student_id,response.respondent_id)::text || response.survey_id::text || response.response_date::text, 0));
  DELETE FROM public.survey_responses WHERE (id = response_id_input OR delete_all_for_day)
    AND survey_id = response.survey_id AND response_date = response.response_date
    AND COALESCE(student_id,respondent_id) = COALESCE(response.student_id,response.respondent_id);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_student_evaluation(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_student_evaluation(uuid,boolean) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
