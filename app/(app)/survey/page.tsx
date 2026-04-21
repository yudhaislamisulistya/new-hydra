"use client";

import { useState, useEffect } from "react";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { useUserStore } from "../../../store/useUserStore";
import { createClient } from "../../../utils/supabase/client";

export default function SurveyPage() {
  const { profile } = useUserStore();
  const [surveys, setSurveys] = useState<any[]>([]);
  const [todayResponseIds, setTodayResponseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Quiz mode state
  const [activeSurvey, setActiveSurvey] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!profile?.id) return;
      const supabase = createClient();

      try {
        // 1. Fetch active surveys targeting student
        const { data: surveysData, error: survError } = await supabase
          .from('surveys')
          .select('id, title, description, target_role, survey_type')
          .eq('is_active', true)
          .eq('target_role', 'student')
          .order('created_at', { ascending: false });

        if (survError) throw survError;
        setSurveys(surveysData || []);

        // 2. Fetch today's responses for this student
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: responsesData, error: resError } = await supabase
          .from('survey_responses')
          .select('survey_id, submitted_at')
          .eq('respondent_id', profile.id)
          .gte('submitted_at', today.toISOString());

        if (resError) throw resError;

        const completedIds = new Set<string>(
          (responsesData || []).map((r: any) => r.survey_id)
        );
        setTodayResponseIds(completedIds);

      } catch (err) {
        console.error("Error fetching surveys:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [profile?.id]);

  const handleStartSurvey = async (survey: any) => {
    setLoadingQuiz(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from('survey_questions')
        .select('*')
        .eq('survey_id', survey.id)
        .order('order_number', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        alert("Belum ada pertanyaan untuk kuis ini.");
        setLoadingQuiz(false);
        return;
      }

      setQuestions(data);
      setActiveSurvey(survey);
      setCurrentIndex(0);
      setAnswers({});
      setShowResult(false);
    } catch (err) {
      console.error("Error fetching questions:", err);
    } finally {
      setLoadingQuiz(false);
    }
  };

  const handleAnswer = (questionId: string, answer: string) => {
    const newAnswers = { ...answers, [questionId]: answer };
    setAnswers(newAnswers);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // All questions answered, submit
      submitResponses(newAnswers);
    }
  };

  const handleTextAnswer = (questionId: string, text: string) => {
    setAnswers({ ...answers, [questionId]: text });
  };

  const submitTextAndNext = () => {
    const currentQ = questions[currentIndex];
    if (!answers[currentQ.id]) {
      alert("Tulis jawaban kamu terlebih dahulu.");
      return;
    }
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      submitResponses(answers);
    }
  };

  const submitResponses = async (finalAnswers: Record<string, string>) => {
    if (!profile?.id || !activeSurvey) return;
    setSubmitting(true);
    const supabase = createClient();

    try {
      // Build answers payload: { question_id: { question_text, answer } }
      const answersPayload: Record<string, any> = {};
      questions.forEach(q => {
        answersPayload[q.id] = {
          question_text: q.question_text,
          answer: finalAnswers[q.id] || '',
        };
      });

      const { error } = await supabase
        .from('survey_responses')
        .insert({
          survey_id: activeSurvey.id,
          respondent_id: profile.id,
          student_id: profile.id,
          answers: answersPayload,
        });

      if (error) throw error;

      // Mark this survey as completed today
      setTodayResponseIds(prev => new Set(prev).add(activeSurvey.id));
      setShowResult(true);
    } catch (err: any) {
      console.error("Error submitting response:", err);
      alert(`Gagal mengirim jawaban: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToList = () => {
    setActiveSurvey(null);
    setQuestions([]);
    setCurrentIndex(0);
    setAnswers({});
    setShowResult(false);
  };

  // ── SCORE CALCULATION for scored quizzes ──
  // Score based on option order: option[0]=1pt, option[1]=2pt, option[2]=3pt, option[3]=4pt
  const getScoreResult = () => {
    if (!activeSurvey || (activeSurvey.survey_type !== 'pengetahuan' && activeSurvey.survey_type !== 'sikap')) return null;
    let totalScore = 0;
    const maxScore = questions.length * 4;
    questions.forEach(q => {
      const ans = answers[q.id];
      if (ans && Array.isArray(q.options)) {
        const idx = q.options.indexOf(ans);
        if (idx >= 0) totalScore += idx + 1;
      }
    });
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;
    const conclusion = activeSurvey.survey_type === 'pengetahuan'
      ? (percentage >= 75 ? 'Tinggi' : 'Rendah')
      : (percentage >= 75 ? 'Baik' : 'Buruk');
    return { totalScore, maxScore, percentage, conclusion };
  };

  // ── RESULT SCREEN ──
  if (showResult && activeSurvey) {
    const scoreResult = getScoreResult();
    return (
      <>
        <Header title="Hasil Survei" />
        <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
          <div className="w-28 h-28 bg-green-100 rounded-full flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-20" />
            <CheckCircle2 size={56} className="text-green-500 relative z-10" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Terima Kasih!</h2>
          <p className="text-slate-600 mb-2 text-sm max-w-xs">
            Kamu telah menyelesaikan kuis <strong>{activeSurvey.title}</strong>.
          </p>

          {scoreResult && (
            <div className={`w-full max-w-xs rounded-2xl p-5 mt-4 mb-4 ${
              scoreResult.conclusion === 'Tinggi' || scoreResult.conclusion === 'Baik'
                ? 'bg-green-50 border-2 border-green-300' : 'bg-red-50 border-2 border-red-300'
            }`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">
                {activeSurvey.survey_type === 'pengetahuan' ? 'Skor Pengetahuan' : 'Skor Sikap'}
              </p>
              <p className="text-4xl font-extrabold text-slate-800">{scoreResult.percentage}%</p>
              <p className="text-sm text-slate-500 mt-1">Skor: {scoreResult.totalScore} / {scoreResult.maxScore}</p>
              <p className={`text-lg font-extrabold mt-2 ${
                scoreResult.conclusion === 'Tinggi' || scoreResult.conclusion === 'Baik'
                  ? 'text-green-700' : 'text-red-700'
              }`}>
                Kesimpulan: {scoreResult.conclusion}
              </p>
            </div>
          )}

          <p className="text-xs text-slate-400 mb-8">
            Kuis ini bisa dikerjakan lagi besok.
          </p>
          <Button onClick={handleBackToList} variant="outline" className="w-full max-w-xs">
            Kembali ke Menu Survei
          </Button>
        </div>
      </>
    );
  }

  // ── QUIZ SCREEN ──
  if (activeSurvey && questions.length > 0) {
    const progress = ((currentIndex + 1) / questions.length) * 100;
    const currentQ = questions[currentIndex];

    return (
      <>
        <Header title={activeSurvey.title} />
        <div className="p-6 space-y-6">
          <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
            <span>Pertanyaan {currentIndex + 1} / {questions.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <ProgressBar progress={progress} />

          <Card className="mt-6 shadow-sm border-0">
            <CardContent className="p-6 md:p-8 text-center min-h-[120px] flex items-center justify-center">
              <h3 className="text-lg font-bold text-slate-800 leading-snug">
                {currentQ.question_text}
              </h3>
            </CardContent>
          </Card>

          <div className="grid gap-3 mt-6">
            {currentQ.question_type === 'text' && activeSurvey.survey_type === 'survey' ? (
              <div className="space-y-3">
                <textarea
                  className="w-full border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={4}
                  placeholder="Tulis jawaban kamu di sini..."
                  value={answers[currentQ.id] || ""}
                  onChange={(e) => handleTextAnswer(currentQ.id, e.target.value)}
                ></textarea>
                <Button onClick={submitTextAndNext} className="w-full" disabled={submitting}>
                  {currentIndex < questions.length - 1 ? "Lanjut" : (submitting ? "Mengirim..." : "Selesai & Kirim")}
                </Button>
              </div>
            ) : (() => {
              // Always use question options from admin
              const options: string[] = Array.isArray(currentQ.options) ? currentQ.options : [];

              return options.map((opt: string, idx: number) => (
                <button
                  key={idx}
                  onClick={() => handleAnswer(currentQ.id, opt)}
                  disabled={submitting}
                  className="w-full p-4 text-left border border-slate-200 rounded-xl text-sm font-medium text-slate-700 bg-white hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {opt}
                </button>
              ));
            })()}
          </div>
        </div>
      </>
    );
  }

  // ── LIST SCREEN ──
  return (
    <>
      <Header title="Survei" />
      <div className="p-6 space-y-6 pb-24">
        <div className="mb-2">
          <h2 className="font-extrabold text-slate-800 text-xl">Kuis & Survei</h2>
          <p className="text-slate-500 text-sm mt-1">
            Ayo isi kuis di bawah ini untuk menguji pemahamanmu tentang hidrasi!
          </p>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : surveys.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-slate-300">
            <ClipboardList size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-lg font-bold text-slate-700">Belum ada Kuis</h3>
            <p className="text-sm text-slate-500 mt-1">Admin belum menambahkan kuis saat ini.</p>
          </div>
        ) : (
          surveys.map((survey) => {
            const isCompletedToday = todayResponseIds.has(survey.id);

            return (
              <Card key={survey.id} className={`border-2 transition-all shadow-sm ${isCompletedToday ? 'border-green-400 bg-green-50' : 'border-slate-100'}`}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isCompletedToday ? 'bg-green-100' : 'bg-blue-100'}`}>
                        {isCompletedToday ? (
                          <CheckCircle2 size={22} className="text-green-500" />
                        ) : (
                          <ClipboardList size={20} className="text-blue-600" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800">{survey.title}</h3>
                        {survey.description && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{survey.description}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {isCompletedToday ? (
                    <div className="flex items-center gap-2 bg-green-100 px-3 py-2 rounded-lg">
                      <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                      <p className="text-xs font-semibold text-green-700">Sudah dikerjakan hari ini! Bisa diisi lagi besok.</p>
                    </div>
                  ) : (
                    <Button
                      className="w-full mt-1"
                      variant="primary"
                      onClick={() => handleStartSurvey(survey)}
                      disabled={loadingQuiz}
                    >
                      {loadingQuiz ? "Memuat..." : "Mulai Kuis"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
