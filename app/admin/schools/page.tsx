"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Droplets, Edit3, GraduationCap, Loader2, MapPin, Phone, Plus, School2, Target, Trash2, UserRound, X } from "lucide-react";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { useUserStore } from "../../../store/useUserStore";
import { createClient } from "../../../utils/supabase/client";
import { buildHydrationPeriodSummaries, getAdequacyStatus } from "../../../utils/hydrationInsights";

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

type SchoolStudentProfileRow = {
  full_name: string | null;
  email: string | null;
  username: string | null;
};

type SchoolStudentQueryRow = {
  id: string;
  student_code: string | null;
  class_level: number | null;
  child_order: number | null;
  gender: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  daily_water_target_ml: number | null;
  profiles: SchoolStudentProfileRow | SchoolStudentProfileRow[] | null;
};

type StudentHydrationLog = {
  id: string;
  student_id: string;
  amount_ml: number;
  drink_type: string | null;
  logged_at: string;
};

type SchoolStudentDetail = {
  id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  student_code: string | null;
  class_level: number | null;
  child_order: number | null;
  gender: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  daily_water_target_ml: number | null;
  total_today_ml: number;
  log_count_today: number;
  adequacy_label: string;
  adequacy_class_name: string;
  period_summaries: ReturnType<typeof buildHydrationPeriodSummaries>;
  today_logs: StudentHydrationLog[];
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
  const [isStudentsOpen, setIsStudentsOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolRecord | null>(null);
  const [schoolStudents, setSchoolStudents] = useState<SchoolStudentDetail[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState("");

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

  const handleCloseStudents = () => {
    setIsStudentsOpen(false);
    setSelectedSchool(null);
    setSchoolStudents([]);
    setStudentsError("");
  };

  const handleOpenStudents = async (school: SchoolRecord) => {
    setSelectedSchool(school);
    setIsStudentsOpen(true);
    setLoadingStudents(true);
    setStudentsError("");

    const supabase = createClient();

    try {
      const { data: studentRows, error: studentError } = await supabase
        .from("student_profiles")
        .select(`
          id,
          student_code,
          class_level,
          child_order,
          gender,
          weight_kg,
          height_cm,
          daily_water_target_ml,
          profiles!student_profiles_id_fkey(full_name, email, username)
        `)
        .eq("school_id", school.id)
        .order("created_at", { ascending: true });

      if (studentError) throw studentError;

      const normalizedStudents = ((studentRows as SchoolStudentQueryRow[] | null) || []).map((student) => {
        const profileData = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
        return {
          ...student,
          full_name: profileData?.full_name ?? null,
          email: profileData?.email ?? null,
          username: profileData?.username ?? null,
        };
      });

      const studentIds = normalizedStudents.map((student) => student.id);
      let todayLogs: StudentHydrationLog[] = [];

      if (studentIds.length > 0) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const { data: logsData, error: logsError } = await supabase
          .from("hydration_logs")
          .select("id, student_id, amount_ml, drink_type, logged_at")
          .in("student_id", studentIds)
          .gte("logged_at", startOfToday.toISOString())
          .lte("logged_at", endOfToday.toISOString())
          .order("logged_at", { ascending: false });

        if (logsError) throw logsError;
        todayLogs = (logsData as StudentHydrationLog[] | null) || [];
      }

      const logsByStudent = todayLogs.reduce<Record<string, StudentHydrationLog[]>>((accumulator, log) => {
        if (!accumulator[log.student_id]) {
          accumulator[log.student_id] = [];
        }

        accumulator[log.student_id]?.push(log);
        return accumulator;
      }, {});

      const mappedStudents: SchoolStudentDetail[] = normalizedStudents.map((student) => {
        const studentLogs = logsByStudent[student.id] || [];
        const totalTodayMl = studentLogs.reduce((sum, log) => sum + log.amount_ml, 0);
        const targetMl = student.daily_water_target_ml || 0;
        const adequacy = getAdequacyStatus(totalTodayMl, targetMl);

        return {
          id: student.id,
          full_name: student.full_name,
          email: student.email,
          username: student.username,
          student_code: student.student_code,
          class_level: student.class_level,
          child_order: student.child_order,
          gender: student.gender,
          weight_kg: student.weight_kg,
          height_cm: student.height_cm,
          daily_water_target_ml: targetMl,
          total_today_ml: totalTodayMl,
          log_count_today: studentLogs.length,
          adequacy_label: adequacy.label,
          adequacy_class_name: adequacy.className,
          period_summaries: buildHydrationPeriodSummaries(studentLogs),
          today_logs: studentLogs,
        };
      });

      setSchoolStudents(mappedStudents);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat memuat detail siswa.";
      setStudentsError(message);
      setSchoolStudents([]);
    } finally {
      setLoadingStudents(false);
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

  const renderStudentsModal = () => {
    if (!selectedSchool) return null;

    const adequateCount = schoolStudents.filter((student) => student.adequacy_label === "Adekuat").length;
    const notAdequateCount = schoolStudents.length - adequateCount;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Detail Siswa Sekolah</h3>
              <p className="mt-1 text-sm text-slate-500">
                {selectedSchool.name} • Status hidrasi harian siswa pada {new Date().toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCloseStudents}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Tutup detail siswa sekolah"
            >
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-0 bg-slate-50 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Siswa</p>
                  <p className="mt-2 text-3xl font-extrabold text-slate-800">{schoolStudents.length}</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-emerald-50 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">Adekuat Hari Ini</p>
                  <p className="mt-2 text-3xl font-extrabold text-emerald-700">{adequateCount}</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-rose-50 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-500">Tidak Adekuat</p>
                  <p className="mt-2 text-3xl font-extrabold text-rose-700">{notAdequateCount}</p>
                </CardContent>
              </Card>
            </div>

            {loadingStudents ? (
              <div className="py-16 text-center text-slate-400">Memuat detail siswa...</div>
            ) : studentsError ? (
              <Card className="mt-5 border border-rose-200 bg-rose-50">
                <CardContent className="p-5">
                  <p className="text-sm font-bold text-rose-700">Gagal memuat detail siswa</p>
                  <p className="mt-1 text-sm text-rose-600">{studentsError}</p>
                </CardContent>
              </Card>
            ) : schoolStudents.length === 0 ? (
              <Card className="mt-5 border-0 shadow-sm">
                <CardContent className="py-16 text-center">
                  <GraduationCap size={42} className="mx-auto mb-3 text-slate-300" />
                  <h4 className="text-lg font-bold text-slate-700">Belum ada siswa di sekolah ini</h4>
                  <p className="mt-1 text-sm text-slate-500">Hubungkan siswa ke sekolah ini agar admin bisa melihat progres hidrasi harian mereka.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="mt-5 grid gap-4">
                {schoolStudents.map((student) => {
                  const progress = student.daily_water_target_ml
                    ? Math.min(100, Math.round((student.total_today_ml / student.daily_water_target_ml) * 100))
                    : 0;

                  return (
                    <Card key={student.id} className="border-0 shadow-sm">
                      <CardContent className="p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-lg font-bold text-slate-800">{student.full_name || "Siswa tanpa nama"}</h4>
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${student.adequacy_class_name}`}>
                                {student.adequacy_label}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-2xl bg-slate-50 p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Username</p>
                                <p className="mt-1 text-sm font-semibold text-slate-700">{student.username || "-"}</p>
                              </div>
                              <div className="rounded-2xl bg-slate-50 p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Kode Siswa</p>
                                <p className="mt-1 text-sm font-semibold text-slate-700">{student.student_code || "-"}</p>
                              </div>
                              <div className="rounded-2xl bg-slate-50 p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Kelas</p>
                                <p className="mt-1 text-sm font-semibold text-slate-700">{student.class_level ? `Kelas ${student.class_level}` : "-"}</p>
                              </div>
                              <div className="rounded-2xl bg-slate-50 p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Anak Ke</p>
                                <p className="mt-1 text-sm font-semibold text-slate-700">{student.child_order || "-"}</p>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-3">
                              <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                                <div className="flex items-center gap-2 text-sky-700">
                                  <Droplets size={16} />
                                  <p className="text-xs font-bold uppercase tracking-wider">Cairan Hari Ini</p>
                                </div>
                                <p className="mt-2 text-2xl font-extrabold text-sky-800">{student.total_today_ml} ml</p>
                                <p className="mt-1 text-xs text-sky-700">{student.log_count_today} kali input minum hari ini</p>
                              </div>

                              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                                <div className="flex items-center gap-2 text-amber-700">
                                  <Target size={16} />
                                  <p className="text-xs font-bold uppercase tracking-wider">Target Harian</p>
                                </div>
                                <p className="mt-2 text-2xl font-extrabold text-amber-800">{student.daily_water_target_ml || 0} ml</p>
                                <p className="mt-1 text-xs text-amber-700">Berat {student.weight_kg || 0} kg • Tinggi {student.height_cm || 0} cm</p>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Progress Target</p>
                                <p className="mt-2 text-2xl font-extrabold text-slate-800">{progress}%</p>
                                <div className="mt-3 h-2.5 rounded-full bg-slate-100">
                                  <div
                                    className={`h-2.5 rounded-full transition-all ${student.adequacy_label === "Adekuat" ? "bg-emerald-500" : "bg-blue-500"}`}
                                    style={{ width: `${progress}%` }}
                                  ></div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4">
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Akumulasi Per Waktu</p>
                              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                {student.period_summaries.map((summary) => (
                                  <div key={`${student.id}-${summary.key}`} className={`rounded-2xl border p-3 ${summary.accentClassName}`}>
                                    <p className="text-xs font-bold uppercase tracking-wider">{summary.label}</p>
                                    <p className="mt-1 text-lg font-extrabold">{summary.totalMl} ml</p>
                                    <p className="text-xs opacity-80">{summary.count} log • {summary.range}</p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="mt-4">
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Riwayat Minum Hari Ini</p>
                              {student.today_logs.length === 0 ? (
                                <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                  Belum ada log minum hari ini.
                                </div>
                              ) : (
                                <div className="mt-2 space-y-2">
                                  {student.today_logs.map((log) => (
                                    <div key={log.id} className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-700">{log.drink_type || "Jenis minuman belum diisi"}</p>
                                        <p className="text-xs text-slate-500">
                                          {new Date(log.logged_at).toLocaleTimeString("id-ID", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </p>
                                      </div>
                                      <p className="text-sm font-bold text-slate-700">{log.amount_ml} ml</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="xl:w-52">
                            <Link
                              href={`/admin/activity-detail?id=${student.id}`}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                            >
                              Detail Hidrasi
                              <ArrowRight size={16} />
                            </Link>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

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
                          onClick={() => void handleOpenStudents(school)}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                          title="Lihat detail siswa sekolah"
                        >
                          <GraduationCap size={16} />
                          Detail Siswa
                        </button>
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
      {isStudentsOpen && renderStudentsModal()}
    </>
  );
}
