"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { createClient } from "../../../utils/supabase/client";
import { ArrowLeft, Droplets, Calendar, Scale, Target } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { calculateBasicFluidNeeds, calculateIntakeFromStoredBaseNeed, formatLocalDateKey, getGenderFactor } from "../../../utils/hydrationCalc";

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
  name: string;
  volume: number;
};

function ActivityDetailContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("id");

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [logs, setLogs] = useState<HydrationLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterType, setFilterType] = useState("7days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

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

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!logs || logs.length === 0) return [];

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
      if (!customStartDate || !customEndDate) return [];

      startDate = new Date(customStartDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      daysToShow = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    if (daysToShow > 90) daysToShow = 90;

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

    logs.forEach((log) => {
      const logDate = new Date(log.logged_at);
      if (logDate >= startDate && logDate <= endDate) {
        const key = formatLocalDateKey(logDate);
        if (dataMap[key] !== undefined) {
          dataMap[key] += log.amount_ml;
        }
      }
    });

    return Object.keys(dataMap).map((key) => ({
      name: labelMap[key],
      volume: dataMap[key],
    }));
  }, [logs, filterType, customStartDate, customEndDate]);

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
  const genderFactor = getGenderFactor(student.gender);
  const targetLow = calculateIntakeFromStoredBaseNeed({
    base_need_ml: basicNeed,
    gender: student.gender,
    activity_level: "rendah",
    customActivityFactor: ADMIN_ACTIVITY_FACTORS,
  });
  const targetMedium = calculateIntakeFromStoredBaseNeed({
    base_need_ml: basicNeed,
    gender: student.gender,
    activity_level: "sedang",
    customActivityFactor: ADMIN_ACTIVITY_FACTORS,
  });
  const targetHigh = calculateIntakeFromStoredBaseNeed({
    base_need_ml: basicNeed,
    gender: student.gender,
    activity_level: "tinggi",
    customActivityFactor: ADMIN_ACTIVITY_FACTORS,
  });

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
                  <p className="text-sm text-slate-500 mt-1">Pengelompokan berdasarkan tanggal lokal agar log beda hari tidak tercampur.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {filterType === "custom" && (
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(event) => setCustomStartDate(event.target.value)}
                        className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                      />
                      <span className="text-slate-400 text-xs">sd</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(event) => setCustomEndDate(event.target.value)}
                        className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                  <select
                    value={filterType}
                    onChange={(event) => setFilterType(event.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="7days">7 Hari Terakhir</option>
                    <option value="14days">14 Hari Terakhir</option>
                    <option value="1month">1 Bulan Terakhir</option>
                    <option value="custom">Custom Range</option>
                  </select>
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
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    />
                    <Bar dataKey="volume" fill="#0d9488" radius={[4, 4, 0, 0]} barSize={32} name="Volume (ml)" />
                  </BarChart>
                </ResponsiveContainer>
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
                  <h3 className="font-bold text-slate-800">Riwayat Log</h3>
                  <p className="text-xs text-slate-500">{logs.length} catatan minum</p>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-2">
                {logs.length === 0 ? (
                  <p className="text-sm text-center text-slate-400 py-8">Belum ada riwayat minum.</p>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log) => {
                      const logDate = new Date(log.logged_at);
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
                              <p className="text-xs text-slate-500 font-medium">
                                {logDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} • {log.drink_type || "Air Putih"}
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
