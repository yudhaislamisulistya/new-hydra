"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { createClient } from "../../../utils/supabase/client";
import { PlaySquare, Plus, Link as LinkIcon, Trash2, Edit, ClipboardList } from "lucide-react";

// Helper to extract YouTube video ID from various YT URL formats
const getYouTubeId = (url: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export default function AdminEducationPage() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    media_url: "",
    survey_id: "",
    target_audience: "all",
    is_published: true,
  });

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    title: "",
    content: "",
    media_url: "",
    survey_id: "",
    target_audience: "all",
    is_published: true,
  });

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      try {
        // Fetch active surveys for the dropdown
        const { data: surveysData } = await supabase
          .from('surveys')
          .select('id, title')
          .eq('is_active', true);

        if (surveysData) setSurveys(surveysData);

        // Fetch education materials
        const { data: eduData, error } = await supabase
          .from('education_materials')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Since we added survey_id column, we merge the survey title manually just to be safe
        if (eduData && surveysData) {
          const merged = eduData.map(item => ({
            ...item,
            survey_title: item.survey_id ? surveysData.find(s => s.id === item.survey_id)?.title : null
          }));
          setMaterials(merged);
        } else {
          setMaterials(eduData || []);
        }
      } catch (error) {
        console.error("Error fetching education data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.media_url) return;

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      // Validate YouTube URL
      const ytId = getYouTubeId(formData.media_url);
      if (!ytId) {
        alert("Link YouTube tidak valid. Harap gunakan link seperti https://www.youtube.com/watch?v=...");
        setIsSubmitting(false);
        return;
      }

      const { data, error } = await supabase
        .from('education_materials')
        .insert([{
          title: formData.title,
          content: formData.content,
          type: 'video', // Force video type for this menu
          media_url: formData.media_url,
          target_audience: formData.target_audience,
          is_published: formData.is_published,
          survey_id: formData.survey_id || null // Attach the quiz!
        }])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        const surveyTitle = formData.survey_id ? surveys.find(s => s.id === formData.survey_id)?.title : null;
        setMaterials([{ ...data[0], survey_title: surveyTitle }, ...materials]);
        setIsModalOpen(false);
        setFormData({
          title: "",
          content: "",
          media_url: "",
          survey_id: "",
          target_audience: "all",
          is_published: true,
        });
      }
    } catch (error: any) {
      console.error("Error creating material:", error);
      alert(`Gagal menyimpan video: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus video edukasi ini?")) return;

    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('education_materials')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setMaterials(materials.filter(m => m.id !== id));
    } catch (error: any) {
      alert(`Gagal menghapus: ${error.message}`);
    }
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setEditFormData({
      title: item.title || '',
      content: item.content || '',
      media_url: item.media_url || '',
      survey_id: item.survey_id || '',
      target_audience: item.target_audience || 'all',
      is_published: item.is_published ?? true,
    });
    setIsEditModalOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editFormData.title || !editFormData.media_url) return;

    const ytId = getYouTubeId(editFormData.media_url);
    if (!ytId) {
      alert("Link YouTube tidak valid.");
      return;
    }

    setIsEditSubmitting(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from('education_materials')
        .update({
          title: editFormData.title,
          content: editFormData.content,
          media_url: editFormData.media_url,
          survey_id: editFormData.survey_id || null,
          target_audience: editFormData.target_audience,
          is_published: editFormData.is_published,
        })
        .eq('id', editingItem.id)
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        const surveyTitle = editFormData.survey_id ? surveys.find(s => s.id === editFormData.survey_id)?.title : null;
        setMaterials(materials.map(m => m.id === editingItem.id ? { ...data[0], survey_title: surveyTitle } : m));
        setIsEditModalOpen(false);
        setEditingItem(null);
      }
    } catch (error: any) {
      alert(`Gagal menyimpan perubahan: ${error.message}`);
    } finally {
      setIsEditSubmitting(false);
    }
  };

  return (
    <>
      <AdminHeader title="Manajemen Video Edukasi" />
      <div className="p-8 space-y-6">

        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Daftar Video Edukasi</h2>
            <p className="text-sm text-slate-500 mt-1">Tambahkan video YouTube beserta kuis pendampingnya.</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm shadow-blue-500/30"
          >
            <Plus size={18} />
            Tambah Video Baru
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading ? (
            <div className="col-span-full py-12 text-center text-slate-400">
              Memuat data video edukasi...
            </div>
          ) : materials.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
              <PlaySquare size={48} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-lg font-bold text-slate-700">Belum ada Video</h3>
              <p className="text-sm text-slate-500 mt-1">Silakan tambah video edukasi pertama Anda.</p>
            </div>
          ) : (
            materials.map((item) => {
              const ytId = getYouTubeId(item.media_url);
              return (
                <Card key={item.id} className="border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  {/* YouTube Embed */}
                  <div className="relative w-full pt-[56.25%] bg-slate-100">
                    {ytId ? (
                      <iframe
                        className="absolute top-0 left-0 w-full h-full"
                        src={`https://www.youtube.com/embed/${ytId}?rel=0`}
                        title={item.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                        Video tidak valid
                      </div>
                    )}
                  </div>

                  <CardContent className="p-5 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex gap-2">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${item.is_published ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                          }`}>
                          {item.is_published ? 'Publik' : 'Draft'}
                        </span>
                        <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">
                          {item.target_audience === 'student' ? 'Siswa' : item.target_audience === 'parent' ? 'Ortu' : 'Semua'}
                        </span>
                      </div>
                    </div>

                    <h3 className="font-bold text-slate-800 text-lg line-clamp-2 mt-1">{item.title}</h3>
                    <p className="text-sm text-slate-500 mt-2 mb-4 line-clamp-3 flex-1">
                      {item.content || "Tidak ada deskripsi"}
                    </p>

                    <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-2 text-sm">
                        <ClipboardList size={16} className={item.survey_id ? "text-purple-500" : "text-slate-300"} />
                        <span className={item.survey_id ? "text-slate-700 font-medium truncate max-w-[200px]" : "text-slate-400 italic"}>
                          {item.survey_title || "Tidak terhubung ke kuis"}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Video"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus Video"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

      </div>

      {/* CREATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800">Tambah Video Edukasi</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <form id="videoForm" onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Judul Video *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Contoh: Manfaat Minum Air Putih di Pagi Hari"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Link YouTube *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LinkIcon size={16} className="text-slate-400" />
                    </div>
                    <input
                      type="url"
                      required
                      value={formData.media_url}
                      onChange={(e) => setFormData({ ...formData, media_url: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </div>
                  {formData.media_url && !getYouTubeId(formData.media_url) && (
                    <p className="text-xs text-red-500 mt-1">Link YouTube tidak dikenali.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Penjelasan singkat materi ini..."
                    rows={4}
                  ></textarea>
                </div>

                <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                  <label className="block text-sm font-bold text-purple-800 mb-2">Tautkan dengan Kuis (Opsional)</label>
                  <select
                    value={formData.survey_id}
                    onChange={(e) => setFormData({ ...formData, survey_id: e.target.value })}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  >
                    <option value="">-- Tidak Terhubung ke Kuis --</option>
                    {surveys.map(s => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                  <p className="text-xs text-purple-600 mt-2">
                    Kuis yang dipilih di atas akan muncul sebagai tantangan bagi *user* setelah mereka menonton video ini.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Target Pengguna</label>
                    <select
                      value={formData.target_audience}
                      onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="student">Siswa / Anak</option>
                      <option value="parent">Orang Tua</option>
                      <option value="all">Semua</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status Publikasi</label>
                    <select
                      value={formData.is_published ? "true" : "false"}
                      onChange={(e) => setFormData({ ...formData, is_published: e.target.value === "true" })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="true">Publik (Langsung Tampil)</option>
                      <option value="false">Draft (Sembunyikan)</option>
                    </select>
                  </div>
                </div>

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
                form="videoForm"
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                disabled={isSubmitting || (formData.media_url !== "" && !getYouTubeId(formData.media_url))}
              >
                {isSubmitting ? "Menyimpan..." : "Simpan Video"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800">Edit Video Edukasi</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>

            <div className="overflow-y-auto p-6">
              <form id="editVideoForm" onSubmit={handleEdit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Judul Video *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.title}
                    onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Link YouTube *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LinkIcon size={16} className="text-slate-400" />
                    </div>
                    <input
                      type="url"
                      required
                      value={editFormData.media_url}
                      onChange={(e) => setEditFormData({ ...editFormData, media_url: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {editFormData.media_url && !getYouTubeId(editFormData.media_url) && (
                    <p className="text-xs text-red-500 mt-1">Link YouTube tidak dikenali.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
                  <textarea
                    value={editFormData.content}
                    onChange={(e) => setEditFormData({ ...editFormData, content: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={4}
                  ></textarea>
                </div>

                <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                  <label className="block text-sm font-bold text-purple-800 mb-2">Tautkan dengan Kuis (Opsional)</label>
                  <select
                    value={editFormData.survey_id}
                    onChange={(e) => setEditFormData({ ...editFormData, survey_id: e.target.value })}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  >
                    <option value="">-- Tidak Terhubung ke Kuis --</option>
                    {surveys.map(s => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Target Pengguna</label>
                    <select
                      value={editFormData.target_audience}
                      onChange={(e) => setEditFormData({ ...editFormData, target_audience: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="student">Siswa / Anak</option>
                      <option value="parent">Orang Tua</option>
                      <option value="all">Semua</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status Publikasi</label>
                    <select
                      value={editFormData.is_published ? "true" : "false"}
                      onChange={(e) => setEditFormData({ ...editFormData, is_published: e.target.value === "true" })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="true">Publik (Langsung Tampil)</option>
                      <option value="false">Draft (Sembunyikan)</option>
                    </select>
                  </div>
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-white shrink-0">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
                disabled={isEditSubmitting}
              >
                Batal
              </button>
              <button
                form="editVideoForm"
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                disabled={isEditSubmitting || (editFormData.media_url !== "" && !getYouTubeId(editFormData.media_url))}
              >
                {isEditSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
