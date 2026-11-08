"use client";

import { useEffect, useState, useMemo } from "react";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { useUserStore } from "../../../store/useUserStore";
import { createClient } from "../../../utils/api/client";
import { useRouter } from "next/navigation";
import { formatLocalDateKey } from "../../../utils/hydrationCalc";
import { loadDailyActivities, type ActivityMap } from "../../../utils/dailyActivity";
import { buildDailyHydrationSummaries, buildHydrationRange, type HydrationRangeType } from "../../../utils/hydrationRange";
import { fetchAllRows } from "../../../utils/dataAccess";
import { 
  Droplet, 
  ClipboardList, 
  TrendingUp, 
  Award,
  Filter,
  BarChart as BarChartIcon
} from "lucide-react";
import { 
  ComposedChart,
  Bar, 
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from "recharts";

type TimeRange = "daily" | "7d" | "14d" | "30d" | "custom";
const RANGE_TYPES: Record<TimeRange, HydrationRangeType> = { daily: "daily", "7d": "7days", "14d": "14days", "30d": "1month", custom: "custom" };

type ChildProgressRow = {
  child_id: string;
  student_profiles: {
    student_code: string | null;
    daily_water_target_ml: number | null;
    weight_kg: number | null;
    gender: string | null;
    profiles: {
      full_name: string | null;
    } | null;
  } | null;
};

type HydrationProgressLog = {
  id: string;
  amount_ml: number;
  logged_at: string;
  drink_type: string | null;
};

type SurveyProgressResponse = {
  id: string;
  response_date: string;
  surveys: {
    title: string | null;
    survey_type: string | null;
  } | null;
};

export default function ProgressPage() {
  const { profile, isAuthenticated, isLoading: userLoading } = useUserStore();
  const router = useRouter();
  const today = formatLocalDateKey(new Date());
  const [children, setChildren] = useState<ChildProgressRow[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [customDates, setCustomDates] = useState(() => ({ start: buildHydrationRange("7days", today, "", "", today).dates[0], end: today }));
  
  const [hydrationLogs, setHydrationLogs] = useState<HydrationProgressLog[]>([]);
  const [activities, setActivities] = useState<ActivityMap>({});
  const [activityError, setActivityError] = useState("");
  const [surveyResponses, setSurveyResponses] = useState<SurveyProgressResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const { range, rangeError } = useMemo(() => {
    try { return { range: buildHydrationRange(RANGE_TYPES[timeRange], today, customDates.start, customDates.end, today), rangeError: "" }; }
    catch (error) { return { range: null, rangeError: error instanceof Error ? error.message : "Rentang tanggal tidak valid." }; }
  }, [timeRange, customDates.start, customDates.end, today]);

  // Initial fetch: get children list
  useEffect(() => {
    async function fetchChildren() {
      if (!profile?.id || profile?.role !== 'parent') return;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('parent_children')
        .select('child_id, student_profiles:child_id(student_code, daily_water_target_ml, weight_kg, gender, profiles!student_profiles_id_fkey(full_name))')
        .eq('parent_id', profile.id);
      if (error) throw error;

      if (data && data.length > 0) {
        setChildren((data as unknown as ChildProgressRow[]) || []);
        setSelectedChildId(data[0].child_id);
      } else {
        setLoading(false);
      }
    }
    if (!userLoading && isAuthenticated) void fetchChildren().catch(() => {
      setActivityError("Daftar anak gagal dimuat. Silakan muat ulang halaman."); setLoading(false);
    });
  }, [profile?.id, profile?.role, isAuthenticated, userLoading]);

  // Fetch data based on selected child and time range
  useEffect(() => {
    let active = true;
    async function fetchData() {
      if (!selectedChildId || !range) return;
      setLoading(true);
      setActivityError("");
      const supabase = createClient();
      const [logs, dailyActivities, surveys] = await Promise.all([
        fetchAllRows<HydrationProgressLog>((from, to) => supabase.from('hydration_logs')
          .select('id, amount_ml, drink_type, logged_at').eq('student_id', selectedChildId)
          .gte('logged_at', range.startDate.toISOString()).lte('logged_at', range.endDate.toISOString())
          .order('logged_at', { ascending: true }).order('id').range(from, to)),
        loadDailyActivities([selectedChildId], range.dates[0], range.dates.at(-1)!),
        fetchAllRows<SurveyProgressResponse>((from, to) => supabase.from('survey_responses')
          .select('id, response_date, surveys(title, survey_type)')
          .or(`student_id.eq.${selectedChildId},and(student_id.is.null,respondent_id.eq.${selectedChildId})`)
          .gte('response_date', range.dates[0]).lte('response_date', range.dates.at(-1)!)
          .order('response_date', { ascending: false }).order('id').range(from, to).returns<SurveyProgressResponse[]>()),
      ]);
      if (!active) return;
      setActivities(dailyActivities);
      setHydrationLogs(logs || []);
      setSurveyResponses(surveys || []);
      setLoading(false);
    }
    if (selectedChildId && range) void fetchData().catch(() => {
      if (!active) return;
      setActivityError("Perkembangan atau aktivitas harian gagal dimuat. Silakan muat ulang halaman.");
      setHydrationLogs([]); setActivities({}); setSurveyResponses([]); setLoading(false);
    });
    return () => { active = false; };
  }, [selectedChildId, range]);

  // Aggregate data for chart
  const chartData = useMemo(() => {
    const child = children.find(c => c.child_id === selectedChildId);
    if (!range || !child) return [];
    return buildDailyHydrationSummaries(hydrationLogs, { ...child.student_profiles, id: selectedChildId }, activities, range.dates).map(day => ({
      ...day,
      displayDate: new Date(`${day.dateKey}T00:00:00+07:00`).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' }),
    }));
  }, [hydrationLogs, range, children, selectedChildId, activities]);

  const stats = useMemo(() => {
    const total = chartData.reduce((sum, day) => sum + day.volume, 0);
    const avg = chartData.length > 0 ? Math.round(total / chartData.length) : 0;
    const goalsReached = chartData.filter(day => day.logs.length > 0 && day.status.isAdequate).length;
    
    return {
      total,
      avg,
      goalsReached,
      surveyCount: surveyResponses.length
    };
  }, [chartData, surveyResponses]);

  if (profile?.role !== 'parent') {
    return (
      <>
        <Header title="Rincian Perkembangan Anak" />
        <div className="p-6 text-center text-slate-500">Halaman ini khusus untuk Orang Tua.</div>
      </>
    );
  }

  return (
    <>
      <Header title="Rincian Perkembangan Anak" />
      <div className="p-6 space-y-6 pb-28">
        {(rangeError || activityError) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{rangeError || activityError}</p>}
        
        {/* Top Selection Area */}
        <div className="space-y-4">
          {/* Child Selector */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
            {children.map(c => (
              <button
                key={c.child_id}
                onClick={() => setSelectedChildId(c.child_id)}
                className={`flex-shrink-0 px-4 py-2 rounded-2xl text-sm font-bold transition-all border-2 ${
                  selectedChildId === c.child_id 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                    : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'
                }`}
              >
                {c.student_profiles?.profiles?.full_name || 'Anak'}
              </button>
            ))}
          </div>

          {/* Range Selector */}
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200 flex gap-1 shadow-sm">
            {(['daily', '7d', '14d', '30d', 'custom'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`flex-1 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all ${
                  timeRange === r ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'
                }`}
              >
                {r === 'daily' ? 'Hari ini' : r === '7d' ? '7 Hari' : r === '14d' ? '14 Hari' : r === '30d' ? '30 Hari' : 'Khusus'}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          {timeRange === 'custom' && (
            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-2">Mulai</label>
                <input 
                  type="date" 
                  aria-label="Tanggal mulai pantauan"
                  min="1900-01-01"
                  max={customDates.end || today}
                  value={customDates.start}
                  onChange={e => setCustomDates({...customDates, start: e.target.value})}
                  className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-2">Sampai</label>
                <input 
                  type="date" 
                  aria-label="Tanggal akhir pantauan"
                  min={customDates.start || "1900-01-01"}
                  max={today}
                  value={customDates.end}
                  onChange={e => setCustomDates({...customDates, end: e.target.value})}
                  className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {rangeError || activityError ? null : loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-slate-400 font-medium">Menganalisis data...</p>
          </div>
        ) : children.length === 0 ? (
          <Card className="border-dashed border-2 border-slate-200 bg-transparent">
            <CardContent className="p-10 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                <Filter size={32} />
              </div>
              <p className="text-slate-500 font-medium">Belum ada anak yang terhubung.</p>
              <button onClick={() => router.push('/dashboard')} className="text-blue-600 font-bold text-sm">Tambah Anak Sekarang &rarr;</button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            
            {/* Stats Overview */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-white border-none shadow-sm">
                <CardContent className="p-4 flex flex-col gap-1">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 mb-2">
                    <Droplet size={18} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rata-rata Harian</p>
                  <p className="text-xl font-black text-slate-800">{stats.avg} <span className="text-sm font-normal text-slate-400">ml</span></p>
                </CardContent>
              </Card>
              <Card className="bg-white border-none shadow-sm">
                <CardContent className="p-4 flex flex-col gap-1">
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600 mb-2">
                    <TrendingUp size={18} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Konsumsi</p>
                  <p className="text-xl font-black text-slate-800">{stats.total > 1000 ? (stats.total/1000).toFixed(1) : stats.total} <span className="text-sm font-normal text-slate-400">{stats.total > 1000 ? 'L' : 'ml'}</span></p>
                </CardContent>
              </Card>
            </div>

            {/* Main Chart Card */}
            <Card className="border-none shadow-sm overflow-hidden">
              <div className="bg-white px-5 py-4 border-b border-slate-50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <BarChartIcon size={18} className="text-slate-400" />
                  <h3 className="font-bold text-slate-800 text-sm">Tren Keseimbangan Cairan</h3>
                </div>
                <div className="flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded-lg">
                  <Award size={14} className="text-green-600" />
                  <span className="text-[10px] font-bold text-green-700">{stats.goalsReached} Hari Tercapai</span>
                </div>
              </div>
              <CardContent className="p-5 bg-white">
                <p className="mb-4 text-xs leading-5 text-slate-500">Setiap hari dibandingkan dengan Total Kebutuhan berdasarkan aktivitas anak pada tanggal tersebut. Ketuk grafik untuk melihat aktivitas dan target harian. Jika aktivitas belum dipilih, target sedang ditandai sebagai perkiraan. Rentang khusus maksimal 90 hari.</p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="displayDate" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 600}}
                        dy={10}
                      />
                      <YAxis hide />
                      <Tooltip 
                        cursor={{fill: '#f8fafc'}}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const day = payload[0].payload as (typeof chartData)[number];
                            return (
                              <div className="bg-slate-800 text-white p-2 rounded-xl shadow-xl border border-slate-700">
                                <p className="text-[10px] font-bold opacity-60 mb-1">{day.displayDate}</p>
                                <p className="text-sm font-black">Asupan: {day.volume} ml</p>
                                <p className="text-xs">Total kebutuhan: {day.requiredMl} ml</p>
                                <p className="text-xs capitalize">Aktivitas: {day.activityLevel} {day.isEstimated ? '(perkiraan)' : '(pilihan tersimpan)'}</p>
                                <p className="mt-1 text-xs font-bold">{!day.logs.length ? 'Belum ada catatan' : day.status.isAdequate ? 'Target tercapai' : 'Di bawah target'}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="volume" name="Asupan harian" radius={[6, 6, 0, 0]} barSize={chartData.length > 14 ? 6 : 20} isAnimationActive={false}>
                        {chartData.map((entry) => (
                          <Cell 
                            key={entry.dateKey}
                            fill={!entry.logs.length ? '#cbd5e1' : entry.status.isAdequate ? '#3b82f6' : '#f59e0b'}
                          />
                        ))}
                      </Bar>
                      <Line dataKey="requiredMl" name="Total kebutuhan harian" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Target Tercapai</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Di bawah Target</span>
                  </div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-slate-300"></div><span className="text-[10px] font-bold uppercase text-slate-500">Belum Ada Catatan</span></div>
                  <div className="flex items-center gap-2"><div className="h-0.5 w-4 bg-violet-500"></div><span className="text-[10px] font-bold uppercase text-slate-500">Total Kebutuhan Harian</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Survey History */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <ClipboardList size={18} className="text-slate-400" />
                <h3 className="font-bold text-slate-800 text-sm">Riwayat Aktivitas Kuis</h3>
              </div>
              
              {surveyResponses.length === 0 ? (
                <Card className="bg-slate-100/50 border-none">
                  <CardContent className="p-8 text-center">
                    <p className="text-sm text-slate-400 font-medium italic">Tidak ada kuis di periode ini.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {surveyResponses.map((s) => (
                    <Card key={s.id} className="border-none shadow-sm hover:translate-x-1 transition-transform cursor-default">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            s.surveys?.survey_type === 'pengetahuan' ? 'bg-purple-50 text-purple-600' : 'bg-teal-50 text-teal-600'
                          }`}>
                            <ClipboardList size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{s.surveys?.title}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                              {new Date(`${s.response_date}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase ${
                            s.surveys?.survey_type === 'pengetahuan' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                          }`}>
                            {s.surveys?.survey_type}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </>
  );
}
