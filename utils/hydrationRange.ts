import { calculateStudentFluidTarget, formatLocalDateKey, resolveHydrationDate } from "./hydrationCalc";
import { getAdequacyStatus, type HydrationLogLike } from "./hydrationInsights";
import type { ActivityMap } from "./dailyActivity";

export type HydrationRangeType = "daily" | "7days" | "14days" | "1month" | "custom";
export const MAX_HYDRATION_RANGE_DAYS = 90;
const DAY_MS = 86400000;

export function buildHydrationRange(type: HydrationRangeType, selectedDate: string, customStart: string, customEnd: string, today = formatLocalDateKey(new Date())) {
  let startKey: string;
  let endKey = today;
  if (type === "daily") startKey = endKey = selectedDate;
  else if (type === "custom") { startKey = customStart; endKey = customEnd; }
  else {
    const days = { "7days": 7, "14days": 14, "1month": 30 }[type];
    if (!days) throw new Error("Pilih rentang waktu yang tersedia.");
    startKey = formatLocalDateKey(new Date(new Date(`${today}T00:00:00+07:00`).getTime() - (days - 1) * DAY_MS));
  }
  if (!startKey || !endKey) throw new Error("Lengkapi tanggal mulai dan tanggal akhir.");
  if (resolveHydrationDate(startKey, today) !== startKey || resolveHydrationDate(endKey, today) !== endKey) throw new Error("Tanggal harus valid dan tidak boleh melebihi hari ini.");
  if (startKey > endKey) throw new Error("Tanggal mulai tidak boleh melewati tanggal akhir.");
  const startDate = new Date(`${startKey}T00:00:00+07:00`);
  const daysToShow = Math.round((new Date(`${endKey}T00:00:00+07:00`).getTime() - startDate.getTime()) / DAY_MS) + 1;
  if (daysToShow > MAX_HYDRATION_RANGE_DAYS) throw new Error(`Rentang maksimal ${MAX_HYDRATION_RANGE_DAYS} hari. Persempit rentang agar seluruh tanggal dapat ditampilkan.`);
  const dates = Array.from({ length: daysToShow }, (_, index) => formatLocalDateKey(new Date(startDate.getTime() + index * DAY_MS)));
  return { startDate, endDate: new Date(startDate.getTime() + daysToShow * DAY_MS - 1), daysToShow, dates };
}

export function buildDailyHydrationSummaries<T extends HydrationLogLike>(logs: T[], student: Parameters<typeof calculateStudentFluidTarget>[0] & { id: string }, activities: ActivityMap, dates: string[]) {
  const byDate = new Map(dates.map((date) => [date, [] as T[]]));
  for (const log of logs) byDate.get(formatLocalDateKey(log.logged_at))?.push(log);
  return dates.map((dateKey) => {
    const dailyLogs = byDate.get(dateKey)!;
    const savedActivity = activities[`${student.id}:${dateKey}`];
    const activityLevel = savedActivity?.activity_level || "sedang";
    const requiredMl = calculateStudentFluidTarget(student, activityLevel);
    const volume = dailyLogs.reduce((sum, log) => sum + log.amount_ml, 0);
    const status = dailyLogs.length ? getAdequacyStatus(volume, requiredMl) : {
      ...getAdequacyStatus(0, requiredMl), label: "Belum ada catatan", className: "border border-slate-200 bg-slate-100 text-slate-600",
    };
    return { dateKey, logs: dailyLogs, volume, requiredMl, activityLevel, isEstimated: savedActivity?.is_estimated ?? true, status };
  });
}

export function dailyHydrationCsv(rows: ReturnType<typeof buildDailyHydrationSummaries>) {
  const values = [
    ["Tanggal Catatan Asupan", "Aktivitas", "Sumber Aktivitas", "Total Asupan (ml)", "Total Kebutuhan (ml)", "Jumlah Catatan", "Status Hidrasi Harian"],
    ...rows.map((row) => [row.dateKey, row.activityLevel, row.isEstimated ? "Perkiraan" : "Tersimpan", row.volume, row.requiredMl, row.logs.length, row.status.label]),
  ];
  return "\uFEFF" + values.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

export function escapeReportHtml(value: string | number) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
