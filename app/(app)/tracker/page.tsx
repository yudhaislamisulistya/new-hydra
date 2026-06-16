"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, CheckCircle2, Clock3, Droplets, PlayCircle, Plus, Target } from "lucide-react";
import Link from "next/link";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { useUserStore } from "../../../store/useUserStore";
import { useHydrationStore } from "../../../store/useHydrationStore";
import { calculateRequiredIntake, formatLocalDateKey, type ActivityLevel, type Gender } from "../../../utils/hydrationCalc";
import {
  buildHydrationPeriodSummaries,
  getAdequacyStatus,
  getHydrationPeriod,
} from "../../../utils/hydrationInsights";
import { createClient } from "../../../utils/supabase/client";

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
};

export default function TrackerPage() {
  const { profile } = useUserStore();
  const { addIntake, records } = useHydrationStore();
  const today = formatLocalDateKey(new Date());

  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(getHydrationPeriod(new Date()));
  const [drinkType, setDrinkType] = useState("Air putih/air matang");
  const [volume, setVolume] = useState<number>(250);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("sedang");
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedDateLogs, setSelectedDateLogs] = useState<HydrationLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const fetchSelectedDateLogs = useCallback(async (studentId: string, dateKey: string) => {
    const supabase = createClient();
    const [year, month, day] = dateKey.split("-").map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

    const { data, error } = await supabase
      .from("hydration_logs")
      .select("id, amount_ml, drink_type, logged_at")
      .eq("student_id", studentId)
      .gte("logged_at", startOfDay.toISOString())
      .lt("logged_at", endOfDay.toISOString())
      .order("logged_at", { ascending: false });

    if (error) {
      console.error("Error fetching tracker logs:", error);
      setSelectedDateLogs([]);
    } else {
      setSelectedDateLogs((data as HydrationLogItem[]) || []);
    }

    setLoadingLogs(false);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;

    const timer = window.setTimeout(() => {
      void fetchSelectedDateLogs(profile.id, selectedDate);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchSelectedDateLogs, profile?.id, selectedDate]);

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
    if (profile?.role === "student") {
      return calculateRequiredIntake({
        weight_kg: profile?.weight_kg || 25,
        gender: (profile?.gender || "L") as Gender,
        activity_level: activityLevel,
      });
    }
    return records[selectedDate]?.required_intake_ml || 1500;
  }, [profile?.role, profile?.weight_kg, profile?.gender, activityLevel, records, selectedDate]);

  // Rincian perhitungan kebutuhan cairan (FBB × FG + FA)
  const fbb = (() => {
    const w = profile?.weight_kg || 25;
    if (w <= 10) return 100 * w;
    if (w <= 20) return 1000 + 50 * (w - 10);
    return 1500 + 20 * (w - 20);
  })();
  const fg = profile?.gender === "female" ? 1.0 : 1.05;
  const faMap: Record<ActivityLevel, number> = { rendah: 0, sedang: 375, tinggi: 750 };
  const fa = faMap[activityLevel];

  const handleSave = async () => {
    if (!profile) return;

    const loggedAt = buildSelectedLoggedAtIso(selectedDate, selectedPeriod);

    const isSaved = await addIntake(profile.id, selectedDate, volume, drinkType, dailyTarget, activityLevel, loggedAt);

    if (isSaved) {
      setShowSuccess(true);
      setLoadingLogs(true);
      void fetchSelectedDateLogs(profile.id, selectedDate);
      setTimeout(() => setShowSuccess(false), 2000);
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
      <Header title="Catatan Minum Harian" />
      <div className="p-6 space-y-6 pb-24">
        {showSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl flex items-center gap-3 animate-fade-in-up">
            <CheckCircle2 className="text-green-500" />
            <p className="font-semibold text-sm">Berhasil mencatat minum!</p>
          </div>
        )}

        {/* 1. Aktivitas Hari Ini (FA) */}
        <Card className="border-2 border-blue-100">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={18} className="text-blue-500" />
              <h3 className="font-bold text-slate-800 text-sm">Aktivitas Hari Ini</h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">Pilih aktivitasmu hari ini supaya kebutuhan minum bisa dihitung dengan tepat.</p>
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
          <h3 className="font-bold text-slate-800 text-lg">Tambah Minuman</h3>
          <p className="text-sm text-slate-500 mt-1">Pilih tanggal dulu, lalu catatan akan masuk ke kelompok pagi, siang, sore, atau malam sesuai jam penyimpanan.</p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="w-full flex flex-col gap-1.5">
              <label htmlFor="tracker-date" className="text-sm font-medium text-slate-700">
                Tanggal
              </label>
              <input
                id="tracker-date"
                type="date"
                value={selectedDate}
                max={today}
                onChange={(event) => {
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
              options={DRINK_TYPES}
            />

            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Volume (ml)</label>
              <div className="flex flex-wrap gap-2">
                {DRINK_VOLUMES.map((drinkVolume) => (
                  <button
                    key={drinkVolume}
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

            <Button className="w-full mt-4 gap-2" size="lg" onClick={handleSave}>
              <Plus size={20} />
              Simpan Minum ({volume}ml)
            </Button>
          </CardContent>
        </Card>

        {/* 3. Keseimbangan Cairan Tubuh Kamu */}
        <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 via-white to-cyan-50">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-500">Keseimbangan Cairan Tubuh Kamu</p>
                <h2 className="text-2xl font-extrabold text-slate-800 mt-1">{totalSelectedDate} / {dailyTarget} ml</h2>
                <p className="text-sm text-slate-500 mt-1">Target harian akan dinilai otomatis sebagai baik atau tidak baik.</p>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${adequacyStatus.className}`}>
                {adequacyStatus.label}
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
                <span>FBB (BB: {profile?.weight_kg || 25}kg)</span>
                <span className="font-extrabold text-white">{Math.round(fbb)} ml</span>
              </div>
              <div className="flex justify-between text-blue-50 py-1.5">
                <span>FG ({profile?.gender === "female" ? "Perempuan" : "Laki-laki"})</span>
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

        {/* Navigasi */}
        <div className="flex gap-3">
          <Link
            href="/education"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft size={18} />
            Kembali
          </Link>
          <Link
            href="/survey"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            <CheckCircle2 size={18} />
            Ayo Lanjutkan
          </Link>
        </div>

        {/* Riwayat */}
        <Card className="border border-slate-200">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Riwayat Catatan Hari Ini</h3>
                <p className="text-xs text-slate-500 mt-1">Pembagian otomatis berdasarkan waktu pencatatan pada tanggal yang dipilih.</p>
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
                            <div key={log.id} className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                  <Clock3 size={12} />
                                  <span>{new Date(log.logged_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                                </div>
                                <p className="font-bold text-slate-800 text-sm mt-1">{log.drink_type || "Air putih"}</p>
                              </div>
                              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
                                {log.amount_ml} ml
                              </span>
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
