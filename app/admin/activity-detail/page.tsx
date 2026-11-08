"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { createClient } from "../../../utils/api/client";
import { ArrowLeft, Calendar, Download, Droplets, Printer, Scale, Target } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { calculateBasicFluidNeeds, calculateStudentFluidTarget, formatLocalDateKey, getGenderFactor, type LooseGender } from "../../../utils/hydrationCalc";
import { buildHydrationCorrections, buildHydrationPeriodSummaries, getAdequacyStatus, getHydrationPeriodMeta, getHydrationPeriod } from "../../../utils/hydrationInsights";
import { getUserRoleLabel } from "../../../utils/authIdentity";
import { loadDailyActivities, type ActivityMap } from "../../../utils/dailyActivity";
import { fetchAllRows } from "../../../utils/dataAccess";
import { Pagination } from "../../../components/ui/Pagination";
import { resolveHydrationDate } from "../../../utils/hydrationCalc";
import { buildDailyHydrationSummaries, buildHydrationRange, dailyHydrationCsv, escapeReportHtml, type HydrationRangeType } from "../../../utils/hydrationRange";

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
  recorded_by_name: string;
  recorded_by_role: string;
};

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+07:00`);
}

function formatDateKeyLabel(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
  const today = formatLocalDateKey(new Date());

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [logs, setLogs] = useState<HydrationLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterType, setFilterType] = useState<HydrationRangeType>(searchParams.get("date") ? "daily" : "7days");
  const [customStartDate, setCustomStartDate] = useState(() => buildHydrationRange("7days", today, "", "", today).dates[0]);
  const [customEndDate, setCustomEndDate] = useState(today);
  const [selectedDateKey, setSelectedDateKey] = useState(resolveHydrationDate(searchParams.get("date")));
  const [activities, setActivities] = useState<ActivityMap>({});
  const [logSearch, setLogSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [fetchError, setFetchError] = useState("");
  const [dailySearch, setDailySearch] = useState("");
  const [dailyPage, setDailyPage] = useState(1);

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

        const logsData = await fetchAllRows<HydrationLog>((from, to) => supabase.from("hydration_logs")
          .select("id, amount_ml, drink_type, logged_at, recorded_by_name, recorded_by_role").eq("student_id", studentId)
          .order("logged_at", { ascending: false }).order("id").range(from, to));
        setActivities(await loadDailyActivities([studentId!], "1900-01-01", formatLocalDateKey(new Date())));
        setLogs(logsData);
      } catch (error) {
        console.error("Error fetching student activity detail:", error);
        setFetchError("Riwayat atau aktivitas harian gagal dimuat. Silakan muat ulang halaman.");
      } finally {
        setLoading(false);
      }
    }

    if (studentId) {
      void fetchData();
    }
  }, [studentId]);

  const { range: selectedRange, rangeError } = useMemo(() => {
    try { return { range: buildHydrationRange(filterType, selectedDateKey, customStartDate, customEndDate, today), rangeError: "" }; }
    catch (error) { return { range: null, rangeError: error instanceof Error ? error.message : "Rentang tanggal tidak valid." }; }
  }, [filterType, customEndDate, customStartDate, selectedDateKey, today]);

  const filteredLogs = useMemo(() => {
    if (!selectedRange) return [];

    return logs.filter((log) => {
      const logDate = new Date(log.logged_at);
      return logDate >= selectedRange.startDate && logDate <= selectedRange.endDate;
    });
  }, [logs, selectedRange]);

  const chartData = useMemo(() => {
    if (!selectedRange || !student) return [];
    return buildDailyHydrationSummaries(filteredLogs, student, activities, selectedRange.dates).map((day) => ({
      ...day,
      name: parseDateKey(day.dateKey).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" }),
      fullDateLabel: formatDateKeyLabel(day.dateKey),
    }));
  }, [filteredLogs, selectedRange, student, activities]);

  useEffect(() => {
    if (!selectedRange || selectedRange.dates.includes(selectedDateKey)) return;
    const timeoutId = window.setTimeout(() => { setSelectedDateKey(selectedRange.dates.at(-1)!); setLogPage(1); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [selectedRange, selectedDateKey]);

  if (fetchError) return <p role="alert" className="p-8 text-red-700">{fetchError}</p>;
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
  const rangeTotal = filteredLogs.reduce((total, log) => total + log.amount_ml, 0);
  const activeDays = chartData.filter((day) => day.logs.length > 0).length;
  const averagePerActiveDay = activeDays > 0 ? Math.round(rangeTotal / activeDays) : 0;
  const weight = student.weight_kg || 25;
  const basicNeed = student.weight_kg ? calculateBasicFluidNeeds(weight) : student.daily_water_target_ml || calculateBasicFluidNeeds(weight);
  const gender = student.gender as LooseGender;
  const genderFactor = getGenderFactor(gender);
  const targetLow = calculateStudentFluidTarget(student, "rendah");
  const targetMedium = calculateStudentFluidTarget(student, "sedang");
  const targetHigh = calculateStudentFluidTarget(student, "tinggi");
  const selectedDayDatum = chartData.find((item) => item.dateKey === selectedDateKey) ?? null;
  const selectedActivity = selectedDayDatum?.activityLevel || "sedang";
  const selectedTarget = selectedDayDatum?.requiredMl || calculateStudentFluidTarget(student, selectedActivity);
  const selectedDayLogs = selectedDayDatum?.logs || [];
  const selectedDayTotal = selectedDayLogs.reduce((total, log) => total + log.amount_ml, 0);
  const selectedDayAdequacy = selectedDayDatum?.status || { ...getAdequacyStatus(0, selectedTarget), label: "Pilih rentang valid", className: "border border-slate-200 bg-slate-100 text-slate-600" };
  const selectedDayPeriodSummaries = buildHydrationPeriodSummaries(selectedDayLogs);
  const selectedDayCorrections = selectedDayLogs.length ? buildHydrationCorrections(selectedDayLogs, selectedTarget) : ["Belum ada catatan minum untuk tanggal ini. Status hidrasi belum dapat dinilai dari catatan."];
  const selectedDateLabel = selectedDayDatum?.fullDateLabel || "Belum ada tanggal dipilih";
  const dailyDateOptions = chartData;
  const rangeLabel = selectedRange ? `${formatDateKeyLabel(selectedRange.dates[0])} – ${formatDateKeyLabel(selectedRange.dates.at(-1)!)}` : "Pilih rentang yang valid";
  const detailTitle = selectedDateLabel;
  const exportSuffix = selectedRange ? `${selectedRange.dates[0]}_${selectedRange.dates.at(-1)}` : "harian";
  const detailLogs = selectedDayLogs;
  const detailTotal = selectedDayTotal;
  const detailTarget = selectedTarget;
  const searchedLogs = detailLogs.filter((log) => `${log.drink_type || ""} ${log.recorded_by_name} ${getUserRoleLabel(log.recorded_by_role)} ${log.amount_ml}`.toLocaleLowerCase("id-ID").includes(logSearch.trim().toLocaleLowerCase("id-ID")));
  const safeLogPage = Math.min(logPage, Math.max(1, Math.ceil(searchedLogs.length / 10)));
  const detailAdequacy = selectedDayAdequacy;
  const detailPeriodSummaries = selectedDayPeriodSummaries;
  const detailCorrections = selectedDayCorrections;
  const searchedDays = chartData.filter((day) => `${day.dateKey} ${day.fullDateLabel} ${day.activityLevel} ${day.status.label}`.toLocaleLowerCase("id-ID").includes(dailySearch.trim().toLocaleLowerCase("id-ID")));
  const safeDailyPage = Math.min(dailyPage, Math.max(1, Math.ceil(searchedDays.length / 10)));

  const handleExportExcel = () => {
    if (!student || !selectedRange) return;
    downloadFile(dailyHydrationCsv(chartData), `ringkasan-hidrasi-harian-${exportSuffix}.csv`, "text/csv;charset=utf-8;");
  };

  const handleExportLogs = () => {
    if (!student || !selectedRange) return;
    const summaries = new Map(chartData.map((day) => [day.dateKey, day]));
    const csvRows = [
      ["Tanggal", "Jam (WIB)", "Periode", "Jenis Minuman", "Volume (ml)", "Pengisi", "Peran Pengisi", "Aktivitas Harian", "Kebutuhan Harian (ml)", "Status Harian"],
      ...[...filteredLogs].sort((first, second) => first.logged_at.localeCompare(second.logged_at)).map((log) => {
        const logDate = new Date(log.logged_at);
        const day = summaries.get(formatLocalDateKey(logDate))!;
        return [
          logDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" }),
          logDate.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }),
          getHydrationPeriodMeta(getHydrationPeriod(logDate)).label,
          log.drink_type || "Air putih",
          String(log.amount_ml),
          log.recorded_by_name,
          getUserRoleLabel(log.recorded_by_role),
          day.activityLevel,
          String(day.requiredMl),
          day.status.label,
        ];
      }),
    ];

    const csvContent = `\uFEFF${csvRows.map((row) => row.map((cell) => `"${(/^[=+@\-\t\r]/.test(String(cell)) ? "'" : "") + String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")}`;
    downloadFile(
      csvContent,
      `catatan-minum-${exportSuffix}.csv`,
      "text/csv;charset=utf-8;"
    );
  };

  const handleExportPdf = () => {
    if (!student || !selectedRange) return;

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
          <h1>${escapeReportHtml(student.full_name || "Tanpa Nama")}</h1>
          <p>Ringkasan aktivitas minum siswa - NEW HYDRA</p>
          <p>Rentang: ${escapeReportHtml(rangeLabel)}. Status dihitung terpisah untuk setiap tanggal.</p>
          <table>
            <thead><tr><th>Tanggal</th><th>Aktivitas</th><th>Total Asupan</th><th>Kebutuhan Harian</th><th>Status Harian</th></tr></thead>
            <tbody>${chartData.map((day) => `<tr><td>${escapeReportHtml(day.fullDateLabel)}</td><td>${day.activityLevel}${day.isEstimated ? " (perkiraan)" : ""}</td><td>${day.volume} ml</td><td>${day.requiredMl} ml</td><td>${day.status.label}</td></tr>`).join("")}</tbody>
          </table>
          <h2>Detail harian: ${escapeReportHtml(detailTitle)}</h2>
          <div class="summary">
            <span class="chip">Tanggal: ${escapeReportHtml(detailTitle)}</span>
            <span class="chip">FBB: ${basicNeed} ml</span>
            <span class="chip">Total kebutuhan harian: ${detailTarget} ml</span>
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
                <th>Pengisi</th>
              </tr>
            </thead>
            <tbody>
              ${detailLogs.map((log) => {
                const logDate = new Date(log.logged_at);
                return `
                  <tr>
                    <td>${logDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                    <td>${logDate.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>${escapeReportHtml(log.drink_type || "Air putih")}</td>
                    <td>${log.amount_ml} ml</td>
                    <td>${escapeReportHtml(log.recorded_by_name)} (${escapeReportHtml(getUserRoleLabel(log.recorded_by_role))})</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) { window.alert("Izinkan jendela cetak pada browser untuk mengekspor PDF."); return; }
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
                  Aktivitas {selectedActivity}: {selectedTarget} ml
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
              <p className="text-sm font-medium text-slate-500">Total Volume dalam Rentang (bukan status gabungan)</p>
              <p className="text-3xl font-bold text-blue-600">{(rangeTotal / 1000).toFixed(1)} L</p>
              <p className="text-xs text-slate-400">Sepanjang waktu: {(totalMl / 1000).toFixed(1)} L</p>
              <p className="mt-2 text-xs font-medium text-slate-500">
                Mode aktif: <span className="text-slate-700">{detailTitle}</span>
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={!selectedRange}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Download size={14} />
                  Ekspor Ringkasan Harian (CSV)
                </button>
                <button type="button" onClick={handleExportLogs} disabled={!selectedRange} className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40"><Download size={14} />Ekspor Catatan Rentang (CSV)</button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={!selectedRange}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-100"
                >
                  <Printer size={14} />
                  Ekspor PDF
                </button>
              </div>
            </div>
          </div>
        </div>

        <div id="detail-hidrasi-harian" className="scroll-mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <p className="text-2xl font-bold text-slate-800">{selectedTarget} ml</p>
                <p className="text-xs text-blue-700">Aktivitas {selectedActivity}{activities[`${student.id}:${selectedDateKey}`]?.is_estimated === false ? " (tersimpan)" : " (perkiraan)"}</p>
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
                  <p className="text-sm text-slate-500 mt-1">Pilih rentang waktu untuk menampilkan grafik dan ringkasan per tanggal. Detail, kebutuhan, dan status tetap dihitung per hari, bukan digabung.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600">Rentang waktu
                    <select aria-label="Rentang waktu aktivitas" value={filterType} onChange={(event) => { setFilterType(event.target.value as HydrationRangeType); setDailyPage(1); setLogPage(1); }} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                      <option value="daily">Satu Hari</option><option value="7days">7 Hari Terakhir</option><option value="14days">14 Hari Terakhir</option><option value="1month">30 Hari Terakhir</option><option value="custom">Rentang Khusus</option>
                    </select>
                  </label>
                  {filterType === "custom" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs text-slate-600">Tanggal mulai
                      <input
                        aria-label="Tanggal mulai rentang"
                        type="date"
                        value={customStartDate}
                        min="1900-01-01"
                        max={customEndDate || today}
                        onChange={(event) => {
                          setCustomStartDate(event.target.value);
                          setDailyPage(1); setLogPage(1);
                        }}
                        className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                      />
                      </label>
                      <label className="text-xs text-slate-600">Tanggal akhir
                      <input
                        aria-label="Tanggal akhir rentang"
                        type="date"
                        value={customEndDate}
                        min={customStartDate || "1900-01-01"}
                        max={today}
                        onChange={(event) => {
                          setCustomEndDate(event.target.value);
                          setDailyPage(1); setLogPage(1);
                        }}
                        className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                      />
                      </label>
                    </div>
                  )}
                  {filterType === "daily" && <input aria-label="Tanggal catatan minum" type="date" min="1900-01-01" value={selectedDateKey} max={today} onChange={(event) => { if (event.target.value) { setSelectedDateKey(event.target.value); setLogPage(1); } }} className="rounded-lg border border-slate-200 p-2 text-sm" />}
                  <select
                    aria-label="Tanggal detail harian"
                    disabled={!selectedRange}
                    value={selectedDayDatum?.dateKey || ""}
                    onChange={(event) => {
                      const nextDateKey = event.target.value;
                      if (!nextDateKey) return;
                      setSelectedDateKey(nextDateKey);
                      setLogPage(1);
                    }}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white min-w-[220px]"
                  >
                    {!selectedDayDatum && <option value="">Pilih tanggal dalam rentang</option>}
                    {dailyDateOptions.map((option) => (
                      <option key={option.dateKey} value={option.dateKey}>
                        {option.fullDateLabel} — {option.logs.length ? `${option.volume} ml` : "Belum ada catatan"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {rangeError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{rangeError}</p>}
              <p className="mb-3 text-xs text-slate-500">Rentang aktif: {rangeLabel}. Rentang khusus maksimal 90 hari; seluruh tanggal tetap ditampilkan, termasuk hari tanpa catatan.</p>

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
                      barSize={chartData.length > 30 ? 6 : chartData.length > 14 ? 12 : 24}
                      name="Volume (ml)"
                      isAnimationActive={false}
                    >
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.dateKey}
                          onClick={() => { setSelectedDateKey(entry.dateKey); setLogPage(1); }}
                          cursor="pointer"
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
                  <p className="mt-2 text-lg font-bold text-slate-800">Detail Harian</p>
                  <p className="mt-1 text-xs text-slate-500">Tidak ada penilaian hidrasi gabungan rentang.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tanggal / Rentang Aktif</p>
                  <p className="mt-2 text-lg font-bold text-slate-800">{detailTitle}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status Aktif</p>
                  <p className="mt-2 text-xs text-slate-500">{detailTotal} / {detailTarget} ml total kebutuhan (aktivitas {selectedActivity})</p>
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
                  <h3 className="font-bold text-slate-800">Riwayat Log Harian</h3>
                  <p className="text-xs text-slate-500">
                    {detailTitle} • {detailLogs.length} catatan minum
                  </p>
                </div>
              </div>

              <Pagination page={logPage} total={searchedLogs.length} onChange={setLogPage} />
              <div className="overflow-y-auto flex-1 p-2">
                <input aria-label="Cari riwayat minum" placeholder="Cari minuman, pengisi, peran, atau volume..." value={logSearch} onChange={(event) => { setLogSearch(event.target.value); setLogPage(1); }} className="mb-3 w-full rounded-lg border p-3 text-sm" />
                {detailLogs.length === 0 ? (
                  <p className="text-sm text-center text-slate-400 py-8">
                    Belum ada riwayat minum pada tanggal ini.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {searchedLogs.slice((safeLogPage - 1) * 10, safeLogPage * 10).map((log) => {
                      const logDate = new Date(log.logged_at);
                      return (
                        <div key={log.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg transition-colors border-b border-slate-50 last:border-0">
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
                              <Calendar size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">
                                {logDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" })}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 font-medium">
                                {logDate.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} • {log.drink_type || "Air Putih"}
                              </p>
                              <p className="mt-1 text-[11px] font-medium text-slate-400">
                                Diisi oleh {log.recorded_by_name} ({getUserRoleLabel(log.recorded_by_role)})
                              </p>
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

        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <div className="space-y-3 p-6">
              <h3 className="text-lg font-bold text-slate-800">Ringkasan Aktivitas per Hari</h3>
              <p className="text-sm text-slate-500">{rangeLabel}. Setiap tanggal menggunakan aktivitas dan Total Kebutuhan pada hari tersebut. Pilih Lihat Harian untuk membuka rinciannya.</p>
              <input aria-label="Cari ringkasan harian" placeholder="Cari tanggal, aktivitas, atau status..." value={dailySearch} onChange={(event) => { setDailySearch(event.target.value); setDailyPage(1); }} className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
            </div>
            <div tabIndex={0} aria-label="Ringkasan hidrasi per tanggal" className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Tanggal", "Aktivitas", "Asupan", "Total Kebutuhan", "Jumlah Catatan", "Status Harian", "Detail"].map((title) => <th key={title} className="whitespace-nowrap px-4 py-3">{title}</th>)}</tr></thead>
                <tbody>
                  {!searchedDays.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">{rangeError || "Tidak ada tanggal yang sesuai pencarian."}</td></tr>}
                  {searchedDays.slice((safeDailyPage - 1) * 10, safeDailyPage * 10).map((day) => <tr key={day.dateKey} className={`border-t border-slate-100 ${selectedDateKey === day.dateKey ? "bg-blue-50" : "bg-white"}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">{day.fullDateLabel}</td>
                    <td className="px-4 py-3 capitalize">{day.activityLevel}<span className="block text-xs normal-case text-slate-500">{day.isEstimated ? "Perkiraan" : "Tersimpan"}</span></td>
                    <td className="whitespace-nowrap px-4 py-3">{day.volume} ml</td><td className="whitespace-nowrap px-4 py-3">{day.requiredMl} ml</td><td className="px-4 py-3">{day.logs.length}</td>
                    <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${day.status.className}`}>{day.status.label}</span></td>
                    <td className="px-4 py-3"><button type="button" aria-label={`Lihat harian ${day.dateKey}`} onClick={() => { setSelectedDateKey(day.dateKey); setLogPage(1); document.getElementById("detail-hidrasi-harian")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="whitespace-nowrap rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Lihat Harian</button></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <Pagination page={dailyPage} total={searchedDays.length} onChange={setDailyPage} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Distribusi Waktu pada Hari Pilihan</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Distribusi catatan minum siswa pada {selectedDateLabel.toLowerCase()}.
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
                Ringkasan ini dibuat hanya dari catatan pada {selectedDateLabel.toLowerCase()}, termasuk total volume, waktu isi, dan jenis minuman. Catatan hari lain tidak ikut menentukan status hari ini.
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
