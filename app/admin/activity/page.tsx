"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { createClient } from "../../../utils/api/client";
import { Activity, ArrowRight, Target, Scale } from "lucide-react";
import Link from "next/link";
import { calculateBasicFluidNeeds, calculateStudentFluidTarget, getGenderFactor, formatLocalDateKey } from "../../../utils/hydrationCalc";
import { activityFor, loadDailyActivities } from "../../../utils/dailyActivity";
import { fetchAllRows } from "../../../utils/dataAccess";

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
  selected_need: number;
  activity_level: string;
  activity_estimated: boolean;
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

const STUDENTS_PER_PAGE = 10;

export default function AdminActivityPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(formatLocalDateKey(new Date()));
  const [errorMessage, setErrorMessage] = useState("");

  const filteredStudents = students.filter((student) => `${student.full_name || ""} ${student.email || ""}`.toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID")));
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / STUDENTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedStudents = filteredStudents.slice((safePage - 1) * STUDENTS_PER_PAGE, safePage * STUDENTS_PER_PAGE);

  useEffect(() => {
    async function fetchData() {
      setLoading(true); setErrorMessage("");
      const supabase = createClient();
      try {
        const today = new Date(`${selectedDate}T00:00:00+07:00`);
        const tomorrow = new Date(today.getTime() + 86400000);
        const activities = await loadDailyActivities(null, selectedDate);

        const [{ data: studentsData, error: studentsError }, { data: studentDetails }, { data: todayLogs }] = await Promise.all([
          supabase.from("profiles").select("id, full_name, email").eq("role", "student").order("full_name", { ascending: true }),
          supabase.from("student_profiles").select("id, weight_kg, gender, daily_water_target_ml"),
          fetchAllRows<TodayHydrationLog>((from, to) => supabase.from("hydration_logs").select("student_id, amount_ml").gte("logged_at", today.toISOString()).lt("logged_at", tomorrow.toISOString()).order("id").range(from, to)).then((data) => ({ data })),
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
            const baseNeed = detail?.weight_kg ? calculateBasicFluidNeeds(weight) : detail?.daily_water_target_ml || calculateBasicFluidNeeds(weight);
            const genderFactor = getGenderFactor(detail?.gender);
            const needLow = calculateStudentFluidTarget(detail, "rendah");
            const needMedium = calculateStudentFluidTarget(detail, "sedang");
            const needHigh = calculateStudentFluidTarget(detail, "tinggi");

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
              selected_need: calculateStudentFluidTarget(detail, activityFor(activities, student.id, selectedDate)),
              activity_level: activityFor(activities, student.id, selectedDate),
              activity_estimated: activities[`${student.id}:${selectedDate}`]?.is_estimated ?? true,
            };
          }
        );

        setStudents(merged);
      } catch (error) {
        console.error("Error fetching grouped activity:", error);
        setErrorMessage("Aktivitas harian gagal dimuat. Silakan muat ulang halaman.");
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [selectedDate]);

  const totalMlToday = students.reduce((total, student) => total + student.today_hydration, 0);
  const totalBaseNeed = students.reduce((total, student) => total + student.base_need, 0);
  const totalNeedLow = students.reduce((total, student) => total + student.need_low, 0);
  const totalNeedMedium = students.reduce((total, student) => total + student.need_medium, 0);
  const totalNeedHigh = students.reduce((total, student) => total + student.need_high, 0);
  const totalSelectedNeed = students.reduce((total, student) => total + student.selected_need, 0);
  const avgProgress = totalSelectedNeed > 0 ? Math.round((totalMlToday / totalSelectedNeed) * 100) : 0;

  return (
    <>
      <AdminHeader title="Aktivitas Minum (Hidrasi)" />
      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-end gap-4 rounded-xl bg-white p-4">
          <label className="text-sm font-semibold text-slate-700">Tanggal aktivitas harian<input aria-label="Tanggal aktivitas harian" type="date" max={formatLocalDateKey(new Date())} value={selectedDate} onChange={(event) => { if (event.target.value) { setSelectedDate(event.target.value); setCurrentPage(1); } }} className="mt-2 block rounded-lg border p-2" /></label>
          <label className="flex-1 text-sm font-semibold text-slate-700">Cari siswa<input aria-label="Cari aktivitas siswa" placeholder="Cari nama atau surel siswa..." value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} className="mt-2 block w-full rounded-lg border p-2" /></label>
        </div>
        {errorMessage && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{errorMessage}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card className="border-0 shadow-md bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-6">
              <h3 className="text-blue-100 text-sm font-medium mb-1">Total Volume — {selectedDate}</h3>
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
                <p className="text-2xl font-bold text-slate-800">{totalSelectedNeed.toLocaleString("id-ID")} ml</p>
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
                  Kesimpulan menggunakan aktivitas yang tersimpan pada tanggal pilihan: rendah 0, sedang 375, tinggi 750 ml. Data yang belum dipilih ditandai sebagai perkiraan sedang.
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
                    <th scope="col" className="px-6 py-4">Status Tanggal Pilihan</th>
                    <th scope="col" className="px-6 py-4">Progres (%)</th>
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
                    paginatedStudents.map((student) => {
                      const percentage =
                        student.selected_need > 0
                          ? Math.min(100, Math.round((student.today_hydration / student.selected_need) * 100))
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
                            <div className="font-bold text-slate-800">{student.selected_need.toLocaleString("id-ID")} ml</div>
                            <p className="text-xs text-blue-700">Aktivitas {student.activity_level}{student.activity_estimated ? " (perkiraan)" : " (tersimpan)"}</p>
                            <div className="text-xs text-slate-400">
                              Rendah: {student.need_low.toLocaleString("id-ID")} • Sedang: {student.need_medium.toLocaleString("id-ID")} • Tinggi: {student.need_high.toLocaleString("id-ID")}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${percentage >= 100 ? "text-green-600" : "text-blue-600"}`}>
                                {student.today_hydration} ml
                              </span>
                              <span className="text-xs text-slate-400">/ {student.selected_need} ml</span>
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
                              href={`/admin/activity-detail?id=${student.id}&date=${selectedDate}`}
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

            {!loading && students.length > 0 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3 justify-between items-center text-sm text-slate-500">
                <span>
                  Menampilkan {filteredStudents.length ? (safePage - 1) * STUDENTS_PER_PAGE + 1 : 0}–{Math.min(safePage * STUDENTS_PER_PAGE, filteredStudents.length)} dari {filteredStudents.length} siswa
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                    >
                      Sebelumnya
                    </button>
                    <span className="font-semibold text-slate-700">Halaman {safePage} / {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                    >
                      Berikutnya
                    </button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
