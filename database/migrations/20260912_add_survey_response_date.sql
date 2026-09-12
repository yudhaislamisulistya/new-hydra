BEGIN;

ALTER TABLE public.survey_responses
ADD COLUMN IF NOT EXISTS response_date date;

UPDATE public.survey_responses
SET response_date = (submitted_at AT TIME ZONE 'Asia/Jakarta')::date
WHERE response_date IS NULL;

ALTER TABLE public.survey_responses
  ALTER COLUMN response_date SET DEFAULT (timezone('Asia/Jakarta', now()))::date,
  ALTER COLUMN response_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS survey_responses_respondent_date_idx
ON public.survey_responses (respondent_id, response_date, survey_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.survey_responses WHERE response_date IS NULL) THEN
    RAISE EXCEPTION 'Survey response date backfill is incomplete';
  END IF;
END
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
