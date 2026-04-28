"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { createClient } from "../../../utils/supabase/client";
import { ArrowLeft, Calendar, Download, Droplets, Printer, Scale, Target } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { calculateBasicFluidNeeds, calculateIntakeFromStoredBaseNeed, formatLocalDateKey, getGenderFactor, type LooseGender } from "../../../utils/hydrationCalc";
import { buildHydrationCorrections, buildHydrationPeriodSummaries, getAdequacyStatus, getDrinkBadge } from "../../../utils/hydrationInsights";

const ADMIN_ACTIVITY_FACTORS = {
  rendah: 0,
  sedang: 275,
  tinggi: 750,
} as const;

type StudentDetail = {
  id: string;
  full_name: string | null;
  email: string | null;
  daily_water_target_ml: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  gender: string | null;
};

type HydrationLog = {
  id: string;
  amount_ml: number;
  drink_type: string | null;
  logged_at: string;
};

type ChartDatum = {
  dateKey: string;
  name: string;
  fullDateLabel: string;
  volume: number;
};

type DetailMode = "range" | "day";
function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateKeyLabel(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatRangeLabel(filterType: string, startDate: Date, endDate: Date) {
  if (filterType === "7days") return "Akumulasi 7 Hari Terakhir";
  if (filterType === "14days") return "Akumulasi 14 Hari Terakhir";
  if (filterType === "1month") return "Akumulasi 30 Hari Terakhir";

  return `Akumulasi ${startDate.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} - ${endDate.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ActivityDetailContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("id");

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [logs, setLogs] = useState<HydrationLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterType, setFilterType] = useState("7days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [detailMode, setDetailMode] = useState<DetailMode>("range");

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", studentId)
          .single();

        if (profileData) {
          const { data: studentData } = await supabase
            .from("student_profiles")
            .select("*")
            .eq("id", studentId)
            .single();

          setStudent({ ...(profileData as StudentDetail), ...(studentData as Partial<StudentDetail>) });
        }

        const { data: logsData, error } = await supabase
          .from("hydration_logs")
          .select("id, amount_ml, drink_type, logged_at")
          .eq("student_id", studentId)
          .order("logged_at", { ascending: false });

        if (error) throw error;

        setLogs((logsData as HydrationLog[]) || []);
      } catch (error) {
        console.error("Error fetching student activity detail:", error);
      } finally {
        setLoading(false);
      }
    }

    if (studentId) {
      void fetchData();
    }
  }, [studentId]);

  const selectedRange = useMemo(() => {
    let daysToShow = 7;
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    if (filterType === "7days") {
      startDate.setDate(endDate.getDate() - 6);
    } else if (filterType === "14days") {
      startDate.setDate(endDate.getDate() - 13);
      daysToShow = 14;
    } else if (filterType === "1month") {
      startDate.setDate(endDate.getDate() - 29);
      daysToShow = 30;
    } else if (filterType === "custom") {
      if (!customStartDate || !customEndDate) {
        return null;
      }

      startDate = new Date(customStartDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      daysToShow = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    if (daysToShow > 90) daysToShow = 90;

    return { startDate, endDate, daysToShow };
  }, [filterType, customEndDate, customStartDate]);

  const filteredLogs = useMemo(() => {
    if (!selectedRange) return [];

    return logs.filter((log) => {
      const logDate = new Date(log.logged_at);
      return logDate >= selectedRange.startDate && logDate <= selectedRange.endDate;
    });
  }, [logs, selectedRange]);

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!selectedRange) return [];

    const { startDate, daysToShow } = selectedRange;

    const dataMap: Record<string, number> = {};
    const labelMap: Record<string, string> = {};

    for (let index = 0; index < daysToShow; index += 1) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + index);
      const key = formatLocalDateKey(day);
      dataMap[key] = 0;
      labelMap[key] =
        daysToShow <= 7
          ? day.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" })
          : day.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    }

    filteredLogs.forEach((log) => {
      const key = formatLocalDateKey(log.logged_at);
      if (dataMap[key] !== undefined) {
        dataMap[key] += log.amount_ml;
      }
    });

    return Object.keys(dataMap).map((key) => ({
      dateKey: key,
      name: labelMap[key],
      fullDateLabel: formatDateKeyLabel(key),
      volume: dataMap[key],
    }));
  }, [filteredLogs, selectedRange]);

  useEffect(() => {
    const latestDay = [...chartData].reverse().find((item) => item.volume > 0) ?? chartData[chartData.length - 1];

    if (!latestDay && selectedDateKey) {
      const timeoutId = window.setTimeout(() => setSelectedDateKey(""), 0);
      return () => window.clearTimeout(timeoutId);
    }

    if (!latestDay || chartData.some((item) => item.dateKey === selectedDateKey)) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSelectedDateKey(latestDay.dateKey), 0);
    return () => window.clearTimeout(timeoutId);
  }, [chartData, selectedDateKey]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-slate-800">Siswa tidak ditemukan</h2>
        <Link href="/admin/activity" className="text-blue-600 hover:underline mt-4 inline-block">
          Kembali ke Daftar Aktivitas
        </Link>
      </div>
    );
  }

  const totalMl = logs.reduce((total, log) => total + log.amount_ml, 0);
  const activeDays = new Set(logs.map((log) => formatLocalDateKey(log.logged_at))).size;
  const averagePerActiveDay = activeDays > 0 ? Math.round(totalMl / activeDays) : 0;
  const weight = student.weight_kg || 25;
  const basicNeed = student.daily_water_target_ml || calculateBasicFluidNeeds(weight);
  const gender = student.gender as LooseGender;
  const genderFactor = getGenderFactor(gender);
  const targetLow = calculateIntakeFromStoredBaseNeed({
    base_need_ml: basicNeed,
    gender,
    activity_level: "rendah",
    customActivityFactor: ADMIN_ACTIVITY_FACTORS,
  });
  const targetMedium = calculateIntakeFromStoredBaseNeed({
    base_need_ml: basicNeed,
    gender,
    activity_level: "sedang",
    customActivityFactor: ADMIN_ACTIVITY_FACTORS,
  });
  const targetHigh = calculateIntakeFromStoredBaseNeed({
    base_need_ml: basicNeed,
    gender,
    activity_level: "tinggi",
    customActivityFactor: ADMIN_ACTIVITY_FACTORS,
  });
  const selectedDayDatum = chartData.find((item) => item.dateKey === selectedDateKey) ?? null;
  const selectedDayLogs = selectedDateKey
    ? filteredLogs.filter((log) => formatLocalDateKey(log.logged_at) === selectedDateKey)
    : [];
  const selectedDayTotal = selectedDayLogs.reduce((total, log) => total + log.amount_ml, 0);
  const selectedDayAdequacy = getAdequacyStatus(selectedDayTotal, targetMedium);
  const selectedDayPeriodSummaries = buildHydrationPeriodSummaries(selectedDayLogs);
  const selectedDayCorrections = buildHydrationCorrections(selectedDayLogs, targetMedium);
  const selectedDateLabel = selectedDayDatum?.fullDateLabel || "Belum ada tanggal dipilih";
  const selectedDateShortLabel = selectedDayDatum?.dateKey || "";
  const dailyDateOptions = chartData.filter((item) => item.volume > 0);
  const rangeTotal = filteredLogs.reduce((total, log) => total + log.amount_ml, 0);
  const rangeAdequacy = getAdequacyStatus(rangeTotal, targetMedium);
  const rangePeriodSummaries = buildHydrationPeriodSummaries(filteredLogs);
  const rangeCorrections = buildHydrationCorrections(filteredLogs, targetMedium);
  const rangeLabel = selectedRange ? formatRangeLabel(filterType, selectedRange.startDate, selectedRange.endDate) : "Akumulasi Rentang";
  const detailTitle = detailMode === "day" ? selectedDateLabel : rangeLabel;
  const exportSuffix = detailMode === "day" ? selectedDateShortLabel || "harian" : filterType === "custom" ? "custom-range" : filterType;
  const detailLogs = detailMode === "day" ? selectedDayLogs : filteredLogs;
  const detailTotal = detailMode === "day" ? selectedDayTotal : rangeTotal;
  const detailAdequacy = detailMode === "day" ? selectedDayAdequacy : rangeAdequacy;
  const detailPeriodSummaries = detailMode === "day" ? selectedDayPeriodSummaries : rangePeriodSummaries;
  const detailCorrections = detailMode === "day" ? selectedDayCorrections : rangeCorrections;

  const handleExportExcel = () => {
    if (!student) return;

    const csvRows = [
      ["Tanggal", "Jam", "Periode", "Jenis Minuman", "Volume (ml)"],
      ...detailLogs.map((log) => {
        const logDate = new Date(log.logged_at);
        const hour = logDate.getHours();
        const period = hour < 11 ? "Pagi" : hour < 15 ? "Siang" : hour < 18 ? "Sore" : "Malam";
        return [
          logDate.toLocaleDateString("id-ID"),
          logDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          period,
          log.drink_type || "Air putih",
          String(log.amount_ml),
        ];
      }),
    ];

    const csvContent = `\uFEFF${csvRows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")}`;
    downloadFile(
      csvContent,
      `hidrasi-${(student.full_name || "siswa").replaceAll(" ", "-").toLowerCase()}-${exportSuffix}.csv`,
      "text/csv;charset=utf-8;"
    );
  };

  const handleExportPdf = () => {
    if (!student) return;

    const html = `
      <html>
        <head>
          <title>Detail Aktivitas Minum</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin-bottom: 4px; }
            p { margin: 4px 0; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #eff6ff; }
            .summary { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
            .chip { border: 1px solid #cbd5e1; border-radius: 999px; padding: 6px 10px; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>${student.full_name || "Tanpa Nama"}</h1>
          <p>Ringkasan aktivitas minum siswa - NEW HYDRA</p>
          <div class="summary">
            <span class="chip">Mode: ${detailTitle}</span>
            <span class="chip">FBB: ${basicNeed} ml</span>
            <span class="chip">Target sedang: ${targetMedium} ml</span>
            <span class="chip">Total: ${detailTotal} ml</span>
            <span class="chip">Status: ${detailAdequacy.label}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Jam</th>
                <th>Jenis Minuman</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              ${detailLogs.map((log) => {
                const logDate = new Date(log.logged_at);
                return `
                  <tr>
                    <td>${logDate.toLocaleDateString("id-ID")}</td>
                    <td>${logDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td>${log.drink_type || "Air putih"}</td>
                    <td>${log.amount_ml} ml</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <>
      <AdminHeader title="Detail Aktivitas Minum" />
      <div className="p-8 space-y-6">
        <div>
          <Link href="/admin/activity" className="text-slate-500 hover:text-slate-800 flex items-center gap-2 mb-4 text-sm font-medium w-fit transition-colors">
            <ArrowLeft size={16} />
            Kembali ke Daftar Siswa
          </Link>

          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{student.full_name || "Tanpa Nama"}</h2>
              <p className="text-slate-500 mt-1">{student.email}</p>
              <div className="flex flex-wrap gap-3 mt-3 text-sm text-slate-600">
                <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full font-medium border border-orange-100">
                  FBB: {basicNeed} ml
                </span>
                <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium border border-blue-100">
                  FG: {genderFactor.toFixed(2)}
                </span>
                <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-medium border border-indigo-100">
                  Sedang: {targetMedium} ml
                </span>
                <span className="bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                  BB: {student.weight_kg || "-"} kg
                </span>
                <span className="bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                  TB: {student.height_cm || "-"} cm
                </span>
              </div>
            </div>

            <div className="text-right">
              <p className="text-sm font-medium text-slate-500">Total Diminum (Sepanjang Waktu)</p>
              <p className="text-3xl font-bold text-blue-600">{(totalMl / 1000).toFixed(1)} L</p>
              <p className="mt-2 text-xs font-medium text-slate-500">
                Mode aktif: <span className="text-slate-700">{detailTitle}</span>
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Download size={14} />
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-100"
                >
                  <Printer size={14} />
                  Export PDF
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-0 shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                <Scale size={24} />
              </div>
              <div>
                <h3 className="text-slate-500 text-sm font-medium">FBB</h3>
                <p className="text-2xl font-bold text-slate-800">{basicNeed} ml</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Target size={24} />
              </div>
              <div>
                <h3 className="text-slate-500 text-sm font-medium">FBB × FG + FA</h3>
                <p className="text-2xl font-bold text-slate-800">{targetMedium} ml</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Rendah: {targetLow} • Sedang: {targetMedium} • Tinggi: {targetHigh}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-600">
                <Droplets size={24} />
              </div>
              <div>
                <h3 className="text-slate-500 text-sm font-medium">Rata-rata per Hari Aktif</h3>
                <p className="text-2xl font-bold text-slate-800">{averagePerActiveDay} ml</p>
                <p className="text-[11px] text-slate-400 mt-1">{activeDays} hari dengan catatan minum</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-0 shadow-md">
            <CardContent className="p-6 h-full flex flex-col">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Grafik Hidrasi</h3>
                  <p className="text-sm text-slate-500 mt-1">Gunakan dropdown harian untuk memilih tanggal tertentu, lalu semua detail akan mengikuti tanggal itu.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {filterType === "custom" && (
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(event) => {
                          setCustomStartDate(event.target.value);
                          setDetailMode("range");
                        }}
                        className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                      />
                      <span className="text-slate-400 text-xs">sd</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(event) => {
                          setCustomEndDate(event.target.value);
                          setDetailMode("range");
                        }}
                        className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                  <select
                    value={filterType}
                    onChange={(event) => {
                      setFilterType(event.target.value);
                      setDetailMode("range");
                    }}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="7days">7 Hari Terakhir</option>
                    <option value="14days">14 Hari Terakhir</option>
                    <option value="1month">1 Bulan Terakhir</option>
                    <option value="custom">Custom Range</option>
                  </select>
                  <select
                    value={detailMode === "day" ? selectedDateKey : ""}
                    onChange={(event) => {
                      const nextDateKey = event.target.value;
                      if (!nextDateKey) {
                        setDetailMode("range");
                        return;
                      }

                      setSelectedDateKey(nextDateKey);
                      setDetailMode("day");
                    }}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white min-w-[220px]"
                  >
                    <option value="">Pilih tanggal harian</option>
                    {dailyDateOptions.map((option) => (
                      <option key={option.dateKey} value={option.dateKey}>
                        {option.fullDateLabel} - {option.volume} ml
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setDetailMode("range")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      detailMode === "range"
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"
                    }`}
                  >
                    Reset ke Akumulasi
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-[250px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} dx={-10} width={40} />
                    <Tooltip
                      cursor={{ fill: "#f8fafc" }}
                      formatter={(value) => [`${value} ml`, "Volume"]}
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullDateLabel || _label}
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    />
                    <Bar
                      dataKey="volume"
                      radius={[4, 4, 0, 0]}
                      barSize={32}
                      name="Volume (ml)"
                      isAnimationActive={false}
                    >
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.dateKey}
                          fill={selectedDateKey === entry.dateKey ? "#0f766e" : entry.volume > 0 ? "#14b8a6" : "#cbd5e1"}
                          stroke={selectedDateKey === entry.dateKey ? "#115e59" : "transparent"}
                          strokeWidth={selectedDateKey === entry.dateKey ? 2 : 0}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mode Tampil</p>
                  <p className="mt-2 text-lg font-bold text-slate-800">{detailMode === "day" ? "Detail Harian" : "Akumulasi Rentang"}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tanggal / Rentang Aktif</p>
                  <p className="mt-2 text-lg font-bold text-slate-800">{detailTitle}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status Aktif</p>
                  <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${detailAdequacy.className}`}>
                    {detailAdequacy.label}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md flex flex-col h-full max-h-[460px]">
            <CardContent className="p-0 flex flex-col h-full">
              <div className="p-6 border-b border-slate-100 flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                  <Droplets size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{detailMode === "day" ? "Riwayat Log Harian" : "Riwayat Log Rentang"}</h3>
                  <p className="text-xs text-slate-500">
                    {detailTitle} • {detailLogs.length} catatan minum
                  </p>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-2">
                {detailLogs.length === 0 ? (
                  <p className="text-sm text-center text-slate-400 py-8">
                    {detailMode === "day" ? "Belum ada riwayat minum pada tanggal ini." : "Belum ada riwayat minum pada rentang ini."}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {detailLogs.map((log) => {
                      const logDate = new Date(log.logged_at);
                      const drinkBadge = getDrinkBadge(log.drink_type);
                      return (
                        <div key={log.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg transition-colors border-b border-slate-50 last:border-0">
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
                              <Calendar size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">
                                {logDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <p className="text-xs text-slate-500 font-medium">
                                  {logDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} • {log.drink_type || "Air Putih"}
                                </p>
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${drinkBadge.badgeClassName}`}>
                                  {drinkBadge.label}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded text-sm">
                            +{log.amount_ml}ml
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Akumulasi per Waktu</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {detailMode === "day"
                      ? `Distribusi catatan minum siswa pada ${selectedDateLabel.toLowerCase()}.`
                      : `Distribusi catatan minum siswa pada ${rangeLabel.toLowerCase()}.`}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${detailAdequacy.className}`}>
                  {detailAdequacy.label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {detailPeriodSummaries.map((summary) => (
                  <div key={summary.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${summary.accentClassName}`}>
                      {summary.label}
                    </span>
                    <p className="mt-3 text-2xl font-extrabold text-slate-800">{summary.totalMl} ml</p>
                    <p className="text-xs text-slate-500 mt-1">{summary.count} catatan • {summary.range}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <h3 className="font-bold text-slate-800 text-lg">Koreksi Otomatis Isian Siswa</h3>
              <p className="text-sm text-slate-500 mt-1">
                Insight ini dibuat dari {detailMode === "day" ? `log pada ${selectedDateLabel.toLowerCase()}` : `akumulasi ${rangeLabel.toLowerCase()}`}, termasuk total volume, waktu isi, dan jenis minuman.
              </p>
              <div className="mt-4 space-y-3">
                {detailCorrections.map((note) => (
                  <div key={note} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {note}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function ActivityDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      }
    >
      <ActivityDetailContent />
    </Suspense>
  );
}
