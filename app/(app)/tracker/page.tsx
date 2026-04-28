"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Droplets, PlayCircle, Plus } from "lucide-react";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { useUserStore } from "../../../store/useUserStore";
import { useHydrationStore } from "../../../store/useHydrationStore";
import { formatLocalDateKey } from "../../../utils/hydrationCalc";
import {
  buildHydrationPeriodSummaries,
  getAdequacyStatus,
  getDrinkBadge,
  getHydrationPeriod,
} from "../../../utils/hydrationInsights";
import { createClient } from "../../../utils/supabase/client";

const DRINK_VOLUMES = [125, 200, 250, 300, 330, 500, 1000];

const DRINK_TYPES = [
  { value: "Air putih/air matang", label: "Air putih / Air matang" },
  { value: "Air mineral kemasan", label: "Air mineral kemasan" },
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

const REINFORCEMENT_VIDEOS = {
  adequate: {
    title: "Video Penegasan Saat Status Adekuat",
    description: "Target minum kamu sudah tercapai. Tonton video ini untuk mempertahankan kebiasaan minum yang baik setiap hari.",
    url: "",
  },
  inadequate: {
    title: "Video Penegasan Saat Status Tidak Adekuat",
    description: "Target minum kamu belum tercapai. Tonton video ini untuk penguatan tentang pentingnya menambah cairan tubuh.",
    url: "",
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
  const [drinkType, setDrinkType] = useState("Air putih/air matang");
  const [volume, setVolume] = useState<number>(250);
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

  const buildSelectedLoggedAtIso = useCallback((dateKey: string) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    const now = new Date();
    const selectedDateTime = new Date(
      year,
      month - 1,
      day,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      0
    );

    return selectedDateTime.toISOString();
  }, []);

  const handleSave = async () => {
    if (!profile) return;

    const selectedDateRecord = records[selectedDate];
    const required = selectedDateRecord?.required_intake_ml || 1500;
    const loggedAt = buildSelectedLoggedAtIso(selectedDate);

    const isSaved = await addIntake(profile.id, selectedDate, volume, drinkType, required, "sedang", loggedAt);

    if (isSaved) {
      setShowSuccess(true);
      setLoadingLogs(true);
      void fetchSelectedDateLogs(profile.id, selectedDate);
      setTimeout(() => setShowSuccess(false), 2000);
    }
  };

  const selectedDateRecord = records[selectedDate];
  const totalSelectedDate = useMemo(
    () => selectedDateLogs.reduce((sum, log) => sum + log.amount_ml, 0),
    [selectedDateLogs]
  );
  const dailyTarget = selectedDateRecord?.required_intake_ml || 1500;
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
  const selectedDrinkBadge = getDrinkBadge(drinkType);

  return (
    <>
      <Header title="Catat Minum" />
      <div className="p-6 space-y-6 pb-24">
        {showSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl flex items-center gap-3 animate-fade-in-up">
            <CheckCircle2 className="text-green-500" />
            <p className="font-semibold text-sm">Berhasil mencatat minum!</p>
          </div>
        )}

        <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 via-white to-cyan-50">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-500">Status Hidrasi Hari Ini</p>
                <h2 className="text-2xl font-extrabold text-slate-800 mt-1">{totalSelectedDate} / {dailyTarget} ml</h2>
                <p className="text-sm text-slate-500 mt-1">Target harian akan dinilai otomatis sebagai adekuat atau tidak adekuat.</p>
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

        <Card className={`border-2 ${adequacyStatus.isAdequate ? "border-emerald-100 bg-emerald-50/60" : "border-amber-100 bg-amber-50/60"}`}>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-[11px] font-bold uppercase tracking-wider ${adequacyStatus.isAdequate ? "text-emerald-600" : "text-amber-600"}`}>
                  Video Penegasan
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
                Link video penegasan untuk status ini belum diatur. Silakan isi URL YouTube pada konfigurasi tracker agar tombol dan embed video aktif.
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Setelah menonton video penegasan, lanjutkan ke menu kuis wajib harian untuk mengisi Kuis Sikap Dehidrasi dan Kuis Pengetahuan Dehidrasi.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => {
                    if (!reinforcementVideo.url) {
                      alert("Link video penegasan belum diatur.");
                      return;
                    }
                    window.open(reinforcementVideo.url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <PlayCircle size={18} />
                  Tonton Video Penegasan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.location.href = "/survey"}
                >
                  <CheckCircle2 size={18} />
                  Lanjut ke Kuis
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

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
              label="Jenis Minuman"
              value={drinkType}
              onChange={(event) => setDrinkType(event.target.value)}
              options={DRINK_TYPES}
            />

            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${selectedDrinkBadge.badgeClassName}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${selectedDrinkBadge.dotClassName}`} />
              Kategori minuman: {selectedDrinkBadge.label}
            </div>

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

        <Card className="border border-slate-200">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Riwayat Tracker Hari Ini</h3>
                <p className="text-xs text-slate-500 mt-1">Pembagian otomatis berdasarkan waktu pencatatan pada tanggal yang dipilih.</p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                <Droplets size={14} />
                {selectedDateLogs.length} log
              </div>
            </div>

            {loadingLogs ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                Memuat tracker...
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
                          const badge = getDrinkBadge(log.drink_type);
                          return (
                            <div key={log.id} className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                  <Clock3 size={12} />
                                  <span>{new Date(log.logged_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                                </div>
                                <p className="font-bold text-slate-800 text-sm mt-1">{log.drink_type || "Air putih"}</p>
                                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.badgeClassName}`}>
                                  {badge.label}
                                </span>
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
