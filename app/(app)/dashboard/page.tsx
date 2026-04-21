"use client";

import { useEffect, useState } from "react";
import { useUserStore } from "../../../store/useUserStore";
import { useHydrationStore } from "../../../store/useHydrationStore";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { AlertCircle, Target, Activity, ClipboardList, CheckCircle2, Copy, UserPlus, Trash2, Droplet, ChevronRight, Sparkles, ChevronDown, ChevronUp, Clock3, Bell } from "lucide-react";
import Link from "next/link";
import { calculateRequiredIntake, type ActivityLevel, type Gender } from "../../../utils/hydrationCalc";
import { createClient } from "../../../utils/supabase/client";
import { getBuddyAccessory, getBuddyColor } from "../../../utils/hydrationBuddy";

type SurveySummary = {
  id: string;
  title: string;
  description: string | null;
};

type SurveyResponseRow = {
  survey_id: string;
};

type ChildLink = {
  id: string;
  child_id: string;
  student_profiles: {
    student_code: string | null;
    weight_kg: number | null;
    daily_water_target_ml: number | null;
    profiles: {
      full_name: string | null;
    } | null;
  } | null;
};

type HydrationHistoryItem = {
  id: string;
  amount_ml: number;
  drink_type: string | null;
  logged_at: string;
};

function getDrinkBadge(drinkType: string | null) {
  const healthyTypes = new Set([
    "Air minum utama",
    "Air putih/air matang",
    "Air mineral",
  ]);

  const moderateTypes = new Set([
    "Susu cair murni",
    "Susu dan produk susu cair",
    "Jus buah tanpa gula",
    "Minuman isotonik/sport drink",
  ]);

  if (!drinkType || healthyTypes.has(drinkType)) {
    return {
      label: "Sehat",
      badgeClassName: "bg-emerald-100 text-emerald-700 border border-emerald-200",
      dotClassName: "bg-emerald-500",
    };
  }

  if (moderateTypes.has(drinkType)) {
    return {
      label: "Cukup baik",
      badgeClassName: "bg-amber-100 text-amber-700 border border-amber-200",
      dotClassName: "bg-amber-500",
    };
  }

  return {
    label: "Kurang baik",
    badgeClassName: "bg-rose-100 text-rose-700 border border-rose-200",
    dotClassName: "bg-rose-500",
  };
}

