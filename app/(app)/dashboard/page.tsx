"use client";

import { useEffect, useMemo, useState } from "react";
import { useUserStore } from "../../../store/useUserStore";
import { useHydrationStore } from "../../../store/useHydrationStore";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { AlertCircle, Target, Activity, ClipboardList, CheckCircle2, Copy, UserPlus, Trash2, Droplet, ChevronRight, Sparkles, ChevronDown, ChevronUp, Clock3, Bell, GraduationCap, School2, Phone, IdCard, BriefcaseBusiness, Wallet, CalendarDays, MessageSquareText, SendHorizonal, Users, Zap } from "lucide-react";
import Link from "next/link";
import { calculateRequiredIntake, formatLocalDateKey, type ActivityLevel, type Gender } from "../../../utils/hydrationCalc";
import { createClient } from "../../../utils/supabase/client";
import { getBuddyAccessory, getBuddyColor } from "../../../utils/hydrationBuddy";
import { buildHydrationPeriodSummaries, getAdequacyStatus } from "../../../utils/hydrationInsights";
import { BANYUMAS_UMK_2026, BANYUMAS_UMK_2026_LABEL, classifyParentIncome, formatCurrencyId, getParentEducationLabel, getParentGenderLabel } from "../../../utils/parentProfile";
import { buildCheckinStats, getCheckinReward, MAX_STREAK_BONUS_DAYS } from "../../../utils/gamification";

type SurveySummary = {
  id: string;
  title: string;
  description: string | null;
  survey_type: string | null;
};

type SurveyResponseRow = {
  survey_id: string;
};

const REQUIRED_DAILY_QUIZ_TYPES = new Set(["sikap", "pengetahuan"]);

function isRequiredDailyQuiz(survey: SurveySummary) {
  const normalizedTitle = survey.title.toLowerCase();
  return REQUIRED_DAILY_QUIZ_TYPES.has(survey.survey_type || "") && normalizedTitle.includes("dehidrasi");
}

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

type ChildLinkQueryRow = {
  id: string;
  child_id: string;
  student_profiles: {
    student_code: string | null;
    weight_kg: number | null;
    daily_water_target_ml: number | null;
    profiles: {
      full_name: string | null;
    }[] | {
      full_name: string | null;
    } | null;
  }[] | {
    student_code: string | null;
    weight_kg: number | null;
    daily_water_target_ml: number | null;
    profiles: {
      full_name: string | null;
    }[] | {
      full_name: string | null;
    } | null;
  } | null;
};

const normalizeChildLinks = (rows: ChildLinkQueryRow[] | null): ChildLink[] => {
  return (rows || []).map((row) => {
    const rawStudentProfile = Array.isArray(row.student_profiles)
      ? row.student_profiles[0]
      : row.student_profiles;

    const rawProfile = rawStudentProfile?.profiles;
    const normalizedProfile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;

    return {
      id: row.id,
      child_id: row.child_id,
      student_profiles: rawStudentProfile
        ? {
            student_code: rawStudentProfile.student_code ?? null,
            weight_kg: rawStudentProfile.weight_kg ?? null,
            daily_water_target_ml: rawStudentProfile.daily_water_target_ml ?? null,
            profiles: normalizedProfile
              ? { full_name: normalizedProfile.full_name ?? null }
              : null,
          }
        : null,
    };
  });
};

type HydrationHistoryItem = {
  id: string;
  amount_ml: number;
  drink_type: string | null;
  logged_at: string;
};

type TeacherHydrationLogItem = HydrationHistoryItem & {
  student_id: string;
};

type DailyCheckinRow = {
  checkin_date: string;
  xp_earned: number | null;
};

type ChildDailyHydrationStatus = {
  totalIntakeMl: number;
  targetMl: number;
  remainingMl: number;
  isAdequate: boolean;
  progressPercent: number;
};

type TeacherStudentSummary = {
  id: string;
  student_code: string | null;
  class_level: number | null;
  child_order: number | null;
  daily_water_target_ml: number | null;
  profiles: {
    full_name: string | null;
  } | null;
};

type TeacherStudentQueryRow = {
  id: string;
  student_code: string | null;
  class_level: number | null;
  child_order: number | null;
  daily_water_target_ml: number | null;
  profiles: {
    full_name: string | null;
  }[] | {
    full_name: string | null;
  } | null;
};

