"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { Card, CardContent } from "../../components/ui/Card";
import { Users, Droplets, ClipboardList, Activity } from "lucide-react";
import { createClient } from "../../utils/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { calculateRequiredIntake, formatLocalDateKey, normalizeGender } from "../../utils/hydrationCalc";

type RecentUser = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type WeeklyHydrationDatum = {
  name: string;
  volume: number;
};

type DistributionDatum = {
  name: string;
  total: number;
  fill: string;
};

type DashboardStats = {
  totalUsers: number;
  totalStudents: number;
  totalParents: number;
  totalAdmins: number;
  totalSurveys: number;
  todayHydration: number;
  totalLogsToday: number;
  activeStudentsToday: number;
  hydrationCoverageToday: number;
  averageStudentNeed: number;
};

type StudentProfileSummary = {
  id: string;
  weight_kg: number | null;
  gender: string | null;
};

type HydrationLogSummary = {
  student_id: string;
  amount_ml: number;
  drink_type: string | null;
  logged_at: string;
};

const defaultStats: DashboardStats = {
  totalUsers: 0,
  totalStudents: 0,
  totalParents: 0,
  totalAdmins: 0,
  totalSurveys: 0,
  todayHydration: 0,
  totalLogsToday: 0,
  activeStudentsToday: 0,
  hydrationCoverageToday: 0,
  averageStudentNeed: 0,
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [weeklyHydrationData, setWeeklyHydrationData] = useState<WeeklyHydrationDatum[]>([]);
  const [drinkTypeData, setDrinkTypeData] = useState<DistributionDatum[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient();

      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 6);

        const [
          { count: usersCount },
          { count: studentsCount },
          { count: parentsCount },
          { count: adminsCount },
          { count: surveysCount },
          { data: recentData },
          { data: studentProfiles },
          { data: todayLogs },
          { data: weeklyLogs },
        ] = await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "student"),
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "parent"),
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin"),
          supabase.from("surveys").select("*", { count: "exact", head: true }),
          supabase.from("profiles").select("id, full_name, role").order("created_at", { ascending: false }).limit(4),
          supabase.from("student_profiles").select("id, weight_kg, gender"),
          supabase.from("hydration_logs").select("student_id, amount_ml, drink_type, logged_at").gte("logged_at", today.toISOString()),
          supabase.from("hydration_logs").select("student_id, amount_ml, drink_type, logged_at").gte("logged_at", sevenDaysAgo.toISOString()),
        ]);

        const studentProfileRows = (studentProfiles as StudentProfileSummary[] | null) || [];
        const todayLogRows = (todayLogs as HydrationLogSummary[] | null) || [];
        const weeklyLogRows = (weeklyLogs as HydrationLogSummary[] | null) || [];

        const aggregateEstimatedNeed = studentProfileRows.reduce((total, student) => {
          const weight = student.weight_kg || 25;
          return total + calculateRequiredIntake({
            weight_kg: weight,
            gender: normalizeGender(student.gender),
            activity_level: "sedang",
          });
        }, 0);

        const totalHydrationToday = todayLogRows.reduce((total, log) => total + log.amount_ml, 0);
        const activeStudentsToday = new Set(todayLogRows.map((log) => log.student_id)).size;

        setStats({
          totalUsers: usersCount || 0,
          totalStudents: studentsCount || 0,
          totalParents: parentsCount || 0,
          totalAdmins: adminsCount || 0,
          totalSurveys: surveysCount || 0,
          todayHydration: totalHydrationToday,
          totalLogsToday: todayLogRows.length,
          activeStudentsToday,
          hydrationCoverageToday:
            aggregateEstimatedNeed > 0 ? Math.round((totalHydrationToday / aggregateEstimatedNeed) * 100) : 0,
          averageStudentNeed:
            studentProfileRows.length > 0 ? Math.round(aggregateEstimatedNeed / studentProfileRows.length) : 0,
        });

        if (recentData) {
          setRecentUsers((recentData as RecentUser[]) || []);
        }

        const dailyMap: Record<string, number> = {};
        const labelMap: Record<string, string> = {};

        for (let index = 0; index < 7; index += 1) {
          const day = new Date(sevenDaysAgo);
          day.setDate(sevenDaysAgo.getDate() + index);
          const key = formatLocalDateKey(day);
          dailyMap[key] = 0;
          labelMap[key] = day.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
        }

        const drinkMap: Record<string, number> = {};

        weeklyLogRows.forEach((log) => {
          const key = formatLocalDateKey(log.logged_at);
          if (dailyMap[key] !== undefined) {
            dailyMap[key] += log.amount_ml;
          }

          const drinkName = log.drink_type || "Air putih";
          drinkMap[drinkName] = (drinkMap[drinkName] || 0) + log.amount_ml;
        });

        setWeeklyHydrationData(
          Object.keys(dailyMap).map((key) => ({
            name: labelMap[key],
            volume: dailyMap[key],
          }))
        );

        const topDrinkTypes = Object.entries(drinkMap)
          .sort((left, right) => right[1] - left[1])
          .slice(0, 5)
          .map(([name, total], index) => ({
            name,
            total,
            fill: ["#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b", "#f97316"][index] || "#64748b",
          }));

        setDrinkTypeData(topDrinkTypes);
      } catch (error) {
        console.error("Error fetching admin stats:", error);
      } finally {
        setLoading(false);
      }
    }

    void fetchStats();
  }, []);

  const roleDistributionData: DistributionDatum[] = [
    { name: "Siswa", total: stats.totalStudents, fill: "#3b82f6" },
    { name: "Ortu", total: stats.totalParents, fill: "#14b8a6" },
    { name: "Admin", total: stats.totalAdmins, fill: "#8b5cf6" },
  ];

  return (
    <>
      <AdminHeader title="Dashboard Admin" />
      <div className="p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card className="border-0 shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Users size={28} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Total Pengguna</p>
                <h3 className="text-3xl font-bold text-slate-800">{loading ? "-" : stats.totalUsers}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {loading
                    ? "-"
                    : `${stats.totalStudents} Siswa, ${stats.totalParents} Ortu, ${stats.totalAdmins} Admin`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center">
                <Droplets size={28} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Air Diminum Hari Ini</p>
                <h3 className="text-3xl font-bold text-slate-800">
                  {loading ? "-" : `${(stats.todayHydration / 1000).toFixed(1)} L`}
                </h3>
                <p className="text-xs text-slate-400 mt-1">Gabungan seluruh log hari ini</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <ClipboardList size={28} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Catatan Minum Hari Ini</p>
                <h3 className="text-3xl font-bold text-slate-800">{loading ? "-" : stats.totalLogsToday}</h3>
                <p className="text-xs text-slate-400 mt-1">{loading ? "-" : `${stats.totalSurveys} kuis/survei aktif`}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                <Activity size={28} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Siswa Aktif Hari Ini</p>
                <h3 className="text-3xl font-bold text-slate-800">{loading ? "-" : stats.activeStudentsToday}</h3>
                <p className="text-xs text-slate-400 mt-1">Yang mencatat minum hari ini</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-0 shadow-md bg-gradient-to-br from-blue-500 to-sky-500 text-white">
            <CardContent className="p-6">
              <p className="text-blue-100 text-sm font-medium">Cakupan Target Hidrasi Hari Ini</p>
              <h3 className="text-4xl font-extrabold mt-2">{loading ? "-" : `${stats.hydrationCoverageToday}%`}</h3>
              <p className="text-sm text-blue-100 mt-2">
                Dibanding estimasi kebutuhan total siswa dengan rumus <strong>FBB × FG + FA</strong> pada aktivitas sedang.
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <p className="text-slate-500 text-sm font-medium">Rata-rata Kebutuhan per Siswa</p>
              <h3 className="text-4xl font-extrabold text-slate-800 mt-2">
                {loading ? "-" : `${stats.averageStudentNeed} ml`}
              </h3>
              <p className="text-sm text-slate-400 mt-2">
                Estimasi harian berbasis berat badan, faktor gender, dan aktivitas sedang.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-0 shadow-md">
            <CardContent className="p-6 h-full flex flex-col">
              <h3 className="font-bold text-slate-800 mb-2 text-lg">Grafik Hidrasi 7 Hari Terakhir</h3>
              <p className="text-sm text-slate-500">Total volume minum seluruh siswa per hari.</p>
              <div className="flex-1 min-h-[280px] w-full mt-4">
                {loading ? (
                  <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                    <p className="text-slate-400 text-sm">Memuat grafik...</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyHydrationData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} dx={-10} width={40} />
                      <Tooltip
                        cursor={{ fill: "#f8fafc" }}
                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                      />
                      <Bar dataKey="volume" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={28} name="Volume (ml)" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6 h-full flex flex-col">
              <h3 className="font-bold text-slate-800 mb-2 text-lg">Komposisi Pengguna</h3>
              <p className="text-sm text-slate-500">Sebaran role dalam aplikasi saat ini.</p>
              <div className="flex-1 min-h-[280px] w-full mt-4">
                {loading ? (
                  <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                    <p className="text-slate-400 text-sm">Memuat grafik...</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={roleDistributionData} layout="vertical" margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#64748b", fontSize: 12, fontWeight: 600 }}
                        width={55}
                      />
                      <Tooltip
                        cursor={{ fill: "#f8fafc" }}
                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                      />
                      <Bar dataKey="total" radius={[0, 8, 8, 0]} barSize={26} name="Jumlah">
                        {roleDistributionData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-0 shadow-md">
            <CardContent className="p-6 h-full flex flex-col">
              <h3 className="font-bold text-slate-800 mb-2 text-lg">Jenis Minuman Teratas Pekan Ini</h3>
              <p className="text-sm text-slate-500">Lima jenis minuman dengan volume tertinggi dalam 7 hari terakhir.</p>
              <div className="flex-1 min-h-[260px] w-full mt-4">
                {loading ? (
                  <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                    <p className="text-slate-400 text-sm">Memuat grafik...</p>
                  </div>
                ) : drinkTypeData.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                    <p className="text-slate-400 text-sm">Belum ada data jenis minuman.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={drinkTypeData} layout="vertical" margin={{ left: 30, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        width={120}
                      />
                      <Tooltip
                        cursor={{ fill: "#f8fafc" }}
                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                      />
                      <Bar dataKey="total" radius={[0, 8, 8, 0]} barSize={24} name="Volume (ml)">
                        {drinkTypeData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <h3 className="font-bold text-slate-800 mb-4 text-lg">Pengguna Terbaru</h3>
              <div className="space-y-4">
                {loading ? (
                  <p className="text-sm text-slate-400 py-2">Memuat pengguna...</p>
                ) : recentUsers.map((user) => (
                  <div key={user.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold border border-slate-200">
                      {user.full_name ? user.full_name.charAt(0).toUpperCase() : "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{user.full_name || "Tanpa Nama"}</p>
                      <p className="text-xs text-slate-500 capitalize">{user.role}</p>
                    </div>
                  </div>
                ))}

                {!loading && recentUsers.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">Belum ada pengguna</p>
                )}

                {!loading && recentUsers.length > 0 && (
                  <div className="text-center pt-2">
                    <button onClick={() => window.location.href = "/admin/users"} className="text-sm text-blue-600 hover:underline font-medium">
                      Lihat Semua
                    </button>
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