export default function DashboardPage() {
  const { profile } = useUserStore();
  const today = new Date().toISOString().split("T")[0];
  const { records, fetchLogs } = useHydrationStore();
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("sedang");

  // Calculate the correct daily target using FBB × FG + FA
  const dailyTarget = profile?.role === "student"
    ? calculateRequiredIntake({
        weight_kg: profile?.weight_kg || 25,
        gender: (profile?.gender || "L") as Gender,
        activity_level: activityLevel,
      })
    : 1500;

  // Breakdown values for display
  const fbb = (() => {
    const w = profile?.weight_kg || 25;
    if (w <= 10) return 100 * w;
    if (w <= 20) return 1000 + 50 * (w - 10);
    return 1500 + 20 * (w - 20);
  })();
  const fg = profile?.gender === "female" ? 1.0 : 1.05;
  const fa = activityLevel === "rendah" ? 0 : activityLevel === "sedang" ? 375 : 750;

  useEffect(() => {
    if (profile?.id && profile?.role === "student") {
      fetchLogs(profile.id, dailyTarget);
    }
  }, [profile, activityLevel, fetchLogs, dailyTarget]);

  const todayRecord = records[today];
  const totalIntake = todayRecord?.total_intake_ml || 0;
  const fluidPercentage = dailyTarget > 0
    ? Math.min((totalIntake / dailyTarget) * 100, 100)
    : 0;
  const savedBuddyColor = profile?.id && profile.role === "student" && typeof window !== "undefined"
    ? localStorage.getItem(`avatar_color_${profile.id}`)
    : null;
  const savedBuddyAccessory = profile?.id && profile.role === "student" && typeof window !== "undefined"
    ? localStorage.getItem(`avatar_acc_${profile.id}`)
    : null;
  const buddyColorClass = getBuddyColor(savedBuddyColor || "blue").color;
  const buddyAccessoryConfig = getBuddyAccessory(savedBuddyAccessory || "none");
  const BuddyAccessoryIcon = buddyAccessoryConfig.icon;

  // Fetch surveys for the education mission section
  const [surveys, setSurveys] = useState<SurveySummary[]>([]);
  const [completedSurveyIds, setCompletedSurveyIds] = useState<Set<string>>(new Set());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hydrationHistory, setHydrationHistory] = useState<HydrationHistoryItem[]>([]);

  useEffect(() => {
    async function fetchSurveys() {
      if (!profile?.id) return;
      const supabase = createClient();
      
      const { data: surveysData } = await supabase
        .from('surveys')
        .select('id, title, description')
        .eq('is_active', true)
        .eq('target_role', 'student')
        .order('created_at', { ascending: false })
        .limit(4);
      
      setSurveys(surveysData || []);

      // Check today's completions
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: responses } = await supabase
        .from('survey_responses')
        .select('survey_id')
        .eq('respondent_id', profile.id)
        .gte('submitted_at', todayStart.toISOString());

      setCompletedSurveyIds(new Set((responses as SurveyResponseRow[] | null || []).map((r) => r.survey_id)));
    }
    fetchSurveys();
  }, [profile?.id]);

  useEffect(() => {
    async function fetchHydrationHistory() {
      if (!isHistoryOpen || !profile?.id || profile.role !== "student") return;

      setHistoryLoading(true);
      const supabase = createClient();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("hydration_logs")
        .select("id, amount_ml, drink_type, logged_at")
        .eq("student_id", profile.id)
        .gte("logged_at", todayStart.toISOString())
        .order("logged_at", { ascending: false });

      if (error) {
        console.error("Error fetching hydration history:", error);
        setHydrationHistory([]);
      } else {
        setHydrationHistory((data as HydrationHistoryItem[]) || []);
      }

      setHistoryLoading(false);
    }

    fetchHydrationHistory();
  }, [isHistoryOpen, profile?.id, profile?.role, totalIntake]);

  // ── Student code copy state ──
  const [codeCopied, setCodeCopied] = useState(false);
  const handleCopyCode = () => {
    if (profile?.student_code) {
      navigator.clipboard.writeText(profile.student_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  // ── Parent: children state ──
  const [children, setChildren] = useState<ChildLink[]>([]);
  const [childCode, setChildCode] = useState('');
  const [addingChild, setAddingChild] = useState(false);
  const [childError, setChildError] = useState('');
  const [sendingReminderTo, setSendingReminderTo] = useState<string | null>(null);

  useEffect(() => {
    async function fetchChildren() {
      if (!profile?.id || profile?.role !== 'parent') return;
      const supabase = createClient();
      const { data } = await supabase
        .from('parent_children')
        .select('id, child_id, student_profiles:child_id(id, student_code, weight_kg, height_cm, daily_water_target_ml, profiles!student_profiles_id_fkey(full_name))')
        .eq('parent_id', profile.id);
      setChildren(data || []);
    }
    fetchChildren();
  }, [profile?.id, profile?.role]);

  const handleAddChild = async () => {
    if (!childCode.trim() || !profile?.id) return;
    setAddingChild(true);
    setChildError('');
    const supabase = createClient();
    try {
      // Find student by code
      const { data: student, error: findErr } = await supabase
        .from('student_profiles')
        .select('id, student_code')
        .eq('student_code', childCode.trim().toUpperCase())
        .single();
      if (findErr || !student) {
        setChildError('Kode siswa tidak ditemukan.');
        setAddingChild(false);
        return;
      }
      // Link
      const { error: linkErr } = await supabase
        .from('parent_children')
        .insert({ parent_id: profile.id, child_id: student.id });
      if (linkErr) {
        setChildError(linkErr.code === '23505' ? 'Anak sudah ditambahkan.' : linkErr.message);
        setAddingChild(false);
        return;
      }
      // Refresh
      setChildCode('');
      const { data } = await supabase
        .from('parent_children')
        .select('id, child_id, student_profiles:child_id(id, student_code, weight_kg, height_cm, daily_water_target_ml, profiles!student_profiles_id_fkey(full_name))')
        .eq('parent_id', profile.id);
      setChildren(data || []);
    } catch (err: unknown) {
      setChildError(err instanceof Error ? err.message : 'Terjadi kesalahan saat menambahkan anak.');
    } finally {
      setAddingChild(false);
    }
  };

  const handleRemoveChild = async (linkId: string) => {
    if (!confirm('Hapus anak dari daftar Anda?')) return;
    const supabase = createClient();
    await supabase.from('parent_children').delete().eq('id', linkId);
    setChildren(children.filter(c => c.id !== linkId));
  };

  const handleSendReminder = async (childId: string, childName: string) => {
    if (!profile?.id) return;

    setSendingReminderTo(childId);
    const supabase = createClient();

    try {
      const { error } = await supabase.from("child_notifications").insert({
        child_id: childId,
        sender_parent_id: profile.id,
        title: "Pengingat Minum",
        message: `${profile.nickname || "Orang tua"} mengingatkan ${childName} untuk minum air dan menjaga hidrasi hari ini.`,
        type: "reminder",
      });

      if (error) throw error;
      alert(`Pengingat berhasil dikirim ke ${childName}.`);
    } catch (error) {
      console.error("Error sending reminder:", error);
      alert(`Gagal mengirim pengingat: ${error instanceof Error ? error.message : "Terjadi kesalahan."}`);
    } finally {
      setSendingReminderTo(null);
    }
  };

  if (profile?.role === "parent") {
    return (
      <>
        <Header title="Dashboard Orang Tua" />
        <div className="p-6 space-y-6">
          <Card className="bg-gradient-to-r from-teal-500 to-teal-400 text-white">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-1">Pantau Anak Anda</h2>
              <p className="text-teal-50 text-sm">Tambahkan anak dengan memasukkan kode siswa mereka.</p>
            </CardContent>
          </Card>

          {/* Add Child by Code */}
          <Card className="border-2 border-teal-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus size={18} className="text-teal-600" />
                <h3 className="font-bold text-slate-800 text-sm">Tambah Anak</h3>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Masukkan kode siswa (5 huruf)"
                  value={childCode}
                  onChange={(e) => setChildCode(e.target.value.toUpperCase())}
                  maxLength={5}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono tracking-widest text-center uppercase focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
                <button
                  onClick={handleAddChild}
                  disabled={addingChild || childCode.length < 5}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
                >
                  {addingChild ? '...' : 'Tambah'}
                </button>
              </div>
              {childError && <p className="text-xs text-red-500 mt-2 font-medium">{childError}</p>}
            </CardContent>
          </Card>

          {/* Children List */}
          <div>
            <h3 className="font-bold text-slate-800 text-lg mb-3">Daftar Anak ({children.length})</h3>
            {children.length === 0 ? (
              <Card>
                <CardContent className="p-5 text-center text-slate-400 text-sm">
                  Belum ada anak yang ditambahkan. Minta kode siswa dari anak Anda.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {children.map((c) => (
                  <Card key={c.id} className="border border-slate-200">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm">
                          {(c.student_profiles?.profiles?.full_name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{c.student_profiles?.profiles?.full_name || 'Siswa'}</p>
                          <p className="text-[10px] text-slate-400 font-mono">Kode: {c.student_profiles?.student_code}</p>
                          <p className="text-[10px] text-slate-500">
                            BB: {c.student_profiles?.weight_kg || '-'}kg &bull; Target: {c.student_profiles?.daily_water_target_ml || '-'}ml
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleSendReminder(c.child_id, c.student_profiles?.profiles?.full_name || "anak")}
                          disabled={sendingReminderTo === c.child_id}
                          className="p-2 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors disabled:opacity-50"
                          title="Kirim pengingat minum"
                        >
                          <Bell size={16} />
                        </button>
                        <button onClick={() => handleRemoveChild(c.id)} className="text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Halo, Teman!" />
      <div className="p-6 space-y-6">
        
        {/* Student Code Card */}
        {profile?.student_code && (
          <Card className="border-2 border-indigo-200 bg-indigo-50">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Kode Siswa Kamu</p>
                <p className="text-2xl font-extrabold text-indigo-800 font-mono tracking-[0.3em] mt-1">{profile.student_code}</p>
                <p className="text-[10px] text-indigo-400 mt-1">Berikan kode ini ke orang tua agar bisa memantau.</p>
              </div>
              <button
                onClick={handleCopyCode}
                className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all ${
                  codeCopied
                    ? 'bg-green-100 text-green-700'
                    : 'bg-indigo-200 text-indigo-700 hover:bg-indigo-300'
                }`}
              >
                {codeCopied ? <><CheckCircle2 size={16} /> Tersalin!</> : <><Copy size={16} /> Salin</>}
              </button>
            </CardContent>
          </Card>
        )}

        {/* Profile & Character Button */}
        <Link href="/profile" className="block mb-4">
          <Card className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white overflow-hidden relative hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                  <Droplet size={48} className={`${buddyColorClass} fill-current absolute drop-shadow-sm`} strokeWidth={1.5} />
                  {BuddyAccessoryIcon ? (
                    <BuddyAccessoryIcon size={24} className={`${buddyAccessoryConfig.color || "text-yellow-300"} relative z-10 -translate-y-2`} />
                  ) : (
                    <Sparkles size={18} className="relative z-10 text-yellow-300" />
                  )}
                </div>
                <div>
                  <p className="font-bold text-base">Hydration Buddy</p>
                  <p className="text-white/75 text-xs mt-0.5">
                    Aksesoris: {buddyAccessoryConfig.name}
                  </p>
                </div>
              </div>
              <ChevronRight size={22} className="text-white/70 shrink-0" />
            </CardContent>
          </Card>
        </Link>

        {fluidPercentage < 100 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 items-start">
            <AlertCircle className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800 text-sm">Waktunya Minum!</h3>
              <p className="text-xs text-amber-700 mt-1">Kamu belum mencapai target minum hari ini. Jangan lupa nonton video edukasi ya!</p>
              <Link href="/education" className="inline-block mt-2 text-xs font-bold text-blue-600 bg-white px-3 py-1.5 rounded-full shadow-sm border border-amber-100">
                Tonton Video
              </Link>
            </div>
          </div>
        )}

        {/* Activity Level Selector */}
        <Card className="border-2 border-blue-100">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={18} className="text-blue-500" />
              <h3 className="font-bold text-slate-800 text-sm">Aktivitas Hari Ini (FA)</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "rendah", label: "Rendah", desc: "Duduk, Nonton", fa: 0 },
                { value: "sedang", label: "Sedang", desc: "Main, Sepeda", fa: 375 },
                { value: "tinggi", label: "Tinggi", desc: "Olahraga", fa: 750 },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setActivityLevel(opt.value)}
                  className={`p-3 rounded-xl text-center transition-all ${
                    activityLevel === opt.value
                      ? "bg-blue-500 text-white shadow-md ring-2 ring-blue-300"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <p className="text-sm font-bold">{opt.label}</p>
                  <p className={`text-[10px] mt-0.5 ${activityLevel === opt.value ? 'text-blue-100' : 'text-slate-400'}`}>{opt.desc}</p>
                  <p className={`text-[10px] font-bold mt-1 ${activityLevel === opt.value ? 'text-blue-200' : 'text-slate-400'}`}>+{opt.fa} ml</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main Target Card */}
        <button
          type="button"
          onClick={() => setIsHistoryOpen((prev) => !prev)}
          aria-expanded={isHistoryOpen}
          className="block w-full text-left rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2"
        >
          <Card className="bg-blue-500 text-white overflow-hidden relative cursor-pointer transition-transform active:scale-[0.99]">
            <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full translate-x-1/2 -translate-y-1/2" />
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Target size={20} className="text-blue-200" />
                  <h2 className="font-bold">Target Minum Harian</h2>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-blue-100">
                  <span>{isHistoryOpen ? "Tutup riwayat" : "Lihat riwayat"}</span>
                  {isHistoryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
              
              <div className="mb-2 flex justify-between items-end">
                <div>
                  <span className="text-3xl font-extrabold">{totalIntake}</span>
                  <span className="text-blue-200 ml-1">/ {dailyTarget} ml</span>
                </div>
                <span className="font-bold">{Math.round(fluidPercentage)}%</span>
              </div>
              
              <ProgressBar progress={fluidPercentage} colorClass="bg-white" heightClass="h-4" />

              {/* Formula Breakdown */}
              <div className="mt-4 bg-white/10 rounded-xl p-3 text-xs">
                <p className="text-blue-100 font-bold mb-1">Perhitungan: FBB × FG + FA</p>
                <div className="flex justify-between text-blue-100">
                  <span>FBB (BB: {profile?.weight_kg || 25}kg)</span>
                  <span className="font-bold text-white">{Math.round(fbb)} ml</span>
                </div>
                <div className="flex justify-between text-blue-100">
                  <span>FG ({profile?.gender === "female" ? "Perempuan" : "Laki-laki"})</span>
                  <span className="font-bold text-white">× {fg}</span>
                </div>
                <div className="flex justify-between text-blue-100">
                  <span>FA ({activityLevel})</span>
                  <span className="font-bold text-white">+ {fa} ml</span>
                </div>
                <div className="flex justify-between text-white font-bold border-t border-white/20 mt-2 pt-2">
                  <span>Total Kebutuhan</span>
                  <span>{dailyTarget} ml</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {isHistoryOpen && (
          <Card className="border-2 border-blue-100 shadow-sm animate-fade-in-up">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Riwayat Minum Hari Ini</h3>
                  <p className="text-xs text-slate-500 mt-1">Klik tracker untuk menambahkan data baru. Warna hijau menandakan pilihan yang lebih sehat.</p>
                </div>
                <Link href="/tracker" className="text-xs font-bold text-blue-600 shrink-0">
                  Buka Tracker
                </Link>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Sehat
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Cukup baik
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Kurang baik
                </span>
              </div>

              {historyLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                  Memuat riwayat minum...
                </div>
              ) : hydrationHistory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-500">Belum ada riwayat minum hari ini.</p>
                  <p className="text-xs text-slate-400 mt-1">Coba catat minuman pertama kamu lewat menu tracker.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {hydrationHistory.map((log) => {
                    const badge = getDrinkBadge(log.drink_type);

                    return (
                      <div key={log.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                              <Clock3 size={12} />
                              <span>{new Date(log.logged_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            <p className="font-bold text-slate-800 text-sm">{log.drink_type || "Air putih"}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{log.amount_ml} ml</p>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0 ${badge.badgeClassName}`}>
                            <span className={`w-2 h-2 rounded-full ${badge.dotClassName}`} />
                            {badge.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="pb-24">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-slate-800 text-lg">Kuis & Survei</h3>
            <Link href="/survey" className="text-xs font-bold text-blue-600">Lihat Semua &rarr;</Link>
          </div>
          {surveys.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-center text-slate-400 text-sm">
                Belum ada kuis tersedia saat ini.
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {surveys.map(s => {
                const isDone = completedSurveyIds.has(s.id);
                return (
                  <Link href="/survey" key={s.id} className="block">
                    <Card className={`border transition-all ${isDone ? 'border-green-300 bg-green-50' : 'border-slate-200 hover:border-blue-300'}`}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDone ? 'bg-green-100' : 'bg-blue-100'}`}>
                          {isDone ? <CheckCircle2 size={20} className="text-green-500" /> : <ClipboardList size={20} className="text-blue-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{s.title}</p>
                          {s.description && <p className="text-[11px] text-slate-500 truncate mt-0.5">{s.description}</p>}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${isDone ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {isDone ? 'Selesai' : 'Mulai'}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
