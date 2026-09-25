"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, CheckCircle2, Clock3, Droplets, Pencil, PlayCircle, Plus, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { Header } from "../../../components/layout/Header";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { useUserStore } from "../../../store/useUserStore";
import { useAppStore } from "../../../store/useAppStore";
import { useHydrationStore } from "../../../store/useHydrationStore";
import { calculateRequiredIntake, formatLocalDateKey, type ActivityLevel, type Gender } from "../../../utils/hydrationCalc";
import {
  buildHydrationPeriodSummaries,
  getAdequacyStatus,
  getHydrationPeriod,
} from "../../../utils/hydrationInsights";
import { createClient } from "../../../utils/api/client";
import { getUserRoleLabel } from "../../../utils/authIdentity";

const DRINK_VOLUMES = [100, 125, 150, 200, 250, 350, 500];
const TRACKER_PERIOD_OPTIONS = [
  { value: "pagi", label: "Pagi" },
  { value: "siang", label: "Siang" },
  { value: "sore", label: "Sore" },
  { value: "malam", label: "Malam" },
];

const TRACKER_PERIOD_HOURS: Record<string, number> = {
  pagi: 8,
  siang: 12,
  sore: 16,
  malam: 20,
};

const DRINK_TYPES = [
  { value: "Air putih/air matang", label: "Air putih / Air matang" },
  { value: "Air mineral kemasan", label: "Air mineral kemasan" },
  { value: "Air kelapa", label: "Air kelapa" },
  { value: "Teh tawar (tanpa gula)", label: "Teh tawar (tanpa gula)" },
  { value: "Susu cair murni", label: "Susu cair murni" },
  { value: "Susu cair manis", label: "Susu cair manis" },
  { value: "Susu dan produk susu cair", label: "Susu dan produk susu cair" },
  { value: "Jus buah tanpa gula", label: "Jus buah tanpa gula" },
  { value: "Jus buah berpemanis", label: "Jus buah berpemanis" },
  { value: "Jus buah kemasan", label: "Jus buah kemasan" },
  { value: "Teh manis", label: "Teh manis" },
  { value: "Sirup (air sirup)", label: "Sirup (air sirup)" },
  { value: "Minuman serbuk/sachet", label: "Minuman serbuk/sachet (Nutrisari, teh serbuk, dll)" },
  { value: "Minuman soda/soft drink", label: "Minuman soda / Soft drink" },
  { value: "Minuman isotonik/sport drink", label: "Minuman isotonik / Sport drink" },
];

const ACTIVITY_OPTIONS = [
  { value: "rendah", label: "Rendah", desc: "Duduk, Nonton", fa: 0 },
  { value: "sedang", label: "Sedang", desc: "Main, Sepeda", fa: 375 },
  { value: "tinggi", label: "Tinggi", desc: "Olahraga", fa: 750 },
] as const;

const REINFORCEMENT_VIDEOS = {
  adequate: {
    title: "Video Pesan Penting Saat Keseimbangan Cairan Baik",
    description: "Target minum kamu sudah tercapai. Tonton video ini untuk mempertahankan kebiasaan minum yang baik setiap hari.",
    url: "https://youtu.be/8fSwKbFVc4I",
  },
  inadequate: {
    title: "Video Pesan Penting Saat Keseimbangan Cairan Tidak Baik",
    description: "Target minum kamu belum tercapai. Tonton video ini untuk penguatan tentang pentingnya menambah cairan tubuh.",
    url: "https://youtu.be/hKAyZiVDW-4",
  },
} as const;

const getYouTubeId = (url: string | null) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

type HydrationLogItem = {
  id: string;
  amount_ml: number;
  drink_type: string | null;
  logged_at: string;
  recorded_by_name: string;
  recorded_by_role: string;
};

type AccessibleStudent = {
  id: string;
  name: string;
  student_code: string | null;
  weight_kg: number | null;
  gender: string | null;
  daily_water_target_ml: number | null;
};

type AccessibleStudentQueryRow = Omit<AccessibleStudent, "name"> & {
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
};

const normalizeAccessibleStudents = (rows: AccessibleStudentQueryRow[] | null): AccessibleStudent[] => {
  return (rows || []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      name: profile?.full_name || "Siswa",
      student_code: row.student_code,
      weight_kg: row.weight_kg,
      gender: row.gender,
      daily_water_target_ml: row.daily_water_target_ml,
    };
  }).sort((first, second) => first.name.localeCompare(second.name, "id"));
};

