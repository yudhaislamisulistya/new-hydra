"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { createClient } from "../../../utils/supabase/client";
import { ArrowLeft, Plus, Trash2, Download, Users, ChevronDown, ChevronUp, Pencil, BarChart3 } from "lucide-react";
import Link from "next/link";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

type QuizSurvey = {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean | null;
  target_role: string | null;
  survey_type: string | null;
  randomize_questions?: boolean | null;
  randomize_options?: boolean | null;
};

function ManageQuizContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const surveyId = searchParams.get('id');
  
  const [survey, setSurvey] = useState<QuizSurvey | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    question_text: "",
    question_type: "multiple_choice",
    options: '["Ya", "Tidak"]',
  });

  // Edit Quiz Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    randomize_questions: false,
    randomize_options: false,
  });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  // Chart Modal
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);

  const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  // ── Scoring helpers for pengetahuan / sikap ──
  // Score is based on option ORDER: option[0]=1pt, option[1]=2pt, option[2]=3pt, option[3]=4pt
  const getAnswerScore = (q: any, answer: string) => {
    if (!Array.isArray(q.options)) return 0;
    const idx = q.options.indexOf(answer);
    return idx >= 0 ? idx + 1 : 0;
  };

  const calculateScore = (answers: any) => {
    if (!answers || !survey) return null;
    const type = survey.survey_type;
    if (type !== 'pengetahuan' && type !== 'sikap') return null;

    let totalScore = 0;
    const maxScore = questions.length * 4;

    questions.forEach(q => {
      const studentAnswer = answers[q.id]?.answer;
      if (studentAnswer) {
        totalScore += getAnswerScore(q, studentAnswer);
      }
    });

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;

    let conclusion = '';
    if (type === 'pengetahuan') {
      conclusion = percentage >= 75 ? 'Tinggi' : 'Rendah';
    } else {
      conclusion = percentage >= 75 ? 'Baik' : 'Buruk';
    }

    return { totalScore, maxScore, percentage, conclusion };
  };

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      try {
        // Fetch survey
        const { data: surveyData, error: surveyError } = await supabase
          .from('surveys')
          .select('*')
          .eq('id', surveyId)
          .single();
          
        if (surveyError) throw surveyError;
        setSurvey(surveyData);

        // Fetch questions
        const { data: questionsData, error: questionsError } = await supabase
          .from('survey_questions')
          .select('*')
          .eq('survey_id', surveyId)
          .order('order_number', { ascending: true })
          .order('created_at', { ascending: true });
          
        if (questionsError) throw questionsError;
        setQuestions(questionsData || []);

        // Fetch responses for this survey
        const { data: responsesData, error: responsesError } = await supabase
          .from('survey_responses')
          .select('id, respondent_id, student_id, submitted_at, answers')
          .eq('survey_id', surveyId)
          .order('submitted_at', { ascending: false });

        if (responsesError) throw responsesError;

        // Fetch respondent names
        if (responsesData && responsesData.length > 0) {
          const respondentIds = [...new Set(responsesData.map(r => r.respondent_id))];
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', respondentIds);

          const profileMap = (profilesData || []).reduce((acc: any, p: any) => {
            acc[p.id] = p;
            return acc;
          }, {});

          const merged = responsesData.map(r => ({
            ...r,
            respondent_name: profileMap[r.respondent_id]?.full_name || 'Tanpa Nama',
            respondent_email: profileMap[r.respondent_id]?.email || '-',
          }));
          setResponses(merged);
        } else {
          setResponses([]);
        }

      } catch (error) {
        console.error("Error fetching quiz details:", error);
      } finally {
        setLoading(false);
      }
    }

    if (surveyId) fetchData();
  }, [surveyId]);

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.question_text) return;
    
    setIsSubmitting(true);
    const supabase = createClient();
    
    try {
      // Validate options format if multiple_choice
      let parsedOptions = null;
      if (formData.question_type === 'multiple_choice' || formData.question_type === 'scale') {
        try {
          parsedOptions = JSON.parse(formData.options);
          if (!Array.isArray(parsedOptions)) throw new Error("Options must be an array");
        } catch (err) {
          alert("Format Opsi salah. Harus berupa JSON Array. Contoh: [\"Opsi A\", \"Opsi B\"]");
          setIsSubmitting(false);
          return;
        }
      }

      const { data, error } = await supabase
        .from('survey_questions')
        .insert([{
          survey_id: surveyId,
          question_text: formData.question_text,
          question_type: formData.question_type,
          options: parsedOptions,
          order_number: questions.length + 1
        }])
        .select();

      if (error) throw error;
      
      if (data && data.length > 0) {
        setQuestions([...questions, data[0]]);
        setIsModalOpen(false);
        setFormData({
          question_text: "",
          question_type: "multiple_choice",
          options: '["Ya", "Tidak"]',
        });
      }
    } catch (error: any) {
      console.error("Error adding question:", error);
      alert(`Gagal menambah pertanyaan: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus pertanyaan ini?")) return;
    
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('survey_questions')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      setQuestions(questions.filter(q => q.id !== id));
    } catch (error: any) {
      alert(`Gagal menghapus: ${error.message}`);
    }
  };

  // ── Set Correct Answer ──
  const handleSetCorrectAnswer = async (questionId: string, answer: string) => {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('survey_questions')
        .update({ correct_answer: answer })
        .eq('id', questionId);
      if (error) throw error;
      setQuestions(questions.map(q => q.id === questionId ? { ...q, correct_answer: answer } : q));
    } catch (err: any) {
      alert(`Gagal menyimpan jawaban benar: ${err.message}`);
    }
  };

  const isScored = survey?.survey_type === 'pengetahuan' || survey?.survey_type === 'sikap';

  // ── Edit Survey ──
  const handleOpenEdit = () => {
    setEditFormData({
      title: survey?.title || '',
      description: survey?.description || '',
      randomize_questions: Boolean(survey?.randomize_questions),
      randomize_options: Boolean(survey?.randomize_options),
    });
    setIsEditModalOpen(true);
  };

  const handleEditSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFormData.title.trim()) return;
    setIsEditSubmitting(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('surveys')
        .update({
          title: editFormData.title.trim(),
          description: editFormData.description.trim(),
          randomize_questions: editFormData.randomize_questions,
          randomize_options: editFormData.randomize_options,
        })
        .eq('id', surveyId);
      if (error) throw error;
      setSurvey((current) => current ? {
        ...current,
        title: editFormData.title.trim(),
        description: editFormData.description.trim(),
        randomize_questions: editFormData.randomize_questions,
        randomize_options: editFormData.randomize_options,
      } : current);
      setIsEditModalOpen(false);
    } catch (err: any) {
      alert(`Gagal menyimpan: ${err.message}`);
    } finally {
      setIsEditSubmitting(false);
    }
  };

  // ── Delete Survey ──
  const handleDeleteSurvey = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus kuis ini beserta semua pertanyaan dan riwayat pengisiannya? Tindakan ini tidak bisa dibatalkan.')) return;
    const supabase = createClient();
    try {
      const { error } = await supabase.from('surveys').delete().eq('id', surveyId);
      if (error) throw error;
      router.push('/admin/quizzes');
    } catch (err: any) {
      alert(`Gagal menghapus: ${err.message}`);
    }
  };

  // ── Build Chart Data ──
  const getChartDataForQuestion = (q: any) => {
    if (!responses || responses.length === 0) return [];
    const counts: Record<string, number> = {};
    responses.forEach(r => {
      const answer = r.answers?.[q.id]?.answer;
      if (answer) {
        counts[answer] = (counts[answer] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  };

  const handleExportCSV = () => {
    if (responses.length === 0) return;

    const isScored = survey?.survey_type === 'pengetahuan' || survey?.survey_type === 'sikap';

    // Build dynamic headers: fixed columns + one column per question + score columns
    const questionHeaders = questions.map((q, i) => `Pertanyaan ${i + 1}: ${q.question_text}`);
    const scoreHeaders = isScored ? ['Skor', 'Skor Maks', 'Persentase (%)', 'Kesimpulan'] : [];
    const headers = ['No', 'Nama Responden', 'Email', 'Waktu Pengisian', ...questionHeaders, ...scoreHeaders];

    const rows = responses.map((r, idx) => {
      const date = new Date(r.submitted_at);
      const answerCols = questions.map(q => {
        const ans = r.answers?.[q.id]?.answer || '';
        return `"${ans.replace(/"/g, '""')}"`;
      });
      const scoreCols: string[] = [];
      if (isScored) {
        const scoreData = calculateScore(r.answers);
        if (scoreData) {
          scoreCols.push(String(scoreData.totalScore), String(scoreData.maxScore), String(scoreData.percentage), `"${scoreData.conclusion}"`);
        } else {
          scoreCols.push('', '', '', '');
        }
      }
      return [
        idx + 1,
        `"${r.respondent_name}"`,
        `"${r.respondent_email}"`,
        `"${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}"`,
        ...answerCols,
        ...scoreCols,
      ].join(',');
    });

    const csvContent = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','), ...rows].join('\n');
    const safeTitle = (survey?.title || 'kuis').replace(/[^a-zA-Z0-9]/g, '_');
    downloadCSV(csvContent, `riwayat_pengisian_${safeTitle}.csv`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-slate-800">Kuis tidak ditemukan</h2>
        <Link href="/admin/quizzes" className="text-blue-600 hover:underline mt-4 inline-block">Kembali ke Daftar Kuis</Link>
      </div>
    );
  }

  return (
    <>
      <AdminHeader title="Kelola Pertanyaan Kuis" />
      <div className="p-8 space-y-6">
        
        {/* Navigation & Header */}
        <div>
          <Link href="/admin/quizzes" className="text-slate-500 hover:text-slate-800 flex items-center gap-2 mb-4 text-sm font-medium w-fit transition-colors">
            <ArrowLeft size={16} />
            Kembali ke Daftar Kuis
          </Link>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{survey.title}</h2>
              <p className="text-slate-500 mt-1">{survey.description || "Tidak ada deskripsi"}</p>
              <div className="flex gap-2 mt-3">
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                  survey.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {survey.is_active ? 'Status: Aktif' : 'Status: Draft'}
                </span>
                <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">
                  Target: {survey.target_role}
                </span>
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                  survey.survey_type === 'pengetahuan' ? 'bg-purple-100 text-purple-700' :
                  survey.survey_type === 'sikap' ? 'bg-orange-100 text-orange-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {survey.survey_type === 'pengetahuan' ? 'Pengetahuan (Skor)' :
                   survey.survey_type === 'sikap' ? 'Sikap (Skor)' : 'Survei'}
                </span>
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                  survey.randomize_questions ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {survey.randomize_questions ? 'Pertanyaan Acak' : 'Pertanyaan Tetap'}
                </span>
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                  survey.randomize_options ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {survey.randomize_options ? 'Opsi Acak' : 'Opsi Tetap'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleOpenEdit}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <Pencil size={15} />
                Edit
              </button>
              <button
                onClick={() => setIsChartModalOpen(true)}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <BarChart3 size={15} />
                Visualisasi
              </button>
              <button
                onClick={handleDeleteSurvey}
                className="bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <Trash2 size={15} />
                Hapus
              </button>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <Plus size={18} />
                Tambah Pertanyaan
              </button>
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div className="space-y-4">
          <h3 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-2">
            Daftar Pertanyaan ({questions.length})
          </h3>
          
          {questions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <p className="text-slate-500 mb-2">Belum ada pertanyaan di kuis ini.</p>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="text-sm font-bold text-blue-600 hover:underline"
              >
                + Tambah Pertanyaan Pertama
              </button>
            </div>
          ) : (
            questions.map((q, idx) => (
              <Card key={q.id} className="border border-slate-200 shadow-sm">
                <CardContent className="p-5 flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-medium text-slate-800 text-base leading-snug">
                        {q.question_text}
                      </p>
                      <button 
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="text-slate-400 hover:text-red-600 transition-colors p-1"
                        title="Hapus Pertanyaan"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-500 mb-3">
                      Tipe: {q.question_type.replace('_', ' ')}
                    </span>
                    
                    {/* Render Options if any */}
                    {(q.question_type === 'multiple_choice' || q.question_type === 'scale') && Array.isArray(q.options) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {q.options.map((opt: string, i: number) => (
                          <div key={i} className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-slate-50 flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full border-2 border-slate-300 shrink-0"></span>
                            <span className="flex-1">{opt}</span>
                            {isScored && (
                              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Nilai: {i + 1}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Scoring info */}
                    {isScored && Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-[10px] text-blue-700 font-medium">
                          ℹ️ Skor berdasarkan urutan opsi: opsi ke-1 = 1 poin, ke-2 = 2 poin, ke-3 = 3 poin, ke-4 = 4 poin (tertinggi)
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* ── RESPONSE HISTORY SECTION ── */}
        <div className="space-y-4 mt-10">
          <div className="flex justify-between items-center border-b border-slate-200 pb-3">
            <div className="flex items-center gap-3">
              <Users size={20} className="text-slate-600" />
              <h3 className="font-bold text-slate-800 text-lg">
                Riwayat Pengisian ({responses.length})
              </h3>
            </div>
            {responses.length > 0 && (
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <Download size={16} />
                Export CSV
              </button>
            )}
          </div>

          {responses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <Users size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">Belum ada siswa yang mengisi kuis ini.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {responses.map((r, idx) => {
                const date = new Date(r.submitted_at);
                const isExpanded = expandedId === r.id;

                return (
                  <Card key={r.id} className="border border-slate-200 shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      className="w-full p-5 flex justify-between items-center text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{r.respondent_name}</p>
                          <p className="text-xs text-slate-500">{r.respondent_email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {(() => {
                          const scoreData = calculateScore(r.answers);
                          if (scoreData) {
                            return (
                              <div className="text-right mr-2">
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                  scoreData.conclusion === 'Tinggi' || scoreData.conclusion === 'Baik'
                                    ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {scoreData.percentage}% — {scoreData.conclusion}
                                </span>
                                <p className="text-[10px] text-slate-400 mt-1">Skor: {scoreData.totalScore}/{scoreData.maxScore}</p>
                              </div>
                            );
                          }
                          return null;
                        })()}
                        <div className="text-right">
                          <div className="text-sm font-medium text-slate-700">
                            {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="text-xs text-slate-400">
                            {date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp size={18} className="text-slate-400" />
                        ) : (
                          <ChevronDown size={18} className="text-slate-400" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50 p-5 space-y-3">
                        {r.answers && typeof r.answers === 'object' ? (
                          <>
                            {questions.map((q, qIdx) => {
                              const answerData = r.answers[q.id];
                              const pointValue = isScored && answerData?.answer ? getAnswerScore(q, answerData.answer) : null;
                              return (
                                <div key={q.id} className="bg-white rounded-lg p-4 border border-slate-200">
                                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Pertanyaan {qIdx + 1}</p>
                                  <p className="text-sm font-medium text-slate-800 mb-2">{q.question_text}</p>
                                  <div className="flex items-start gap-2">
                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded shrink-0 mt-0.5">Jawaban:</span>
                                    <p className="text-sm text-slate-700">
                                      {answerData?.answer || <span className="italic text-slate-400">Tidak dijawab</span>}
                                    </p>
                                    {pointValue !== null && (
                                      <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded shrink-0 mt-0.5 ml-auto">
                                        Nilai: {pointValue}/4
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {(() => {
                              const scoreData = calculateScore(r.answers);
                              if (!scoreData) return null;
                              return (
                                <div className={`rounded-lg p-4 border-2 ${
                                  scoreData.conclusion === 'Tinggi' || scoreData.conclusion === 'Baik'
                                    ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                                }`}>
                                  <div className="flex justify-between items-center">
                                    <div>
                                      <p className="text-xs font-bold text-slate-500 uppercase">Kesimpulan</p>
                                      <p className={`text-lg font-extrabold ${
                                        scoreData.conclusion === 'Tinggi' || scoreData.conclusion === 'Baik'
                                          ? 'text-green-700' : 'text-red-700'
                                      }`}>
                                        {survey.survey_type === 'pengetahuan' ? 'Pengetahuan' : 'Sikap'}: {scoreData.conclusion}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-2xl font-extrabold text-slate-800">{scoreData.percentage}%</p>
                                      <p className="text-xs text-slate-500">Skor: {scoreData.totalScore} / {scoreData.maxScore}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <p className="text-sm text-slate-400 italic text-center py-4">Data jawaban belum tersedia untuk respons ini.</p>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* CREATE QUESTION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800">Tambah Pertanyaan Baru</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>
            
            <div className="overflow-y-auto p-6">
              <form id="questionForm" onSubmit={handleAddQuestion} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pertanyaan *</label>
                  <textarea 
                    required
                    value={formData.question_text}
                    onChange={(e) => setFormData({...formData, question_text: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Contoh: Apakah anak Anda minum 8 gelas hari ini?"
                    rows={3}
                  ></textarea>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipe Jawaban</label>
                  <select 
                    value={formData.question_type}
                    onChange={(e) => setFormData({...formData, question_type: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="text">Teks Bebas (Isian)</option>
                    <option value="multiple_choice">Pilihan Ganda</option>
                    <option value="scale">Skala (Nilai 1-5, dll)</option>
                  </select>
                </div>

                {(formData.question_type === 'multiple_choice' || formData.question_type === 'scale') && (
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <label className="block text-sm font-bold text-blue-800 mb-2">Opsi Jawaban (Format JSON Array)</label>
                    <p className="text-xs text-blue-600 mb-2">
                      Gunakan kurung siku dan tanda kutip ganda. Contoh: <code>["Ya", "Tidak"]</code> atau <code>["1", "2", "3"]</code>
                    </p>
                    <textarea 
                      required
                      value={formData.options}
                      onChange={(e) => setFormData({...formData, options: e.target.value})}
                      className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      rows={3}
                    ></textarea>
                  </div>
                )}
              </form>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-white shrink-0">
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
                disabled={isSubmitting}
              >
                Batal
              </button>
              <button 
                form="questionForm"
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Menyimpan..." : "Simpan Pertanyaan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT QUIZ MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800">Edit Kuis</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <div className="overflow-y-auto p-6">
              <form id="editSurveyForm" onSubmit={handleEditSurvey} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Judul Kuis *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.title}
                    onChange={(e) => setEditFormData({...editFormData, title: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  ></textarea>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Pengaturan Acak</label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:border-slate-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={editFormData.randomize_questions}
                        onChange={(e) => setEditFormData({ ...editFormData, randomize_questions: e.target.checked })}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-800">Acak Pertanyaan</p>
                        <p className="text-xs text-slate-500 mt-0.5">Urutan pertanyaan akan diacak saat siswa membuka kuis.</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:border-slate-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={editFormData.randomize_options}
                        onChange={(e) => setEditFormData({ ...editFormData, randomize_options: e.target.checked })}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-800">Acak Opsi Jawaban</p>
                        <p className="text-xs text-slate-500 mt-0.5">Urutan pilihan jawaban akan diacak saat siswa membuka kuis.</p>
                      </div>
                    </label>
                  </div>
                </div>
              </form>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-white shrink-0">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50" disabled={isEditSubmitting}>Batal</button>
              <button form="editSurveyForm" type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50" disabled={isEditSubmitting}>
                {isEditSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHART VISUALIZATION MODAL */}
      {isChartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="font-bold text-slate-800">Visualisasi Jawaban</h3>
                <p className="text-xs text-slate-500 mt-0.5">{survey?.title} &bull; {responses.length} responden</p>
              </div>
              <button onClick={() => setIsChartModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto p-6 space-y-8">
              {responses.length === 0 ? (
                <p className="text-center text-slate-400 py-12">Belum ada data pengisian untuk divisualisasikan.</p>
              ) : (
                questions.map((q, qIdx) => {
                  const chartData = getChartDataForQuestion(q);
                  if (chartData.length === 0) return (
                    <div key={q.id} className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                      <p className="text-xs font-bold text-slate-400 uppercase mb-1">Pertanyaan {qIdx + 1}</p>
                      <p className="text-sm font-medium text-slate-800 mb-2">{q.question_text}</p>
                      <p className="text-sm text-slate-400 italic">Belum ada jawaban.</p>
                    </div>
                  );
                  return (
                    <div key={q.id} className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                      <p className="text-xs font-bold text-blue-600 uppercase mb-1">Pertanyaan {qIdx + 1}</p>
                      <p className="text-sm font-bold text-slate-800 mb-4">{q.question_text}</p>
                      <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartData}
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              innerRadius={50}
                              dataKey="value"
                              nameKey="name"
                              label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                              labelLine={true}
                            >
                              {chartData.map((_: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {chartData.map((d: any, i: number) => (
                          <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full border" style={{ borderColor: PIE_COLORS[i % PIE_COLORS.length], color: PIE_COLORS[i % PIE_COLORS.length], backgroundColor: `${PIE_COLORS[i % PIE_COLORS.length]}10` }}>
                            {d.name}: {d.value} orang
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
              <button onClick={() => setIsChartModalOpen(false)} className="w-full px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function ManageQuizPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    }>
      <ManageQuizContent />
    </Suspense>
  );
}
