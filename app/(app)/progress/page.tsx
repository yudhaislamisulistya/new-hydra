"use client";

import { useEffect, useState, useMemo } from "react";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { useUserStore } from "../../../store/useUserStore";
import { createClient } from "../../../utils/supabase/client";
import { useRouter } from "next/navigation";
import { formatLocalDateKey } from "../../../utils/hydrationCalc";
import { 
  Droplet, 
  ClipboardList, 
  TrendingUp, 
  Award,
  Filter,
  BarChart as BarChartIcon
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from "recharts";

type TimeRange = "daily" | "7d" | "14d" | "30d" | "custom";

type ChildProgressRow = {
  child_id: string;
  student_profiles: {
    student_code: string | null;
    daily_water_target_ml: number | null;
    weight_kg: number | null;
    profiles: {
      full_name: string | null;
    } | null;
  } | null;
};

type HydrationProgressLog = {
  amount_ml: number;
  logged_at: string;
};

type SurveyProgressResponse = {
  id: string;
  submitted_at: string;
  surveys: {
    title: string | null;
    survey_type: string | null;
  } | null;
};

type ProgressChartDatum = {
  date: string;
  displayDate: string;
  amount: number;
};

export default function ProgressPage() {
  const { profile, isAuthenticated, isLoading: userLoading } = useUserStore();
  const router = useRouter();
  const [children, setChildren] = useState<ChildProgressRow[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [customDates, setCustomDates] = useState({ start: "", end: "" });
  
  const [hydrationLogs, setHydrationLogs] = useState<HydrationProgressLog[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<SurveyProgressResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch: get children list
  useEffect(() => {
    async function fetchChildren() {
      if (!profile?.id || profile?.role !== 'parent') return;
      const supabase = createClient();
      const { data } = await supabase
        .from('parent_children')
        .select('child_id, student_profiles:child_id(student_code, daily_water_target_ml, weight_kg, profiles!student_profiles_id_fkey(full_name))')
        .eq('parent_id', profile.id);

      if (data && data.length > 0) {
        setChildren((data as ChildProgressRow[]) || []);
        setSelectedChildId(data[0].child_id);
      } else {
        setLoading(false);
      }
    }
    if (!userLoading && isAuthenticated) fetchChildren();
  }, [profile?.id, profile?.role, isAuthenticated, userLoading]);

  // Fetch data based on selected child and time range
  useEffect(() => {
    async function fetchData() {
      if (!selectedChildId) return;
      setLoading(true);
      const supabase = createClient();

      let startDate = new Date();
      let endDate = new Date();

      if (timeRange === "daily") {
        startDate.setHours(0, 0, 0, 0);
      } else if (timeRange === "7d") {
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
      } else if (timeRange === "14d") {
        startDate.setDate(startDate.getDate() - 13);
        startDate.setHours(0, 0, 0, 0);
      } else if (timeRange === "30d") {
        startDate.setDate(startDate.getDate() - 29);
        startDate.setHours(0, 0, 0, 0);
      } else if (timeRange === "custom" && customDates.start && customDates.end) {
        startDate = new Date(customDates.start);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customDates.end);
        endDate.setHours(23, 59, 59, 999);
      }

      // Fetch Hydration
      const { data: logs } = await supabase
        .from('hydration_logs')
        .select('amount_ml, logged_at')
        .eq('student_id', selectedChildId)
        .gte('logged_at', startDate.toISOString())
        .lte('logged_at', endDate.toISOString())
        .order('logged_at', { ascending: true });

      // Fetch Surveys
      const { data: surveys } = await supabase
        .from('survey_responses')
        .select('id, submitted_at, surveys(title, survey_type)')
        .eq('respondent_id', selectedChildId)
        .gte('submitted_at', startDate.toISOString())
        .lte('submitted_at', endDate.toISOString())
        .order('submitted_at', { ascending: false });

      setHydrationLogs(logs || []);
      setSurveyResponses((surveys as SurveyProgressResponse[]) || []);
      setLoading(false);
    }

    if (selectedChildId) fetchData();
  }, [selectedChildId, timeRange, customDates]);

  // Aggregate data for chart
  const chartData = useMemo<ProgressChartDatum[]>(() => {
    if (!hydrationLogs) return [];

    const dataMap: Record<string, number> = {};
    const labelMap: Record<string, string> = {};
    
    // Fill with zero for all days in range
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    let daysCount = timeRange === "7d" ? 7 : timeRange === "14d" ? 14 : timeRange === "30d" ? 30 : 1;
    
    if (timeRange !== "custom") {
      if (timeRange === "daily") {
        daysCount = 1;
      }
      for (let i = 0; i < daysCount; i++) {
        const d = new Date(endDate);
        d.setDate(endDate.getDate() - ((daysCount - 1) - i));
        const key = formatLocalDateKey(d);
        dataMap[key] = 0;
        labelMap[key] = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      }
    } else if (customDates.start && customDates.end) {
      const customStart = new Date(customDates.start);
      customStart.setHours(0, 0, 0, 0);
      const customEnd = new Date(customDates.end);
      customEnd.setHours(23, 59, 59, 999);
      const diffTime = Math.abs(customEnd.getTime() - customStart.getTime());
      daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      for (let i = 0; i < daysCount; i++) {
        const d = new Date(customStart);
        d.setDate(customStart.getDate() + i);
        const key = formatLocalDateKey(d);
        dataMap[key] = 0;
        labelMap[key] = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      }
    }

    hydrationLogs.forEach(log => {
      const dateKey = formatLocalDateKey(log.logged_at);
      dataMap[dateKey] = (dataMap[dateKey] || 0) + log.amount_ml;
      if (!labelMap[dateKey]) {
        labelMap[dateKey] = new Date(log.logged_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      }
    });

    return Object.entries(dataMap)
      .map(([date, amount]) => ({
        date,
        displayDate: labelMap[date] || new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        amount
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [hydrationLogs, timeRange, customDates.start, customDates.end]);

  const stats = useMemo(() => {
    const total = hydrationLogs.reduce((sum, l) => sum + l.amount_ml, 0);
    const avg = chartData.length > 0 ? Math.round(total / chartData.length) : 0;
    const child = children.find(c => c.child_id === selectedChildId);
    const target = child?.student_profiles?.daily_water_target_ml || 1500;
    const goalsReached = chartData.filter(d => d.amount >= target).length;
    
    return {
      total,
      avg,
      target,
      goalsReached,
      surveyCount: surveyResponses.length
    };
  }, [hydrationLogs, chartData, children, selectedChildId, surveyResponses]);

  if (profile?.role !== 'parent') {
    return (
      <>
        <Header title="Progress" />
        <div className="p-6 text-center text-slate-500">Halaman ini khusus untuk Orang Tua.</div>
      </>
    );
  }

  return (
    <>
      <Header title="Progress Detail" />
      <div className="p-6 space-y-6 pb-28 bg-slate-50 min-h-screen">
        
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
                {r === 'daily' ? 'Hari ini' : r === '7d' ? '7 Hari' : r === '14d' ? '14 Hari' : r === '30d' ? 'Bulanan' : 'Custom'}
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
                  value={customDates.start}
                  onChange={e => setCustomDates({...customDates, start: e.target.value})}
                  className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-2">Sampai</label>
                <input 
                  type="date" 
                  value={customDates.end}
                  onChange={e => setCustomDates({...customDates, end: e.target.value})}
                  className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {loading ? (
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
                  <h3 className="font-bold text-slate-800 text-sm">Tren Hidrasi</h3>
                </div>
                <div className="flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded-lg">
                  <Award size={14} className="text-green-600" />
                  <span className="text-[10px] font-bold text-green-700">{stats.goalsReached} Hari Tercapai</span>
                </div>
              </div>
              <CardContent className="p-5 bg-white">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
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
                            return (
                              <div className="bg-slate-800 text-white p-2 rounded-xl shadow-xl border border-slate-700">
                                <p className="text-[10px] font-bold opacity-60 mb-1">{payload[0].payload.displayDate}</p>
                                <p className="text-sm font-black">{payload[0].value} ml</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="amount" radius={[6, 6, 0, 0]} barSize={timeRange === '30d' ? 6 : 20}>
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.amount >= stats.target ? '#3b82f6' : '#94a3b8'} 
                            fillOpacity={entry.amount >= stats.target ? 1 : 0.3}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex justify-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Target Tercapai</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-slate-300 rounded-sm"></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Di bawah Target</span>
                  </div>
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
                              {new Date(s.submitted_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
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
