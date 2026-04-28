"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Edit3, Loader2, MapPin, Phone, Plus, School2, Trash2, UserRound, X } from "lucide-react";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { useUserStore } from "../../../store/useUserStore";
import { createClient } from "../../../utils/supabase/client";

type SchoolRecord = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  contact_person: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
};

type SchoolFormState = {
  name: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  contact_person: string;
  phone: string;
  is_active: boolean;
};

const EMPTY_FORM: SchoolFormState = {
  name: "",
  address: "",
  city: "",
  province: "",
  postal_code: "",
  contact_person: "",
  phone: "",
  is_active: true,
};

export default function AdminSchoolsPage() {
  const { profile } = useUserStore();
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingSchool, setEditingSchool] = useState<SchoolRecord | null>(null);
  const [formData, setFormData] = useState<SchoolFormState>(EMPTY_FORM);
  const [deletingSchoolId, setDeletingSchoolId] = useState<string | null>(null);

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    setSchemaError("");

    const supabase = createClient();
    const { data, error } = await supabase
      .from("schools")
      .select("id, name, address, city, province, postal_code, contact_person, phone, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching schools:", error);
      if (error.code === "42P01") {
        setSchemaError("Tabel `schools` belum tersedia. Jalankan SQL schema sekolah terlebih dahulu agar fitur ini aktif.");
      } else {
        setSchemaError(`Gagal memuat data sekolah: ${error.message}`);
      }
      setSchools([]);
      setLoading(false);
      return;
    }

    setSchools((data as SchoolRecord[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSchools();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchSchools]);

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingSchool(null);
  };

  const handleCloseCreate = () => {
    if (isSubmitting) return;
    setIsCreateOpen(false);
    resetForm();
  };

  const handleCloseEdit = () => {
    if (isSubmitting) return;
    setIsEditOpen(false);
    resetForm();
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (school: SchoolRecord) => {
    setEditingSchool(school);
    setFormData({
      name: school.name || "",
      address: school.address || "",
      city: school.city || "",
      province: school.province || "",
      postal_code: school.postal_code || "",
      contact_person: school.contact_person || "",
      phone: school.phone || "",
      is_active: school.is_active,
    });
    setIsEditOpen(true);
  };

  const buildPayload = () => ({
    name: formData.name.trim(),
    address: formData.address.trim() || null,
    city: formData.city.trim() || null,
    province: formData.province.trim() || null,
    postal_code: formData.postal_code.trim() || null,
    contact_person: formData.contact_person.trim() || null,
    phone: formData.phone.trim() || null,
    is_active: formData.is_active,
  });

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("schools")
        .insert({
          ...buildPayload(),
          created_by: profile?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      setSchools((currentSchools) => [data as SchoolRecord, ...currentSchools]);
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat menambah sekolah.";
      alert(`Gagal menambah sekolah: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingSchool || !formData.name.trim()) return;

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("schools")
        .update(buildPayload())
        .eq("id", editingSchool.id)
        .select()
        .single();

      if (error) throw error;

      setSchools((currentSchools) =>
        currentSchools.map((school) => (school.id === editingSchool.id ? (data as SchoolRecord) : school))
      );
      setIsEditOpen(false);
      resetForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat menyimpan sekolah.";
      alert(`Gagal menyimpan sekolah: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (school: SchoolRecord) => {
    const confirmed = confirm(`Hapus sekolah "${school.name}"?`);
    if (!confirmed) return;

    setDeletingSchoolId(school.id);
    const supabase = createClient();

    try {
      const { error } = await supabase.from("schools").delete().eq("id", school.id);
      if (error) throw error;

      setSchools((currentSchools) => currentSchools.filter((currentSchool) => currentSchool.id !== school.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat menghapus sekolah.";
      alert(`Gagal menghapus sekolah: ${message}`);
    } finally {
      setDeletingSchoolId(null);
    }
  };

  const renderModal = (
    title: string,
    submitLabel: string,
    onSubmit: (event: FormEvent) => Promise<void>,
    onClose: () => void,
  ) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500">Isi data sekolah untuk dipakai pada role siswa dan guru.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Tutup modal sekolah"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Nama Sekolah</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="Contoh: SD Negeri 01 Jakarta"
                required
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Alamat</span>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                rows={3}
                value={formData.address}
                onChange={(event) => setFormData({ ...formData, address: event.target.value })}
                placeholder="Alamat lengkap sekolah"
              ></textarea>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Kota / Kabupaten</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={formData.city}
                onChange={(event) => setFormData({ ...formData, city: event.target.value })}
                placeholder="Kota"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Provinsi</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={formData.province}
                onChange={(event) => setFormData({ ...formData, province: event.target.value })}
                placeholder="Provinsi"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Kode Pos</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={formData.postal_code}
                onChange={(event) => setFormData({ ...formData, postal_code: event.target.value })}
                placeholder="Kode pos"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Kontak Person</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={formData.contact_person}
                onChange={(event) => setFormData({ ...formData, contact_person: event.target.value })}
                placeholder="Nama PIC sekolah"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Nomor Telepon</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={formData.phone}
                onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                placeholder="Nomor sekolah"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={String(formData.is_active)}
                onChange={(event) => setFormData({ ...formData, is_active: event.target.value === "true" })}
              >
                <option value="true">Aktif</option>
                <option value="false">Nonaktif</option>
              </select>
            </label>
          </div>

          <div className="flex gap-3 border-t border-slate-100 bg-slate-50 p-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {isSubmitting ? "Menyimpan..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <AdminHeader title="Manajemen Sekolah" />
      <div className="p-8 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Daftar Sekolah</h2>
            <p className="text-sm text-slate-500 mt-1">Admin dapat menambahkan nama sekolah, alamat, kontak, dan status aktif sekolah.</p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 shadow-sm shadow-blue-500/30"
          >
            <Plus size={18} />
            Tambah Sekolah
          </button>
        </div>

        {schemaError && (
          <Card className="border border-amber-200 bg-amber-50">
            <CardContent className="p-5 flex gap-3">
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="font-bold text-amber-800 text-sm">Schema sekolah belum siap</p>
                <p className="text-sm text-amber-700 mt-1">{schemaError}</p>
                <p className="text-xs text-amber-700/80 mt-2">Kalau Anda mau, setelah ini saya bisa kirim ulang SQL khusus fitur sekolah saja agar tinggal dijalankan.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Sekolah</p>
              <p className="mt-2 text-3xl font-extrabold text-slate-800">{schools.length}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Sekolah Aktif</p>
              <p className="mt-2 text-3xl font-extrabold text-emerald-700">{schools.filter((school) => school.is_active).length}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Sekolah Nonaktif</p>
              <p className="mt-2 text-3xl font-extrabold text-amber-700">{schools.filter((school) => !school.is_active).length}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            {loading ? (
              <div className="py-16 text-center text-slate-400">Memuat data sekolah...</div>
            ) : schools.length === 0 ? (
              <div className="py-16 text-center">
                <School2 size={48} className="mx-auto text-slate-300 mb-3" />
                <h3 className="text-lg font-bold text-slate-700">Belum ada sekolah</h3>
                <p className="text-sm text-slate-500 mt-1">Tambahkan data sekolah terlebih dahulu agar bisa dipakai saat pendaftaran siswa dan guru.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {schools.map((school) => (
                  <div key={school.id} className="p-5 hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-800">{school.name}</h3>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            school.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {school.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="flex items-start gap-2 text-sm text-slate-600">
                            <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <span>{school.address || "Alamat belum diisi"}</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-slate-600">
                            <School2 size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <span>{[school.city, school.province].filter(Boolean).join(", ") || "Kota / provinsi belum diisi"}</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-slate-600">
                            <UserRound size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <span>{school.contact_person || "Kontak person belum diisi"}</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-slate-600">
                            <Phone size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <span>{school.phone || "Nomor telepon belum diisi"}</span>
                          </div>
                        </div>

                        {school.postal_code && (
                          <p className="mt-3 text-xs font-medium text-slate-400">Kode pos: {school.postal_code}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(school)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
                          title="Edit sekolah"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(school)}
                          disabled={deletingSchoolId === school.id}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Hapus sekolah"
                        >
                          {deletingSchoolId === school.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isCreateOpen && renderModal("Tambah Sekolah", "Simpan Sekolah", handleCreate, handleCloseCreate)}
      {isEditOpen && renderModal("Edit Sekolah", "Simpan Perubahan", handleUpdate, handleCloseEdit)}
    </>
  );
}
