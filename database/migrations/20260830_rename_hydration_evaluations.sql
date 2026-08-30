BEGIN;

UPDATE public.surveys
SET title = 'Evaluasi Sikap Hidrasi',
    description = 'Ayo cek sikap kamu tentang hidrasi.'
WHERE id = 'f062a5dc-211e-4d94-afc2-5d25b3affe36'
  AND survey_type = 'sikap'
  AND title = 'Kuis Sikap Dehidrasi';

UPDATE public.surveys
SET title = 'Evaluasi Pengetahuan Hidrasi',
    description = 'Ayo cek pengetahuan kamu tentang hidrasi.'
WHERE id = '79d495fe-197b-4034-a57c-c088bb4c5573'
  AND survey_type = 'pengetahuan'
  AND title = 'Kuis Pengetahuan Dehidrasi';

COMMIT;