export default function TrackerPage() {
  const { profile } = useUserStore();
  const { selectedDate, setSelectedDate } = useAppStore();
  const hasEducationAccess = profile?.study_group !== "control";
  const { addIntake, fetchLogs } = useHydrationStore();
  const today = formatLocalDateKey(new Date());

  const [students, setStudents] = useState<AccessibleStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(getHydrationPeriod(new Date()));
  const [drinkType, setDrinkType] = useState("Air putih/air matang");
  const [volume, setVolume] = useState<number>(250);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("sedang");
  const [successMessage, setSuccessMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedDateLogs, setSelectedDateLogs] = useState<HydrationLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [editingLog, setEditingLog] = useState<HydrationLogItem | null>(null);
  const [editDate, setEditDate] = useState("");
  const [logsRevision, setLogsRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const mutationInFlight = useRef(false);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [selectedStudentId, students]
  );
  const selectedStudentName = selectedStudent?.name || "siswa";

  useEffect(() => {
    async function fetchAccessibleStudents() {
      if (!profile?.id) return;

      setLoadingStudents(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("student_profiles")
        .select("id, student_code, weight_kg, gender, daily_water_target_ml, profiles!student_profiles_id_fkey(full_name)");

      if (error) {
        console.error("Error fetching accessible students:", error);
        setStudents([]);
        setSelectedStudentId("");
        setSaveError("Daftar siswa tidak dapat dimuat.");
      } else {
        const nextStudents = normalizeAccessibleStudents((data as AccessibleStudentQueryRow[] | null) || null);
        setStudents(nextStudents);
        setSelectedStudentId((current) => {
          if (nextStudents.some((student) => student.id === current)) return current;
          if (profile.role === "student" && nextStudents.some((student) => student.id === profile.id)) return profile.id;
          return nextStudents[0]?.id || "";
        });
      }

      setLoadingStudents(false);
    }

    void fetchAccessibleStudents();
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchSelectedDateLogs() {
      setLoadingLogs(true);
      setSelectedDateLogs([]);
      if (!selectedStudentId || !selectedDate) {
        setLoadingLogs(false);
        return;
      }
      const supabase = createClient();
      const [year, month, day] = selectedDate.split("-").map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

      const { data, error } = await supabase
        .from("hydration_logs")
        .select("id, amount_ml, drink_type, logged_at, recorded_by_name, recorded_by_role")
        .eq("student_id", selectedStudentId)
        .gte("logged_at", startOfDay.toISOString())
        .lt("logged_at", endOfDay.toISOString())
        .order("logged_at", { ascending: false })
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      if (error) {
        console.error("Error fetching tracker logs:", error);
        setSaveError("Catatan minum tidak dapat dimuat. Silakan muat ulang halaman.");
      } else {
        setSelectedDateLogs((data as HydrationLogItem[]) || []);
      }

      setLoadingLogs(false);
    }
    void fetchSelectedDateLogs();
    return () => controller.abort();
  }, [selectedDate, selectedStudentId, logsRevision]);

  const buildSelectedLoggedAtIso = useCallback((dateKey: string, periodKey: string) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    const selectedDateTime = new Date(
      year,
      month - 1,
      day,
      TRACKER_PERIOD_HOURS[periodKey] ?? 8,
      0,
      0,
      0
    );

    return selectedDateTime.toISOString();
  }, []);

  // Target dihitung dari berat badan, jenis kelamin, dan aktivitas hari ini (FBB × FG + FA)
  const dailyTarget = useMemo(() => {
    if (!selectedStudent) return 1500;
    return calculateRequiredIntake({
      weight_kg: selectedStudent.weight_kg || 25,
      gender: (selectedStudent.gender || "L") as Gender,
      activity_level: activityLevel,
    });
  }, [activityLevel, selectedStudent]);

  // Rincian perhitungan kebutuhan cairan (FBB × FG + FA)
  const fbb = (() => {
    const w = selectedStudent?.weight_kg || 25;
    if (w <= 10) return 100 * w;
    if (w <= 20) return 1000 + 50 * (w - 10);
    return 1500 + 20 * (w - 20);
  })();
  const fg = selectedStudent?.gender === "female" ? 1.0 : 1.05;
  const faMap: Record<ActivityLevel, number> = { rendah: 0, sedang: 375, tinggi: 750 };
  const fa = faMap[activityLevel];

  const resetEdit = () => {
    setEditingLog(null);
    setEditDate("");
    setDrinkType("Air putih/air matang");
    setVolume(250);
    setSelectedPeriod(getHydrationPeriod(new Date()));
    setSaveError("");
  };

  const startEdit = (log: HydrationLogItem) => {
    setEditingLog(log);
    setEditDate(formatLocalDateKey(log.logged_at));
    setDrinkType(log.drink_type || "Air putih/air matang");
    setVolume(log.amount_ml);
    setSelectedPeriod(getHydrationPeriod(log.logged_at));
    setSaveError("");
    setSuccessMessage("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  };

  const refreshAfterMutation = () => {
    setLoadingLogs(true);
    setLogsRevision((revision) => revision + 1);
    if (profile?.role === "student" && selectedStudentId === profile.id) {
      void fetchLogs(profile.id, dailyTarget);
    }
  };

  const handleSave = async () => {
    if (!selectedStudentId || mutationInFlight.current) return;
    const dateKey = editingLog ? editDate : selectedDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)
      || formatLocalDateKey(new Date(`${dateKey}T12:00:00`)) !== dateKey || dateKey > today) {
      setSaveError("Pilih tanggal yang valid, paling lambat hari ini.");
      return;
    }
    if (!Number.isInteger(volume) || volume <= 0 || volume > 2147483647 || !drinkType.trim()) {
      setSaveError("Isi jenis minuman dan volume dalam bilangan bulat lebih dari 0 ml.");
      return;
    }
    mutationInFlight.current = true;
    setSaving(true);
    setSaveError("");
    setSuccessMessage("");
    try {
      // Preserve the original time when only the type or amount is corrected.
      const loggedAt = editingLog && dateKey === formatLocalDateKey(editingLog.logged_at)
        && selectedPeriod === getHydrationPeriod(editingLog.logged_at)
        ? editingLog.logged_at
        : buildSelectedLoggedAtIso(dateKey, selectedPeriod);
      if (editingLog) {
        const { error } = await createClient().from("hydration_logs")
          .update({ amount_ml: volume, drink_type: drinkType, logged_at: loggedAt })
          .eq("id", editingLog.id).eq("student_id", selectedStudentId)
          .select("id").single();
        if (error) throw error;
      } else {
        const saved = await addIntake(selectedStudentId, volume, drinkType, loggedAt);
        if (!saved) throw new Error("Insert failed");
      }
      setSuccessMessage(editingLog ? "Catatan minum berhasil diperbarui." : `Berhasil mencatat minum untuk ${selectedStudentName}!`);
      resetEdit();
      setSelectedDate(dateKey);
      refreshAfterMutation();
    } catch (error) {
      console.error("Error saving hydration log:", error);
      setSaveError("Catatan minum gagal disimpan. Periksa koneksi dan hak akses Anda; catatan mungkin sudah dihapus. Silakan muat ulang jika perlu.");
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async (log: HydrationLogItem) => {
    if (!selectedStudentId || mutationInFlight.current) return;
    if (!window.confirm(`Hapus catatan ${log.drink_type || "Air putih"} sebanyak ${log.amount_ml} ml pada ${new Date(log.logged_at).toLocaleString("id-ID")}? Total asupan akan dihitung ulang.`)) return;
    mutationInFlight.current = true;
    setSaving(true);
    setSaveError("");
    setSuccessMessage("");
    try {
      const { error } = await createClient().from("hydration_logs").delete()
        .eq("id", log.id).eq("student_id", selectedStudentId).select("id").single();
      if (error) throw error;
      if (editingLog?.id === log.id) resetEdit();
      setSuccessMessage("Catatan minum berhasil dihapus. Total asupan telah diperbarui.");
      refreshAfterMutation();
    } catch (error) {
      console.error("Error deleting hydration log:", error);
      setSaveError("Catatan minum gagal dihapus. Periksa koneksi dan hak akses Anda; catatan mungkin sudah dihapus. Silakan muat ulang jika perlu.");
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  };

  const totalSelectedDate = useMemo(
    () => selectedDateLogs.reduce((sum, log) => sum + log.amount_ml, 0),
    [selectedDateLogs]
  );
  const adequacyStatus = getAdequacyStatus(totalSelectedDate, dailyTarget);
  const reinforcementVideo = adequacyStatus.isAdequate
    ? REINFORCEMENT_VIDEOS.adequate
    : REINFORCEMENT_VIDEOS.inadequate;
  const reinforcementVideoId = getYouTubeId(reinforcementVideo.url);
  const periodSummaries = useMemo(() => buildHydrationPeriodSummaries(selectedDateLogs), [selectedDateLogs]);
  const logsByPeriod = useMemo(() => ({
    pagi: selectedDateLogs.filter((log) => getHydrationPeriod(log.logged_at) === "pagi"),
    siang: selectedDateLogs.filter((log) => getHydrationPeriod(log.logged_at) === "siang"),
    sore: selectedDateLogs.filter((log) => getHydrationPeriod(log.logged_at) === "sore"),
    malam: selectedDateLogs.filter((log) => getHydrationPeriod(log.logged_at) === "malam"),
  }), [selectedDateLogs]);

  return (
    <>
      {profile?.role === "admin" ? (
        <AdminHeader title="Pengisian Logbook Minum" />
      ) : (
        <Header title="Catatan Minum Harian" />
      )}
      <div className="p-6 space-y-6 pb-24">
        <Card className="border-2 border-cyan-100 bg-cyan-50/60">
          <CardContent className="p-5 space-y-3">
            {profile?.role !== "student" && (
              <Select
                label="Siswa yang Dicatat"
                value={selectedStudentId}
                onChange={(event) => {
                  resetEdit();
                  setSuccessMessage("");
                  setLoadingLogs(true);
                  setSelectedStudentId(event.target.value);
                }}
                disabled={saving || loadingStudents || students.length === 0}
                options={students.map((student) => ({
                  value: student.id,
                  label: student.name + (student.student_code ? " — " + student.student_code : ""),
                }))}
              />
            )}
            {loadingStudents ? (
              <p className="text-sm text-cyan-700">Memuat siswa yang dapat Anda akses...</p>
            ) : selectedStudent ? (
              <div className="text-sm text-cyan-800">
                <p className="font-bold">Logbook minum: {selectedStudent.name}</p>
                <p className="mt-1 text-xs leading-5 text-cyan-700">
                  Pengisi dicatat otomatis sebagai {profile?.nickname || "Pengguna"} ({getUserRoleLabel(profile?.role)}). Identitas ini tidak dapat diubah setelah log tersimpan.
                </p>
              </div>
            ) : (
              <p className="text-sm font-semibold text-amber-700">Belum ada siswa yang terhubung dan dapat dicatat oleh akun ini.</p>
            )}
          </CardContent>
        </Card>

        {successMessage && (
          <div role="status" className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl flex items-center gap-3 animate-fade-in-up">
            <CheckCircle2 className="text-green-500" />
            <p className="font-semibold text-sm">{successMessage}</p>
          </div>
        )}

        {saveError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {saveError}
          </div>
        )}

        {/* 1. Aktivitas Hari Ini (FA) */}
        <Card className="border-2 border-blue-100">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={18} className="text-blue-500" />
              <h3 className="font-bold text-slate-800 text-sm">Aktivitas Hari Ini</h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">Pilih aktivitas {profile?.role === "student" ? "kamu" : selectedStudentName} hari ini supaya kebutuhan minum bisa dihitung dengan tepat.</p>
            <div className="grid grid-cols-3 gap-2">
              {ACTIVITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setActivityLevel(opt.value)}
                  className={`p-3 rounded-xl text-center transition-all ${
                    activityLevel === opt.value
                      ? "bg-blue-500 text-white shadow-md ring-2 ring-blue-300"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <p className="text-sm font-bold">{opt.label}</p>
                  <p className={`text-[10px] mt-0.5 ${activityLevel === opt.value ? "text-blue-100" : "text-slate-400"}`}>{opt.desc}</p>
                  <p className={`text-[10px] font-bold mt-1 ${activityLevel === opt.value ? "text-blue-200" : "text-slate-400"}`}>+{opt.fa} ml</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 2. Tambah Minum */}
        <div>
          <h3 className="font-bold text-slate-800 text-lg">{editingLog ? "Sunting Minuman" : "Tambah Minuman"}</h3>
          <p className="text-sm text-slate-500 mt-1">{editingLog ? "Perbaiki tanggal, waktu, jenis minuman, atau volumenya, lalu simpan perubahan." : "Pilih tanggal dan waktu minum. Jika ada kesalahan, gunakan Sunting atau Hapus pada riwayat di bawah."}</p>
          <a href="#riwayat-minuman" className="mt-2 inline-block text-sm font-semibold text-blue-600 underline">Lihat dan kelola riwayat minuman</a>
        </div>

        <Card>
          <CardContent className="p-6">
            <form ref={formRef} onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
            <fieldset disabled={saving} className="space-y-5">
            <div className="w-full flex flex-col gap-1.5">
              <label htmlFor="tracker-date" className="text-sm font-medium text-slate-700">
                Tanggal
              </label>
              <input
                id="tracker-date"
                type="date"
                value={editingLog ? editDate : selectedDate}
                max={today}
                required
                onChange={(event) => {
                  if (editingLog) {
                    setEditDate(event.target.value);
                    return;
                  }
                  if (!event.target.value) return;
                  setLoadingLogs(true);
                  setSelectedDate(event.target.value);
                }}
                className="flex h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <Select
              label="Waktu"
              value={selectedPeriod}
              onChange={(event) => setSelectedPeriod(event.target.value)}
              options={TRACKER_PERIOD_OPTIONS}
            />

            <Select
              label="Jenis Minuman"
              value={drinkType}
              onChange={(event) => setDrinkType(event.target.value)}
              options={DRINK_TYPES.some((option) => option.value === drinkType) ? DRINK_TYPES : [{ value: drinkType, label: drinkType }, ...DRINK_TYPES]}
              required
            />

            <div>
              <label htmlFor="tracker-volume" className="text-sm font-medium text-slate-700 mb-2 block">Volume (ml)</label>
              <input id="tracker-volume" type="number" min="1" max="2147483647" step="1" required
                value={volume || ""} onChange={(event) => setVolume(Number(event.target.value))}
                className="mb-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex flex-wrap gap-2">
                {DRINK_VOLUMES.map((drinkVolume) => (
                  <button
                    key={drinkVolume}
                    type="button"
                    onClick={() => setVolume(drinkVolume)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      volume === drinkVolume
                        ? "bg-blue-500 text-white shadow-md scale-105"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {drinkVolume}ml
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {editingLog && <Button type="button" variant="outline" onClick={resetEdit}>Batal</Button>}
              <Button type="submit" className="flex-1 gap-2" size="lg" disabled={!selectedStudent || saving || loadingStudents || loadingLogs}>
                {editingLog ? <Pencil size={20} /> : <Plus size={20} />}
                {saving ? "Menyimpan..." : editingLog ? "Simpan Perubahan" : "Simpan Minum (" + volume + "ml)"}
              </Button>
            </div>
            </fieldset>
            </form>
          </CardContent>
        </Card>

        {/* 3. Keseimbangan Cairan Tubuh Kamu */}
        <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 via-white to-cyan-50">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-500">Keseimbangan Cairan Tubuh {profile?.role === "student" ? "Kamu" : selectedStudentName}</p>
                <h2 className="text-2xl font-extrabold text-slate-800 mt-1">{loadingLogs ? "Memuat..." : `${totalSelectedDate} / ${dailyTarget} ml`}</h2>
                <p className="text-sm text-slate-500 mt-1">Target harian akan dinilai otomatis sebagai baik atau tidak baik.</p>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${adequacyStatus.className}`}>
                {loadingLogs ? "Memuat..." : adequacyStatus.label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {periodSummaries.map((summary) => (
                <div key={summary.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${summary.accentClassName}`}>
                      {summary.label}
                    </span>
                    <span className="text-[10px] text-slate-400">{summary.range}</span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-slate-800">{summary.totalMl} ml</p>
                  <p className="text-xs text-slate-500 mt-1">{summary.count} catatan minum</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Target Minum Harian (perhitungan) */}
        <Card className="bg-blue-500 text-white overflow-hidden relative">
          <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full translate-x-1/2 -translate-y-1/2" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <Target size={22} className="text-blue-200" />
              <h2 className="font-bold text-lg">Target Minum Harian</h2>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-base">
              <p className="text-blue-100 font-bold mb-2 text-sm uppercase tracking-wide">Perhitungan: FBB × FG + FA</p>
              <div className="flex justify-between text-blue-50 py-1.5">
                <span>FBB (BB: {selectedStudent?.weight_kg || 25}kg)</span>
                <span className="font-extrabold text-white">{Math.round(fbb)} ml</span>
              </div>
              <div className="flex justify-between text-blue-50 py-1.5">
                <span>FG ({selectedStudent?.gender === "female" ? "Perempuan" : "Laki-laki"})</span>
                <span className="font-extrabold text-white">× {fg}</span>
              </div>
              <div className="flex justify-between text-blue-50 py-1.5">
                <span>FA ({activityLevel})</span>
                <span className="font-extrabold text-white">+ {fa} ml</span>
              </div>
              <div className="flex justify-between border-t border-white/20 mt-2 pt-2 font-extrabold">
                <span>Total Kebutuhan</span>
                <span>{dailyTarget} ml</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Video Pesan Penting Keseimbangan Cairan Tubuh Kamu */}
        {profile?.role === "student" && (
          <>
        {hasEducationAccess && (
          <Card className={`border-2 ${adequacyStatus.isAdequate ? "border-emerald-100 bg-emerald-50/60" : "border-amber-100 bg-amber-50/60"}`}>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-[11px] font-bold uppercase tracking-wider ${adequacyStatus.isAdequate ? "text-emerald-600" : "text-amber-600"}`}>
                  Video Pesan Penting
                </p>
                <h3 className="mt-1 text-lg font-extrabold text-slate-800">{reinforcementVideo.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{reinforcementVideo.description}</p>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${adequacyStatus.className}`}>
                {adequacyStatus.label}
              </span>
            </div>

            {reinforcementVideoId ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="aspect-video w-full">
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube.com/embed/${reinforcementVideoId}?rel=0`}
                    title={reinforcementVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                Link video pesan penting untuk status ini belum diatur. Silakan isi URL YouTube pada konfigurasi tracker agar tombol dan embed video aktif.
              </div>
            )}

            <p className="text-xs text-slate-500">
              Setelah menonton video pesan penting, lanjutkan ke menu Ayo Jawab untuk mengisi pengetahuan dan sikap tentang keseimbangan cairan tubuh.
            </p>
            <Button
              type="button"
              className="gap-2 w-full sm:w-auto"
              onClick={() => {
                if (!reinforcementVideo.url) {
                  alert("Link video pesan penting belum diatur.");
                  return;
                }
                window.open(reinforcementVideo.url, "_blank", "noopener,noreferrer");
              }}
            >
              <PlayCircle size={18} />
              Tonton Video Pesan Penting
            </Button>
          </CardContent>
          </Card>
        )}

        {/* Navigasi */}
        <div className="flex gap-3">
          <Link
            href={hasEducationAccess ? "/education" : "/dashboard"}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft size={18} />
            Kembali
          </Link>
          <Link
            href={`/survey?date=${selectedDate}`}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            <CheckCircle2 size={18} />
            Ayo Lanjutkan
          </Link>
        </div>
          </>
        )}

        {/* Riwayat */}
        <Card className="border border-slate-200">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="riwayat-minuman" className="scroll-mt-24 font-bold text-slate-800 text-base">Riwayat Catatan {selectedStudentName}</h3>
                <p className="text-xs text-slate-500 mt-1">Gunakan Sunting untuk memperbaiki catatan atau Hapus untuk membatalkannya. Total asupan diperbarui otomatis.</p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                <Droplets size={14} />
                {selectedDateLogs.length} catatan
              </div>
            </div>

            {loadingLogs ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                Memuat catatan...
              </div>
            ) : selectedDateLogs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                Belum ada minuman tercatat pada tanggal ini.
              </div>
            ) : (
              <div className="space-y-4">
                {periodSummaries.map((summary) => {
                  const periodLogs = logsByPeriod[summary.key];

                  if (periodLogs.length === 0) {
                    return null;
                  }

                  return (
                    <div key={summary.key} className="rounded-2xl border border-slate-100 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${summary.accentClassName}`}>
                          {summary.label}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">{summary.totalMl} ml</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {periodLogs.map((log) => {
                          return (
                            <div key={log.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                  <Clock3 size={12} />
                                  <span>{new Date(log.logged_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                                </div>
                                <p className="font-bold text-slate-800 text-sm mt-1">{log.drink_type || "Air putih"}</p>
                                <p className="mt-1 text-[11px] font-medium text-slate-500">
                                  Diisi oleh {log.recorded_by_name} ({getUserRoleLabel(log.recorded_by_role)})
                                </p>
                              </div>
                              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
                                {log.amount_ml} ml
                              </span>
                              <div className="flex w-full justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={saving || loadingLogs} onClick={() => startEdit(log)} aria-label={`Sunting ${log.drink_type || "Air putih"} ${log.amount_ml} ml`}>
                                  <Pencil size={14} /> Sunting
                                </Button>
                                <Button type="button" variant="danger" size="sm" className="gap-1.5" disabled={saving || loadingLogs} onClick={() => void handleDelete(log)} aria-label={`Hapus ${log.drink_type || "Air putih"} ${log.amount_ml} ml`}>
                                  <Trash2 size={14} /> Hapus
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
