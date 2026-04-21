"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { createClient } from "../../../utils/supabase/client";
import { Activity, ArrowRight, Target, Scale } from "lucide-react";
import Link from "next/link";
import { calculateBasicFluidNeeds, calculateIntakeFromStoredBaseNeed, getGenderFactor } from "../../../utils/hydrationCalc";

const ADMIN_ACTIVITY_FACTORS = {
  rendah: 0,
  sedang: 275,
  tinggi: 750,
} as const;

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  weight_kg: number | null;
  gender: string | null;
  base_need: number;
  gender_factor: number;
  need_low: number;
  need_medium: number;
  need_high: number;
  today_hydration: number;
};

type StudentProfileDetails = {
  id: string;
  weight_kg: number | null;
  gender: string | null;
  daily_water_target_ml: number | null;
};

type TodayHydrationLog = {
  student_id: string;
  amount_ml: number;
};

export default function AdminActivityPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [{ data: studentsData, error: studentsError }, { data: studentDetails }, { data: todayLogs }] = await Promise.all([
          supabase.from("profiles").select("id, full_name, email").eq("role", "student").order("full_name", { ascending: true }),
          supabase.from("student_profiles").select("id, weight_kg, gender, daily_water_target_ml"),
          supabase.from("hydration_logs").select("student_id, amount_ml").gte("logged_at", today.toISOString()),
        ]);

        if (studentsError) throw studentsError;

        const detailMap = ((studentDetails as StudentProfileDetails[] | null) || []).reduce<Record<string, StudentProfileDetails>>(
          (accumulator, detail) => {
            accumulator[detail.id] = detail;
            return accumulator;
          },
          {}
        );

        const hydrationMap = ((todayLogs as TodayHydrationLog[] | null) || []).reduce<Record<string, number>>(
          (accumulator, log) => {
            accumulator[log.student_id] = (accumulator[log.student_id] || 0) + log.amount_ml;
            return accumulator;
          },
          {}
        );

        const merged = ((studentsData as Omit<StudentRow, "weight_kg" | "gender" | "base_need" | "estimated_target" | "today_hydration">[] | null) || []).map(
          (student) => {
            const detail = detailMap[student.id];
            const weight = detail?.weight_kg || 25;
            const baseNeed = detail?.daily_water_target_ml || calculateBasicFluidNeeds(weight);
            const genderFactor = getGenderFactor(detail?.gender);
            const needLow = calculateIntakeFromStoredBaseNeed({
              base_need_ml: baseNeed,
              gender: detail?.gender,
              activity_level: "rendah",
              customActivityFactor: ADMIN_ACTIVITY_FACTORS,
            });
            const needMedium = calculateIntakeFromStoredBaseNeed({
              base_need_ml: baseNeed,
              gender: detail?.gender,
              activity_level: "sedang",
              customActivityFactor: ADMIN_ACTIVITY_FACTORS,
            });
            const needHigh = calculateIntakeFromStoredBaseNeed({
              base_need_ml: baseNeed,
              gender: detail?.gender,
              activity_level: "tinggi",
              customActivityFactor: ADMIN_ACTIVITY_FACTORS,
            });

            return {
              ...student,
              weight_kg: detail?.weight_kg || null,
              gender: detail?.gender || null,
              base_need: baseNeed,
              gender_factor: genderFactor,
              need_low: needLow,
              need_medium: needMedium,
              need_high: needHigh,
              today_hydration: hydrationMap[student.id] || 0,
            };
          }
        );

        setStudents(merged);
      } catch (error) {
        console.error("Error fetching grouped activity:", error);
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, []);

  const totalMlToday = students.reduce((total, student) => total + student.today_hydration, 0);
  const totalBaseNeed = students.reduce((total, student) => total + student.base_need, 0);
  const totalNeedLow = students.reduce((total, student) => total + student.need_low, 0);
  const totalNeedMedium = students.reduce((total, student) => total + student.need_medium, 0);
  const totalNeedHigh = students.reduce((total, student) => total + student.need_high, 0);
  const avgProgress = totalNeedMedium > 0 ? Math.round((totalMlToday / totalNeedMedium) * 100) : 0;

  return (
    <>
      <AdminHeader title="Aktivitas Minum (Hidrasi)" />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card className="border-0 shadow-md bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-6">
              <h3 className="text-blue-100 text-sm font-medium mb-1">Total Volume Hari Ini</h3>
              <p className="text-3xl font-bold">{(totalMlToday / 1000).toFixed(1)} Liter</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                <Scale size={24} />
              </div>
              <div>
                <h3 className="text-slate-500 text-sm font-medium">Total FBB</h3>
                <p className="text-2xl font-bold text-slate-800">{totalBaseNeed.toLocaleString("id-ID")} ml</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                <Target size={24} />
              </div>
              <div>
                <h3 className="text-slate-500 text-sm font-medium">FBB × FG + FA</h3>
                <p className="text-2xl font-bold text-slate-800">{totalNeedMedium.toLocaleString("id-ID")} ml</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Rendah: {totalNeedLow.toLocaleString("id-ID")} • Sedang: {totalNeedMedium.toLocaleString("id-ID")} • Tinggi: {totalNeedHigh.toLocaleString("id-ID")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-600">
                <Activity size={24} />
              </div>
              <div>
                <h3 className="text-slate-500 text-sm font-medium">Rata-rata Terpenuhi</h3>
                <p className="text-2xl font-bold text-slate-800">{avgProgress}%</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Daftar Aktivitas per Siswa</h2>
                <p className="text-sm text-slate-500 mt-1">
                  FBB diambil dari data tabel siswa, lalu dihitung ulang dengan <strong>FG</strong> dan tiga variasi <strong>FA</strong>: rendah 0, sedang 275, tinggi 750.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th scope="col" className="px-6 py-4">Nama Siswa</th>
                    <th scope="col" className="px-6 py-4">FBB</th>
                    <th scope="col" className="px-6 py-4">FG</th>
                    <th scope="col" className="px-6 py-4">FBB × FG + FA</th>
                    <th scope="col" className="px-6 py-4">Status Hari Ini</th>
                    <th scope="col" className="px-6 py-4">Progress (%)</th>
                    <th scope="col" className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                        Memuat data siswa...
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                        Belum ada siswa yang terdaftar.
                      </td>
                    </tr>
                  ) : (
                    students.map((student) => {
                      const percentage =
                        student.need_medium > 0
                          ? Math.min(100, Math.round((student.today_hydration / student.need_medium) * 100))
                          : 0;

                      return (
                        <tr key={student.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-800 text-base">{student.full_name || "Tanpa Nama"}</div>
                            <div className="text-xs text-slate-500">{student.email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-800">{student.base_need.toLocaleString("id-ID")} ml</div>
                            <div className="text-xs text-slate-400">Diambil dari tabel siswa</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-800">{student.gender_factor.toFixed(2)}</div>
                            <div className="text-xs text-slate-400">{student.gender === "female" || student.gender === "P" ? "Perempuan" : "Laki-laki"}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-800">{student.need_medium.toLocaleString("id-ID")} ml</div>
                            <div className="text-xs text-slate-400">
                              Rendah: {student.need_low.toLocaleString("id-ID")} • Sedang: {student.need_medium.toLocaleString("id-ID")} • Tinggi: {student.need_high.toLocaleString("id-ID")}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${percentage >= 100 ? "text-green-600" : "text-blue-600"}`}>
                                {student.today_hydration} ml
                              </span>
                              <span className="text-xs text-slate-400">/ {student.need_medium} ml</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="w-full max-w-[150px] bg-slate-200 rounded-full h-2.5">
                              <div
                                className={`h-2.5 rounded-full ${percentage >= 100 ? "bg-green-500" : "bg-blue-600"}`}
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 mt-1 block">{percentage}%</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link
                              href={`/admin/activity-detail?id=${student.id}`}
                              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Lihat Detail <ArrowRight size={14} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
