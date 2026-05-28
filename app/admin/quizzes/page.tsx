"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { createClient } from "../../../utils/supabase/client";
import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";

type SurveySettings = {
  id: string;
  title: string;
  description: string | null;
  target_role: string;
  is_active: boolean | null;
  survey_type: string;
  randomize_questions?: boolean | null;
  randomize_options?: boolean | null;
  survey_questions?: Array<{ count: number }>;
};

export default function AdminQuizzesPage() {
  const [surveys, setSurveys] = useState<SurveySettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    target_role: "student",
    is_active: true,
    survey_type: "survey",
    randomize_questions: false,
    randomize_options: false,
  });

  useEffect(() => {
    async function fetchSurveys() {
      const supabase = createClient();
      try {
        const { data } = await supabase
          .from('surveys')
          .select(`
            *,
            survey_questions (count)
          `)
          .order('created_at', { ascending: false });

        if (data) {
          setSurveys(data);
        }
      } catch (error) {
        console.error("Error fetching surveys:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSurveys();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;
    
    setIsSubmitting(true);
    const supabase = createClient();
    
    try {
      const { data, error } = await supabase
        .from('surveys')
        .insert([{
          title: formData.title,
          description: formData.description || null,
          target_role: formData.target_role,
          is_active: formData.is_active,
          survey_type: formData.survey_type,
          randomize_questions: formData.randomize_questions,
          randomize_options: formData.randomize_options,
        }])
        .select();

      if (error) throw error;
      
      if (data && data.length > 0) {
        // Refresh surveys list by adding the new one
        setSurveys([{ ...data[0], survey_questions: [{ count: 0 }] }, ...surveys]);
        setIsModalOpen(false);
        setFormData({
          title: "",
          description: "",
          target_role: "student",
          is_active: true,
          survey_type: "survey",
          randomize_questions: false,
          randomize_options: false,
        });
      }
    } catch (error: unknown) {
      console.error("Error creating survey:", error);
      alert(`Gagal membuat kuis: ${error instanceof Error ? error.message : "Terjadi kesalahan."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AdminHeader title="Manajemen Kuis / Survei" />
      <div className="p-8 space-y-6">
        
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Daftar Kuis Edukasi</h2>
            <p className="text-sm text-slate-500 mt-1">Kelola kuis dan survei yang akan dijawab oleh siswa atau orang tua.</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm shadow-blue-500/30"
          >
            <Plus size={18} />
            Buat Kuis Baru
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-12 text-center text-slate-400">
              Memuat data kuis...
            </div>
          ) : surveys.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
              <ClipboardList size={48} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-lg font-bold text-slate-700">Belum ada Kuis</h3>
              <p className="text-sm text-slate-500 mt-1">Silakan buat kuis baru untuk memulai.</p>
            </div>
          ) : (
            surveys.map((survey) => (
              <Card key={survey.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      survey.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {survey.is_active ? 'Aktif' : 'Draft'}
                    </span>
                    <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                      Untuk: {survey.target_role === 'student' ? 'Siswa' : survey.target_role === 'parent' ? 'Orang Tua' : 'Semua'}
                    </span>
                  </div>
                  <div className="mb-3">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      survey.survey_type === 'pengetahuan' ? 'bg-purple-100 text-purple-700' :
                      survey.survey_type === 'sikap' ? 'bg-orange-100 text-orange-700' :
                      survey.survey_type === 'kuis' ? 'bg-green-100 text-green-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {survey.survey_type === 'pengetahuan' ? '📊 Pengetahuan (Skor)' :
                       survey.survey_type === 'sikap' ? '📊 Sikap (Skor)' :
                       survey.survey_type === 'kuis' ? '🎯 Kuis Benar/Salah' :
                       '📋 Survei (Tanpa Skor)'}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-800 text-lg mb-2 line-clamp-1" title={survey.title}>
                    {survey.title}
                  </h3>
                  <p className="text-sm text-slate-500 mb-6 line-clamp-2 min-h-[40px]">
                    {survey.description || "Tidak ada deskripsi"}
                  </p>

                  <div className="mb-5 flex flex-wrap gap-2">
                    <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      survey.randomize_questions
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      {survey.randomize_questions ? "Pertanyaan Acak" : "Pertanyaan Tetap"}
                    </span>
                    <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      survey.randomize_options
                        ? "bg-cyan-100 text-cyan-700"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      {survey.randomize_options ? "Opsi Acak" : "Opsi Tetap"}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="text-sm font-medium text-slate-600">
                      {survey.survey_questions?.[0]?.count || 0} Pertanyaan
                    </div>
                    <Link 
                      href={`/admin/manage-quiz?id=${survey.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800 font-bold hover:underline"
                    >
                      Kelola Kuis
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* CREATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Buat Kuis Baru</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Judul Kuis *</label>
                <input 
                  type="text" 
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: Kuis Hidrasi Harian"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Penjelasan singkat tentang kuis ini"
                  rows={3}
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Target Pengguna</label>
                <select 
                  value={formData.target_role}
                  onChange={(e) => setFormData({...formData, target_role: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="student">Siswa / Anak</option>
                  <option value="parent">Orang Tua</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Tipe Kuis</label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.survey_type === 'survey' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                    <input type="radio" name="survey_type" value="survey" checked={formData.survey_type === 'survey'}
                      onChange={() => setFormData({...formData, survey_type: 'survey'})}
                      className="mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">📋 Survei (Tanpa Skor)</p>
                      <p className="text-xs text-slate-500 mt-0.5">Jawaban dikumpulkan tanpa penilaian. Cocok untuk feedback umum.</p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.survey_type === 'pengetahuan' ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                    <input type="radio" name="survey_type" value="pengetahuan" checked={formData.survey_type === 'pengetahuan'}
                      onChange={() => setFormData({...formData, survey_type: 'pengetahuan'})}
                      className="mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">📊 Pengetahuan (Skor 1-4)</p>
                      <p className="text-xs text-slate-500 mt-0.5">Jawaban: Salah(1), Kurang Benar(2), Benar(3), Sangat Benar(4). Kesimpulan: ≥75% Tinggi, &lt;75% Rendah.</p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.survey_type === 'sikap' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                    <input type="radio" name="survey_type" value="sikap" checked={formData.survey_type === 'sikap'}
                      onChange={() => setFormData({...formData, survey_type: 'sikap'})}
                      className="mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">📊 Sikap (Skor 1-4)</p>
                      <p className="text-xs text-slate-500 mt-0.5">Jawaban: Tidak Pernah(1), Jarang(2), Sering(3), Sangat Sering(4). Kesimpulan: ≥75% Baik, &lt;75% Buruk.</p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.survey_type === 'kuis' ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                    <input type="radio" name="survey_type" value="kuis" checked={formData.survey_type === 'kuis'}
                      onChange={() => setFormData({...formData, survey_type: 'kuis'})}
                      className="mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">🎯 Kuis Benar/Salah</p>
                      <p className="text-xs text-slate-500 mt-0.5">Setiap soal punya 1 jawaban benar. Siswa dapat animasi benar/salah seperti kuis interaktif. Skor: jumlah benar ÷ total soal × 100%.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Pengaturan Acak</label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:border-slate-300 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.randomize_questions}
                      onChange={(e) => setFormData({ ...formData, randomize_questions: e.target.checked })}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-800">Acak Pertanyaan</p>
                      <p className="text-xs text-slate-500 mt-0.5">Urutan pertanyaan akan diacak saat kuis dibuka.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:border-slate-300 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.randomize_options}
                      onChange={(e) => setFormData({ ...formData, randomize_options: e.target.checked })}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-800">Acak Opsi Jawaban</p>
                      <p className="text-xs text-slate-500 mt-0.5">Urutan pilihan jawaban akan diacak saat kuis dibuka.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="isActive"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-slate-700">Langsung Aktifkan Kuis</label>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
                  disabled={isSubmitting}
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Kuis"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