const normalizeTeacherStudents = (rows: TeacherStudentQueryRow[] | null): TeacherStudentSummary[] => {
  return (rows || []).map((row) => {
    const rawProfile = row.profiles;
    const normalizedProfile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;

    return {
      id: row.id,
      student_code: row.student_code ?? null,
      class_level: row.class_level ?? null,
      child_order: row.child_order ?? null,
      daily_water_target_ml: row.daily_water_target_ml ?? null,
      profiles: normalizedProfile
        ? { full_name: normalizedProfile.full_name ?? null }
        : null,
    };
  });
};

export default function DashboardPage() {
  const { profile } = useUserStore();
  const today = formatLocalDateKey(new Date());
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
  const adequacyStatus = getAdequacyStatus(totalIntake, dailyTarget);
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
  const hydrationPeriodSummaries = useMemo(() => buildHydrationPeriodSummaries(hydrationHistory), [hydrationHistory]);
  const [showDailyGuideModal, setShowDailyGuideModal] = useState(false);
  const [expandedDailyGuideStep, setExpandedDailyGuideStep] = useState<number | null>(0);
  const [studentCheckins, setStudentCheckins] = useState<DailyCheckinRow[]>([]);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinError, setCheckinError] = useState("");
  const checkinStats = useMemo(() => buildCheckinStats(studentCheckins), [studentCheckins]);

  useEffect(() => {
    async function fetchSurveys() {
      if (!profile?.id) return;
      const supabase = createClient();
      
      const { data: surveysData } = await supabase
        .from('surveys')
        .select('id, title, description, survey_type')
        .eq('is_active', true)
        .eq('target_role', 'student')
        .order('created_at', { ascending: false })
        .limit(10);
      
      const quizItems = ((surveysData as SurveySummary[] | null) || [])
        .filter(isRequiredDailyQuiz)
        .sort((a, b) => {
          const priority = { pengetahuan: 0, sikap: 1 };
          return (priority[a.survey_type as keyof typeof priority] ?? 99) - (priority[b.survey_type as keyof typeof priority] ?? 99);
        })
        .slice(0, 2);

      setSurveys(quizItems);

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

  useEffect(() => {
    async function fetchStudentCheckins() {
      if (!profile?.id || profile.role !== "student") {
        setStudentCheckins([]);
        setCheckinError("");
        return;
      }

      setCheckinLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("daily_checkins")
        .select("checkin_date, xp_earned")
        .eq("student_id", profile.id)
        .order("checkin_date", { ascending: false })
        .limit(90);

      if (error) {
        console.error("Error fetching daily checkins:", error);
        setStudentCheckins([]);
        setCheckinError("Fitur check-in harian belum aktif. Jalankan tabel daily_checkins terlebih dahulu.");
      } else {
        setStudentCheckins((data as DailyCheckinRow[] | null) || []);
        setCheckinError("");
      }

      setCheckinLoading(false);
    }

    void fetchStudentCheckins();
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (!profile?.id || profile.role !== "student" || typeof window === "undefined") return;

    const guideKey = `daily-guide-seen-${profile.id}-${today}`;
    const hasSeenGuide = window.localStorage.getItem(guideKey);

    if (!hasSeenGuide) {
      const timeoutId = window.setTimeout(() => {
        setShowDailyGuideModal(true);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [profile?.id, profile?.role, today]);

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
  const [sendingFeedbackTo, setSendingFeedbackTo] = useState<string | null>(null);
  const [activeFeedbackChildId, setActiveFeedbackChildId] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [childHydrationMap, setChildHydrationMap] = useState<Record<string, ChildDailyHydrationStatus>>({});
  const [teacherStudents, setTeacherStudents] = useState<TeacherStudentSummary[]>([]);
  const [teacherStudentsLoading, setTeacherStudentsLoading] = useState(false);
  const [teacherHydrationMap, setTeacherHydrationMap] = useState<Record<string, ChildDailyHydrationStatus>>({});
  const [teacherHydrationLogsMap, setTeacherHydrationLogsMap] = useState<Record<string, HydrationHistoryItem[]>>({});
  const [sendingTeacherReminderTo, setSendingTeacherReminderTo] = useState<string | null>(null);

  useEffect(() => {
    async function fetchChildren() {
      if (!profile?.id || profile?.role !== 'parent') return;
      const supabase = createClient();
      const { data } = await supabase
        .from('parent_children')
        .select('id, child_id, student_profiles:child_id(id, student_code, weight_kg, height_cm, daily_water_target_ml, profiles!student_profiles_id_fkey(full_name))')
        .eq('parent_id', profile.id);
      setChildren(normalizeChildLinks((data as ChildLinkQueryRow[] | null) || null));
    }
    fetchChildren();
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    async function fetchChildrenHydration() {
      if (profile?.role !== "parent" || children.length === 0) {
        setChildHydrationMap({});
        return;
      }

      const supabase = createClient();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const childIds = children.map((child) => child.child_id);

      const { data, error } = await supabase
        .from("hydration_logs")
        .select("student_id, amount_ml")
        .in("student_id", childIds)
        .gte("logged_at", todayStart.toISOString());

      if (error) {
        console.error("Error fetching child hydration summary:", error);
        return;
      }

      const totals = ((data as Array<{ student_id: string; amount_ml: number }> | null) || []).reduce<Record<string, number>>((acc, row) => {
        acc[row.student_id] = (acc[row.student_id] || 0) + row.amount_ml;
        return acc;
      }, {});

      const nextMap = children.reduce<Record<string, ChildDailyHydrationStatus>>((acc, child) => {
        const targetMl = child.student_profiles?.daily_water_target_ml || 1500;
        const totalIntakeMl = totals[child.child_id] || 0;
        const remainingMl = Math.max(targetMl - totalIntakeMl, 0);
        acc[child.child_id] = {
          totalIntakeMl,
          targetMl,
          remainingMl,
          isAdequate: totalIntakeMl >= targetMl,
          progressPercent: targetMl > 0 ? Math.min((totalIntakeMl / targetMl) * 100, 100) : 0,
        };
        return acc;
      }, {});

      setChildHydrationMap(nextMap);
    }

    void fetchChildrenHydration();
  }, [children, profile?.role]);

  useEffect(() => {
    async function fetchTeacherStudents() {
      if (profile?.role !== "teacher" || !profile.school_id) {
        setTeacherStudents([]);
        return;
      }

      setTeacherStudentsLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("student_profiles")
        .select("id, student_code, class_level, child_order, daily_water_target_ml, profiles!student_profiles_id_fkey(full_name)")
        .eq("school_id", profile.school_id)
        .order("class_level", { ascending: true })
        .order("student_code", { ascending: true });

      if (error) {
        console.error("Error fetching teacher students:", error);
        setTeacherStudents([]);
      } else {
        setTeacherStudents(normalizeTeacherStudents((data as TeacherStudentQueryRow[] | null) || null));
      }

      setTeacherStudentsLoading(false);
    }

    void fetchTeacherStudents();
  }, [profile?.role, profile?.school_id]);

  useEffect(() => {
    async function fetchTeacherHydration() {
      if (profile?.role !== "teacher" || teacherStudents.length === 0) {
        setTeacherHydrationMap({});
        setTeacherHydrationLogsMap({});
        return;
      }

      const supabase = createClient();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const studentIds = teacherStudents.map((student) => student.id);

      const { data, error } = await supabase
        .from("hydration_logs")
        .select("id, student_id, amount_ml, drink_type, logged_at")
        .in("student_id", studentIds)
        .gte("logged_at", todayStart.toISOString())
        .order("logged_at", { ascending: false });

      if (error) {
        console.error("Error fetching teacher hydration summary:", error);
        return;
      }

      const hydrationLogs = (data as TeacherHydrationLogItem[] | null) || [];

      const totals = hydrationLogs.reduce<Record<string, number>>((acc, row) => {
        acc[row.student_id] = (acc[row.student_id] || 0) + row.amount_ml;
        return acc;
      }, {});

      const logsMap = hydrationLogs.reduce<Record<string, HydrationHistoryItem[]>>((acc, row) => {
        if (!acc[row.student_id]) {
          acc[row.student_id] = [];
        }

        acc[row.student_id].push({
          id: row.id,
          amount_ml: row.amount_ml,
          drink_type: row.drink_type,
          logged_at: row.logged_at,
        });

        return acc;
      }, {});

      const nextMap = teacherStudents.reduce<Record<string, ChildDailyHydrationStatus>>((acc, student) => {
        const targetMl = student.daily_water_target_ml || 1500;
        const totalIntakeMl = totals[student.id] || 0;
        const remainingMl = Math.max(targetMl - totalIntakeMl, 0);

        acc[student.id] = {
          totalIntakeMl,
          targetMl,
          remainingMl,
          isAdequate: totalIntakeMl >= targetMl,
          progressPercent: targetMl > 0 ? Math.min((totalIntakeMl / targetMl) * 100, 100) : 0,
        };

        return acc;
      }, {});

      setTeacherHydrationMap(nextMap);
      setTeacherHydrationLogsMap(logsMap);
    }

    void fetchTeacherHydration();
  }, [teacherStudents, profile?.role]);

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
      setChildren(normalizeChildLinks((data as ChildLinkQueryRow[] | null) || null));
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

  const handleSendFeedback = async (childId: string, childName: string) => {
    if (!profile?.id) return;

    const childStatus = childHydrationMap[childId];
    const customFeedback = feedbackDrafts[childId]?.trim();

    if (!childStatus || childStatus.isAdequate) {
      alert("Feedback harian hanya dikirim saat target minum anak belum tercapai.");
      return;
    }

    const feedbackMessage = customFeedback || `${childName}, ayo tambah minum air putih hari ini. Kamu masih perlu ${childStatus.remainingMl} ml lagi agar target harian tercapai.`;

    setSendingFeedbackTo(childId);
    const supabase = createClient();

    try {
      const { error } = await supabase.from("child_notifications").insert({
        child_id: childId,
        sender_parent_id: profile.id,
        title: "Feedback Hidrasi Harian",
        message: `${feedbackMessage} Saat ini baru ${childStatus.totalIntakeMl} ml dari target ${childStatus.targetMl} ml.`,
        type: "feedback",
      });

      if (error) throw error;

      alert(`Feedback harian berhasil dikirim ke ${childName}.`);
      setFeedbackDrafts((current) => ({ ...current, [childId]: "" }));
      setActiveFeedbackChildId(null);
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (error) {
      console.error("Error sending feedback:", error);
      alert(`Gagal mengirim feedback: ${error instanceof Error ? error.message : "Terjadi kesalahan."}`);
    } finally {
      setSendingFeedbackTo(null);
    }
  };

  const handleSendTeacherReminder = async (studentId: string, studentName: string) => {
    if (!profile?.id) return;

    const studentStatus = teacherHydrationMap[studentId];

    if (!studentStatus || studentStatus.isAdequate) {
      alert("Pengingat hanya dikirim saat target minum siswa belum tercapai.");
      return;
    }

    setSendingTeacherReminderTo(studentId);
    const supabase = createClient();

    try {
      const { error } = await supabase.from("child_notifications").insert({
        child_id: studentId,
        sender_parent_id: profile.id,
        title: "Pengingat Minum dari Guru",
        message: `${profile.nickname || "Guru"} mengingatkan ${studentName} untuk menambah minum air putih hari ini. Saat ini baru ${studentStatus.totalIntakeMl} ml dari target ${studentStatus.targetMl} ml, sehingga masih kurang ${studentStatus.remainingMl} ml.`,
        type: "reminder",
      });

      if (error) throw error;

      alert(`Pengingat berhasil dikirim ke ${studentName}.`);
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (error) {
      console.error("Error sending teacher reminder:", error);
      alert(`Gagal mengirim pengingat: ${error instanceof Error ? error.message : "Terjadi kesalahan."}`);
    } finally {
      setSendingTeacherReminderTo(null);
    }
  };

  const handleDailyCheckin = async () => {
    if (!profile?.id || profile.role !== "student" || checkinStats.checkedInToday) return;

    const reward = getCheckinReward(checkinStats.nextStreak);
    setCheckinSaving(true);
    setCheckinError("");
    const supabase = createClient();

    try {
      const { error } = await supabase.from("daily_checkins").insert({
        student_id: profile.id,
        checkin_date: today,
        xp_earned: reward.totalXp,
      });

      if (error) throw error;

      setStudentCheckins((current) => [{ checkin_date: today, xp_earned: reward.totalXp }, ...current]);
      alert(`Check-in harian berhasil. Kamu mendapatkan ${reward.totalXp} XP dengan streak ${reward.streakAfterCheckin} hari.`);
    } catch (error) {
      console.error("Error saving daily checkin:", error);
      setCheckinError(error instanceof Error ? error.message : "Gagal menyimpan check-in harian.");
    } finally {
      setCheckinSaving(false);
    }
  };

  const handleCloseDailyGuideModal = () => {
    if (profile?.id && typeof window !== "undefined") {
      window.localStorage.setItem(`daily-guide-seen-${profile.id}-${today}`, "seen");
    }
    setShowDailyGuideModal(false);
  };

  if (profile?.role === "teacher") {
    return (
      <>
        <Header title="Dashboard Guru" />
        <div className="p-6 space-y-6">
          <Card className="bg-gradient-to-r from-violet-500 to-indigo-500 text-white">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-violet-100 text-sm font-medium">Akun Guru Aktif</p>
                  <h2 className="mt-2 text-2xl font-extrabold">{profile.nickname}</h2>
                  <p className="mt-2 text-sm text-violet-100">
                    Data guru sudah terhubung ke sekolah dan sudah tercatat sebagai role guru di aplikasi.
                  </p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <GraduationCap size={30} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="rounded-2xl bg-violet-100 p-3 text-violet-600">
                  <School2 size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sekolah</p>
                  <p className="mt-1 text-base font-bold text-slate-800">{profile.school_name || "Belum diatur"}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-600">
                  <IdCard size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Nomor Induk</p>
                  <p className="mt-1 text-base font-bold text-slate-800">{profile.employee_number || "Belum diatur"}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="rounded-2xl bg-sky-100 p-3 text-sky-600">
                  <Phone size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Nomor HP</p>
                  <p className="mt-1 text-base font-bold text-slate-800">{profile.phone || "Belum diatur"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border border-violet-100 bg-violet-50/60">
            <CardContent className="p-5">
              <p className="text-sm font-bold text-violet-800">Info Akun Guru</p>
              <p className="mt-2 text-sm text-slate-600">
                Pendaftaran akun guru sudah aktif. Data guru sekarang tersimpan dengan sekolah, nomor induk, jenis kelamin, dan nomor HP, serta muncul di dashboard admin dan daftar user.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Jabatan / gelar: <span className="font-semibold text-slate-700">{profile.full_title || "Belum diatur"}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Daftar Siswa Sekolah</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Halaman guru hanya menampilkan siswa yang terdaftar pada sekolah {profile.school_name || "yang terhubung"}.
                  </p>
                </div>
                <div className="rounded-2xl bg-violet-100 px-4 py-3 text-violet-700">
                  <p className="text-[10px] font-bold uppercase tracking-wider">Total Siswa</p>
                  <p className="mt-1 text-2xl font-extrabold">{teacherStudents.length}</p>
                </div>
              </div>

              {!profile.school_id ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Akun guru belum terhubung ke sekolah, jadi daftar siswa belum bisa ditampilkan.
                </div>
              ) : teacherStudentsLoading ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Memuat daftar siswa...
                </div>
              ) : teacherStudents.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Belum ada siswa yang terdaftar pada sekolah ini.
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {teacherStudents.map((student) => {
                    const studentStatus = teacherHydrationMap[student.id] || {
                      totalIntakeMl: 0,
                      targetMl: student.daily_water_target_ml || 1500,
                      remainingMl: student.daily_water_target_ml || 1500,
                      isAdequate: false,
                      progressPercent: 0,
                    };
                    const studentName = student.profiles?.full_name || "Siswa";
                    const studentLogs = teacherHydrationLogsMap[student.id] || [];

                    return (
                      <div key={student.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                            <Users size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">
                              {studentName}
                            </p>
                            <p className="mt-1 text-[11px] font-mono text-slate-400">
                              Kode: {student.student_code || "-"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-600">
                              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                                {student.class_level ? `Kelas ${student.class_level}` : "Kelas belum diisi"}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                                {student.child_order ? `Anak ke-${student.child_order}` : "Anak ke belum diisi"}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                                Target: {student.daily_water_target_ml || "-"} ml
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-white p-3 border border-slate-200">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Progress Hari Ini</p>
                              <p className="mt-1 text-sm font-bold text-slate-800">
                                {studentStatus.totalIntakeMl} ml / {studentStatus.targetMl} ml
                              </p>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              studentStatus.isAdequate
                                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                : "bg-rose-100 text-rose-700 border border-rose-200"
                            }`}>
                              {studentStatus.isAdequate ? "Adekuat" : `Tidak Adekuat • Kurang ${studentStatus.remainingMl} ml`}
                            </span>
                          </div>
                          <div className="mt-3">
                            <ProgressBar progress={studentStatus.progressPercent} colorClass={studentStatus.isAdequate ? "bg-emerald-500" : "bg-violet-500"} />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Log Minum Hari Ini</p>
                              <p className="mt-1 text-xs text-slate-500">
                                Guru bisa melihat jenis minuman yang sudah dicatat siswa hari ini.
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                              {studentLogs.length} log
                            </span>
                          </div>

                          {studentLogs.length === 0 ? (
                            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
                              <p className="text-xs font-medium text-slate-500">Belum ada log minum hari ini.</p>
                            </div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {studentLogs.map((log) => (
                                <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
                                        <Clock3 size={12} />
                                        <span>{new Date(log.logged_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                                      </div>
                                      <p className="text-sm font-bold text-slate-800">{log.drink_type || "Air putih"}</p>
                                      <p className="text-xs text-slate-500">{log.amount_ml} ml</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {!studentStatus.isAdequate && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-amber-800">Pengingat Guru</p>
                                <p className="mt-1 text-xs text-amber-700">
                                  Kirim pengingat harian agar {studentName} segera menambah minum air putih hari ini.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSendTeacherReminder(student.id, studentName)}
                                disabled={sendingTeacherReminderTo === student.id}
                                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
                              >
                                <Bell size={14} />
                                {sendingTeacherReminderTo === student.id ? "Mengirim..." : "Kirim Pengingat"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (profile?.role === "parent") {
    const incomeClassification = classifyParentIncome(profile.income_amount);

    return (
      <>
        <Header title="Dashboard Orang Tua" />
        <div className="p-6 space-y-6">
          <Card className="bg-gradient-to-r from-teal-500 to-teal-400 text-white">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-1">Pantau Anak Anda</h2>
              <p className="text-teal-50 text-sm">Tambahkan anak dengan memasukkan kode siswa mereka dan kelola profil orang tua secara lebih lengkap.</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <GraduationCap size={16} />
                      <p className="text-xs font-bold uppercase tracking-wider">Pendidikan</p>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-800">{getParentEducationLabel(profile.education_level)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <BriefcaseBusiness size={16} />
                      <p className="text-xs font-bold uppercase tracking-wider">Pekerjaan</p>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-800">{profile.occupation || "Belum diisi"}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <CalendarDays size={16} />
                      <p className="text-xs font-bold uppercase tracking-wider">Umur</p>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-800">{profile.age ? `${profile.age} tahun` : "Belum diisi"}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <UserPlus size={16} />
                      <p className="text-xs font-bold uppercase tracking-wider">Jenis Kelamin</p>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-800">{getParentGenderLabel(profile.gender)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-teal-100 bg-teal-50/70 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-teal-700">
                  <Wallet size={18} />
                  <h3 className="text-sm font-bold">Status Pendapatan</h3>
                </div>
                <p className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-teal-700 shadow-sm">
                  <span className={`inline-flex rounded-full px-3 py-1 ${incomeClassification.className}`}>
                    {incomeClassification.label}
                  </span>
                </p>
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  Gaji bulanan: {formatCurrencyId(profile.income_amount)}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Dibandingkan otomatis dengan {BANYUMAS_UMK_2026_LABEL} sebesar {formatCurrencyId(BANYUMAS_UMK_2026)}.
                </p>
              </CardContent>
            </Card>
          </div>

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
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
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
                      </div>

                      {(() => {
                        const childStatus = childHydrationMap[c.child_id] || {
                          totalIntakeMl: 0,
                          targetMl: c.student_profiles?.daily_water_target_ml || 1500,
                          remainingMl: c.student_profiles?.daily_water_target_ml || 1500,
                          isAdequate: false,
                          progressPercent: 0,
                        };
                        const childName = c.student_profiles?.profiles?.full_name || "anak";

                        return (
                          <div className="space-y-3">
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Capaian Hari Ini</p>
                                  <p className="mt-1 text-sm font-bold text-slate-800">
                                    {childStatus.totalIntakeMl} ml / {childStatus.targetMl} ml
                                  </p>
                                </div>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                  childStatus.isAdequate
                                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-100 text-amber-700 border border-amber-200"
                                }`}>
                                  {childStatus.isAdequate ? "Tercapai" : `Kurang ${childStatus.remainingMl} ml`}
                                </span>
                              </div>
                              <div className="mt-3">
                                <ProgressBar progress={childStatus.progressPercent} colorClass={childStatus.isAdequate ? "bg-emerald-500" : "bg-blue-500"} />
                              </div>
                            </div>

                            {!childStatus.isAdequate && (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-bold text-amber-800">Feedback Harian Orang Tua</p>
                                    <p className="text-xs text-amber-700 mt-1">
                                      Kirim masukan atau semangat ke {childName} karena target minum hari ini belum tercapai.
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setActiveFeedbackChildId((current) => current === c.child_id ? null : c.child_id)}
                                    className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                                  >
                                    <MessageSquareText size={14} />
                                    {activeFeedbackChildId === c.child_id ? "Tutup" : "Beri Feedback"}
                                  </button>
                                </div>

                                {activeFeedbackChildId === c.child_id && (
                                  <div className="space-y-3">
                                    <textarea
                                      value={feedbackDrafts[c.child_id] || ""}
                                      onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [c.child_id]: event.target.value }))}
                                      placeholder={`Contoh: ${childName}, ayo tambah minum air putih sore ini ya supaya target harianmu tercapai.`}
                                      className="min-h-[92px] w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                    />
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-[11px] text-amber-700">
                                        Jika dikosongkan, sistem akan mengirim feedback otomatis berdasarkan sisa target minum anak.
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => handleSendFeedback(c.child_id, childName)}
                                        disabled={sendingFeedbackTo === c.child_id}
                                        className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
                                      >
                                        <SendHorizonal size={14} />
                                        {sendingFeedbackTo === c.child_id ? "Mengirim..." : "Kirim Feedback"}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
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
        {showDailyGuideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
            <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="bg-gradient-to-r from-indigo-600 via-blue-500 to-cyan-500 px-4 py-4 text-white sm:px-6 sm:py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/80">Panduan Harian</p>
                    <h2 className="mt-2 text-xl font-extrabold sm:text-2xl">Alur Wajib Hari Ini</h2>
                    <p className="mt-2 text-xs text-white/85 sm:text-sm">
                      Popup ini hanya muncul saat login pertama di hari ini agar kamu tahu urutan penggunaan aplikasi.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseDailyGuideModal}
                    className="shrink-0 rounded-2xl bg-white/15 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20"
                  >
                    Tutup
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="space-y-3">
                {[
                  {
                    title: "1. Video Edukasi",
                    detail: "Mulai dari menu Edukasi. Di dalam video edukasi sudah ada kuis yang perlu dikerjakan lebih dulu.",
                    accent: "bg-blue-50 border-blue-200 text-blue-700",
                  },
                  {
                    title: "2. Pengisian Tracker",
                    detail: "Setelah edukasi selesai, lanjutkan ke Tracker untuk mencatat minuman yang diminum hari ini.",
                    accent: "bg-cyan-50 border-cyan-200 text-cyan-700",
                  },
                  {
                    title: "3. Status Hidrasi",
                    detail: "Dari hasil tracker, sistem akan memberi status Adekuat atau Tidak Adekuat secara otomatis.",
                    accent: "bg-emerald-50 border-emerald-200 text-emerald-700",
                  },
                  {
                    title: "4. Video Penegasan",
                    detail: "Setelah status muncul, kamu akan diarahkan ke video penegasan yang sesuai dengan kondisi Adekuat atau Tidak Adekuat.",
                    accent: "bg-amber-50 border-amber-200 text-amber-700",
                  },
                  {
                    title: "5. Kuis Wajib Harian",
                    detail: "Terakhir, isi Kuis Sikap Dehidrasi dan Kuis Pengetahuan Dehidrasi pada menu Kuis di hari yang sama.",
                    accent: "bg-violet-50 border-violet-200 text-violet-700",
                  },
                ].map((item, index) => (
                  <div key={item.title} className={`overflow-hidden rounded-2xl border ${item.accent}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedDailyGuideStep((current) => current === index ? null : index)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div>
                        <p className="text-sm font-black">{item.title}</p>
                        <p className="mt-1 text-[11px] font-semibold opacity-80 sm:text-xs">
                          {expandedDailyGuideStep === index ? "Sembunyikan detail" : "Lihat detail langkah"}
                        </p>
                      </div>
                      {expandedDailyGuideStep === index ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    {expandedDailyGuideStep === index && (
                      <div className="border-t border-current/10 bg-white/55 px-4 py-3 text-sm leading-6 text-slate-700">
                        {item.detail}
                      </div>
                    )}
                  </div>
                ))}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Rekomendasi urutan harian: <span className="font-bold text-slate-800">Edukasi, lalu Tracker, lalu Status, lalu Video Penegasan, lalu Kuis Sikap Dehidrasi, dan terakhir Kuis Pengetahuan Dehidrasi.</span>
                </div>
                </div>
              </div>

              <div className="border-t border-slate-100 bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    <Link href="/education" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700">
                      <ClipboardList size={16} />
                      Buka Edukasi
                    </Link>
                    <Link href="/survey" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-100 px-4 py-3 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-200">
                      <CheckCircle2 size={16} />
                      Lihat Kuis
                    </Link>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseDailyGuideModal}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Saya Mengerti
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
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

        <Card className="border-2 border-amber-100 shadow-sm overflow-hidden">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Zap size={18} className="text-amber-500" />
                  <h3 className="font-bold text-slate-800 text-sm">Daily Check-In Harian</h3>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Check-in tiap hari untuk mengumpulkan XP. Semakin panjang streak, semakin besar XP yang didapat.
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-700">
                Streak {checkinStats.currentStreak} hari
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-amber-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Reward Hari Ini</p>
                <p className="mt-1 text-lg font-extrabold text-amber-700">
                  {checkinStats.checkedInToday ? `${checkinStats.todayReward?.totalXp || 0} XP` : `${checkinStats.nextReward.totalXp} XP`}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Check-In</p>
                <p className="mt-1 text-lg font-extrabold text-slate-800">{checkinStats.totalCheckins}</p>
              </div>
              <div className="rounded-2xl bg-violet-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">XP Check-In</p>
                <p className="mt-1 text-lg font-extrabold text-violet-700">{checkinStats.totalCheckinXp}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Progress 7 Hari</p>
                <p className="text-[11px] font-semibold text-slate-500">
                  Hari ke-{Math.min(checkinStats.nextStreak, MAX_STREAK_BONUS_DAYS)} berikutnya memberi {checkinStats.nextReward.totalXp} XP
                </p>
              </div>
              <div className="mt-3 grid grid-cols-7 gap-2">
                {Array.from({ length: MAX_STREAK_BONUS_DAYS }, (_, index) => {
                  const dayNumber = index + 1;
                  const reward = getCheckinReward(dayNumber);
                  const isReached = dayNumber <= Math.min(checkinStats.currentStreak, MAX_STREAK_BONUS_DAYS);
                  const isTodayTarget = !checkinStats.checkedInToday && dayNumber === Math.min(checkinStats.nextStreak, MAX_STREAK_BONUS_DAYS);

                  return (
                    <div
                      key={dayNumber}
                      className={`rounded-2xl border px-2 py-3 text-center ${
                        isTodayTarget
                          ? "border-amber-300 bg-amber-100"
                          : isReached
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-white"
                      }`}
                    >
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">H{dayNumber}</p>
                      <p className="mt-1 text-sm font-extrabold text-slate-800">{reward.totalXp}</p>
                      <p className="text-[10px] text-slate-500">XP</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                {checkinStats.checkedInToday
                  ? `Check-in hari ini sudah diklaim. Besok lanjutkan streak untuk menjaga bonus XP tetap naik.`
                  : `Check-in sekarang untuk mendapatkan ${checkinStats.nextReward.totalXp} XP dengan streak ${checkinStats.nextStreak} hari.`}
              </div>
              <button
                type="button"
                onClick={handleDailyCheckin}
                disabled={checkinSaving || checkinLoading || checkinStats.checkedInToday || Boolean(checkinError)}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-colors ${
                  checkinStats.checkedInToday
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-500 text-white hover:bg-amber-600"
                } disabled:opacity-60`}
              >
                <CheckCircle2 size={16} />
                {checkinLoading
                  ? "Memuat..."
                  : checkinSaving
                    ? "Menyimpan..."
                    : checkinStats.checkedInToday
                      ? "Sudah Check-In Hari Ini"
                      : "Check-In Sekarang"}
              </button>
            </div>

            {checkinError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                {checkinError}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-slate-100 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList size={18} className="text-indigo-500" />
              <h3 className="font-bold text-slate-800 text-sm">Alur Pengisian Harian</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                "Video Edukasi + Kuis",
                "Pengisian Tracker",
                "Status Adekuat / Tidak Adekuat",
                "Video Penegasan",
                "Kuis Sikap Dehidrasi",
                "Kuis Pengetahuan Dehidrasi",
              ].map((step, index) => (
                <div key={step} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Langkah {index + 1}</p>
                  <p className="mt-1 text-sm font-bold text-slate-700">{step}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {!adequacyStatus.isAdequate && (
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
                <div className="text-right">
                  <span className="block font-bold">{Math.round(fluidPercentage)}%</span>
                  <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${adequacyStatus.className}`}>
                    {adequacyStatus.label}
                  </span>
                </div>
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

              <p className="mt-3 text-xs font-semibold text-blue-100">
                Status hari ini: {adequacyStatus.shortLabel}
              </p>
            </CardContent>
          </Card>
        </button>

        {isHistoryOpen && (
          <Card className="border-2 border-blue-100 shadow-sm animate-fade-in-up">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Riwayat Minum Hari Ini</h3>
                  <p className="text-xs text-slate-500 mt-1">Klik tracker untuk menambahkan data baru. Total cairan tetap jadi dasar perhitungan hidrasi.</p>
                </div>
                <Link href="/tracker" className="text-xs font-bold text-blue-600 shrink-0">
                  Buka Tracker
                </Link>
              </div>

              <div className="flex flex-wrap gap-2">
                {hydrationPeriodSummaries.map((summary) => (
                  <span key={summary.key} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${summary.accentClassName}`}>
                    {summary.label}: {summary.totalMl} ml
                  </span>
                ))}
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
                  {hydrationHistory.map((log) => (
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="pb-24">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-slate-800 text-lg">Kuis Harian</h3>
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
