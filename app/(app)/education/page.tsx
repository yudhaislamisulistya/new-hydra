"use client";

import { useEffect, useState } from "react";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { PlayCircle, Award, CheckCircle2 } from "lucide-react";
import { useUserStore } from "../../../store/useUserStore";
import { createClient } from "../../../utils/supabase/client";

type SurveyType = "survey" | "pengetahuan" | "sikap";

type EducationMaterial = {
  id: string;
  title: string;
  content: string | null;
  media_url: string | null;
  survey_id: string | null;
  survey_title: string | null;
  survey_type: SurveyType | null;
};

type LinkedSurvey = {
  id: string;
  title: string;
  survey_type: SurveyType;
};

type SurveyQuestion = {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  order_number: number;
};

type SurveyResponseRow = {
  survey_id: string;
};

// Helper to extract YouTube video ID
const getYouTubeId = (url: string | null) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

function EducationCard({
  material,
  userId,
  isCompleted,
  onCompleted,
}: {
  material: EducationMaterial;
  userId: string;
  isCompleted: boolean;
  onCompleted: (surveyId: string) => void;
}) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const surveyType = material.survey_type || "survey";
  const isScored = surveyType === "pengetahuan" || surveyType === "sikap";
  const actionLabel = showQuiz
    ? isScored
      ? "Lanjutkan Kuis"
      : "Lanjutkan Survei"
    : isScored
      ? "Mulai Kuis"
      : "Mulai Survei";

  const handleStartQuiz = async () => {
    if (!material.survey_id || isCompleted) return;

    if (questions.length > 0) {
      setShowQuiz(true);
      setShowResult(false);
      return;
    }

    setLoadingQuiz(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("survey_questions")
        .select("id, question_text, question_type, options, order_number")
        .eq("survey_id", material.survey_id)
        .order("order_number", { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        alert("Belum ada pertanyaan untuk kuis ini.");
        return;
      }

      setQuestions((data as SurveyQuestion[]) || []);
      setCurrentIndex(0);
      setAnswers({});
      setShowQuiz(true);
      setShowResult(false);
    } catch (error) {
      console.error("Error fetching education quiz:", error);
    } finally {
      setLoadingQuiz(false);
    }
  };

  const handleAnswer = (questionId: string, answer: string) => {
    const newAnswers = { ...answers, [questionId]: answer };
    setAnswers(newAnswers);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      return;
    }

    void submitResponses(newAnswers);
  };

  const handleTextAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const submitTextAndNext = () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    if (!answers[currentQuestion.id]?.trim()) {
      alert("Tulis jawaban kamu terlebih dahulu.");
      return;
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      return;
    }

    void submitResponses(answers);
  };

  const submitResponses = async (finalAnswers: Record<string, string>) => {
    if (!material.survey_id || !userId || isCompleted) return;

    setSubmitting(true);
    const supabase = createClient();

    try {
      const answersPayload: Record<string, { question_text: string; answer: string }> = {};
      questions.forEach((question) => {
        answersPayload[question.id] = {
          question_text: question.question_text,
          answer: finalAnswers[question.id] || "",
        };
      });

      const { error } = await supabase.from("survey_responses").insert({
        survey_id: material.survey_id,
        respondent_id: userId,
        student_id: userId,
        answers: answersPayload,
      });

      if (error) throw error;

      onCompleted(material.survey_id);
      setShowQuiz(false);
      setShowResult(true);
    } catch (error) {
      console.error("Error submitting education quiz:", error);
      const errorMessage = error instanceof Error ? error.message : "Terjadi kesalahan.";
      alert(`Gagal mengirim jawaban: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getScoreResult = () => {
    if (!isScored) return null;

    let totalScore = 0;
    const maxScore = questions.length * 4;

    questions.forEach((question) => {
      const answer = answers[question.id];
      if (!answer || !Array.isArray(question.options)) return;

      const selectedIndex = question.options.indexOf(answer);
      if (selectedIndex >= 0) {
        totalScore += selectedIndex + 1;
      }
    });

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;
    const conclusion =
      surveyType === "pengetahuan"
        ? percentage >= 75
          ? "Tinggi"
          : "Rendah"
        : percentage >= 75
          ? "Baik"
          : "Buruk";

    return { totalScore, maxScore, percentage, conclusion };
  };

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;
  const scoreResult = getScoreResult();
  const ytId = getYouTubeId(material.media_url);

  return (
    <div className="space-y-4 mb-10">
      <Card className="overflow-hidden shadow-sm">
        <div className="relative w-full pt-[56.25%] bg-slate-800">
          {ytId ? (
            <iframe
              className="absolute top-0 left-0 w-full h-full"
              src={`https://www.youtube.com/embed/${ytId}?rel=0`}
              title={material.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
              Video tidak valid
            </div>
          )}
        </div>

        <CardContent className="p-5">
          <h3 className="font-bold text-slate-800 text-lg mb-2">{material.title}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{material.content}</p>

          {material.survey_id && (
            <div className="mt-5">
              {isCompleted ? (
                <div className="flex items-center gap-2 bg-green-100 px-3 py-3 rounded-lg">
                  <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-green-700">
                      {isScored ? "Kuis sudah dikerjakan." : "Survei sudah dikirim."}
                    </p>
                    <p className="text-xs text-green-700/80 mt-0.5">
                      {isScored
                        ? "Kuis untuk video ini tidak perlu diisi lagi."
                        : "Survei untuk video ini sudah tercatat."}
                    </p>
                  </div>
                </div>
              ) : (
                <Button
                  className="w-full font-bold shadow-sm"
                  variant={showQuiz ? "secondary" : "primary"}
                  onClick={handleStartQuiz}
                  disabled={loadingQuiz}
                >
                  {loadingQuiz ? "Memuat..." : actionLabel}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {showQuiz && currentQuestion && !isCompleted && (
        <Card className="border-2 border-blue-500 shadow-md animate-fade-in-up">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
              <span>
                Pertanyaan {currentIndex + 1} / {questions.length}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>

            <ProgressBar progress={progress} />

            <div className="pt-2">
              <h3 className="font-bold text-slate-800 text-lg leading-snug">{currentQuestion.question_text}</h3>
            </div>

            <div className="space-y-3 pt-2">
              {currentQuestion.question_type === "text" && surveyType === "survey" ? (
                <div>
                  <textarea
                    className="w-full border rounded-xl p-3 text-sm focus:ring-2 outline-none border-slate-200"
                    rows={3}
                    placeholder="Tulis jawaban kamu di sini..."
                    value={answers[currentQuestion.id] || ""}
                    onChange={(event) => handleTextAnswer(currentQuestion.id, event.target.value)}
                  ></textarea>
                  <Button onClick={submitTextAndNext} className="w-full mt-3" disabled={submitting}>
                    {currentIndex < questions.length - 1 ? "Lanjut" : submitting ? "Mengirim..." : "Kirim Jawaban"}
                  </Button>
                </div>
              ) : (
                (Array.isArray(currentQuestion.options) ? currentQuestion.options : []).map((option, index) => (
                  <button
                    key={`${currentQuestion.id}-${index}`}
                    onClick={() => handleAnswer(currentQuestion.id, option)}
                    disabled={submitting}
                    className="w-full p-4 text-left border rounded-xl text-sm font-medium text-slate-700 bg-white hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {option}
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showResult && (
        <div className="flex flex-col items-center justify-center py-10 bg-white rounded-2xl border border-slate-200 animate-fade-in text-center shadow-sm">
          <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mb-4 relative">
            <div className="absolute inset-0 bg-yellow-400 rounded-full animate-ping opacity-20" />
            <Award size={48} className="text-yellow-500 relative z-10" />
          </div>
          <h3 className="text-xl font-extrabold text-slate-800 mb-2">Hebat Sekali!</h3>
          <p className="text-slate-600 mb-4 text-sm max-w-[250px] mx-auto">
            Kamu telah menyelesaikan <b>{isScored ? "kuis" : "survei"}</b> untuk materi <b>{material.title}</b>.
          </p>

          {scoreResult && (
            <div
              className={`w-full max-w-xs rounded-2xl p-5 mt-1 mb-5 ${
                scoreResult.conclusion === "Tinggi" || scoreResult.conclusion === "Baik"
                  ? "bg-green-50 border-2 border-green-300"
                  : "bg-red-50 border-2 border-red-300"
              }`}
            >
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">
                {surveyType === "pengetahuan" ? "Skor Pengetahuan" : "Skor Sikap"}
              </p>
              <p className="text-4xl font-extrabold text-slate-800">{scoreResult.percentage}%</p>
              <p className="text-sm text-slate-500 mt-1">
                Skor: {scoreResult.totalScore} / {scoreResult.maxScore}
              </p>
              <p
                className={`text-lg font-extrabold mt-2 ${
                  scoreResult.conclusion === "Tinggi" || scoreResult.conclusion === "Baik"
                    ? "text-green-700"
                    : "text-red-700"
                }`}
              >
                Kesimpulan: {scoreResult.conclusion}
              </p>
            </div>
          )}

          {!scoreResult && (
            <p className="text-xs text-slate-400 mb-5 max-w-[260px]">
              Jawaban survei kamu sudah tersimpan. Terima kasih sudah memberikan respon.
            </p>
          )}

          <Button
            onClick={() => {
              setShowResult(false);
              setCurrentIndex(0);
              setAnswers({});
            }}
            variant="outline"
            className="text-sm"
          >
            Kembali ke Materi
          </Button>
        </div>
      )}
    </div>
  );
}

export default function EducationPage() {
  const { profile } = useUserStore();
  const [materials, setMaterials] = useState<EducationMaterial[]>([]);
  const [completedSurveyIds, setCompletedSurveyIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEducation() {
      if (!profile?.id) return;

      const supabase = createClient();

      try {
        const { data: materialsData, error: materialsError } = await supabase
          .from("education_materials")
          .select("id, title, content, media_url, survey_id")
          .eq("is_published", true)
          .in("target_audience", ["student", "all"])
          .order("created_at", { ascending: false });

        if (materialsError) throw materialsError;

        const educationMaterials = (materialsData as EducationMaterial[] | null) || [];
        const surveyIds = educationMaterials
          .map((material) => material.survey_id)
          .filter((surveyId): surveyId is string => Boolean(surveyId));

        const surveyMap = new Map<string, LinkedSurvey>();

        if (surveyIds.length > 0) {
          const { data: surveysData, error: surveysError } = await supabase
            .from("surveys")
            .select("id, title, survey_type")
            .in("id", surveyIds);

          if (surveysError) throw surveysError;

          ((surveysData as LinkedSurvey[] | null) || []).forEach((survey) => {
            surveyMap.set(survey.id, survey);
          });

          const { data: responsesData, error: responsesError } = await supabase
            .from("survey_responses")
            .select("survey_id")
            .eq("respondent_id", profile.id)
            .in("survey_id", surveyIds);

          if (responsesError) throw responsesError;

          setCompletedSurveyIds(
            new Set(((responsesData as SurveyResponseRow[] | null) || []).map((response) => response.survey_id))
          );
        } else {
          setCompletedSurveyIds(new Set());
        }

        setMaterials(
          educationMaterials.map((material) => {
            const linkedSurvey = material.survey_id ? surveyMap.get(material.survey_id) : null;

            return {
              ...material,
              survey_title: linkedSurvey?.title || null,
              survey_type: linkedSurvey?.survey_type || null,
            };
          })
        );
      } catch (error) {
        console.error("Error fetching education materials:", error);
      } finally {
        setLoading(false);
      }
    }

    void fetchEducation();
  }, [profile?.id]);

  const handleCompletedSurvey = (surveyId: string) => {
    setCompletedSurveyIds((prev) => new Set(prev).add(surveyId));
  };

  return (
    <>
      <Header title="Edukasi Hidrasi" />
      <div className="p-6 space-y-2 pb-24">
        <div className="mb-6">
          <h2 className="font-extrabold text-slate-800 text-2xl">Ayo Belajar!</h2>
          <p className="text-slate-500 text-sm mt-1">
            Halo {profile?.nickname || "Kawan"}! Yuk tambah wawasanmu tentang hidrasi dengan menonton video di bawah ini.
          </p>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : materials.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-slate-300 shadow-sm">
            <PlayCircle size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-lg font-bold text-slate-700">Belum ada video</h3>
            <p className="text-sm text-slate-500 mt-1">Admin belum menambahkan materi edukasi.</p>
          </div>
        ) : !profile?.id ? null : (
          materials.map((material) => (
            <EducationCard
              key={material.id}
              material={material}
              userId={profile.id}
              isCompleted={material.survey_id ? completedSurveyIds.has(material.survey_id) : false}
              onCompleted={handleCompletedSurvey}
            />
          ))
        )}
      </div>
    </>
  );
}
