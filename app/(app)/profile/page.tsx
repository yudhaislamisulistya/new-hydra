"use client";

import { useUserStore } from "../../../store/useUserStore";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { LogOut, User, ShieldCheck, Droplet, Crown, Zap, Lock, Palette, School2, Hash, GraduationCap, Edit3, Save, X, CalendarDays, Ruler } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEffect, useState } from "react";
import { BUDDY_ACCESSORIES, BUDDY_COLORS, getBuddyAccessory, getBuddyColor } from "../../../utils/hydrationBuddy";
import { normalizeUsername } from "../../../utils/authIdentity";
import { BANYUMAS_UMK_2026, BANYUMAS_UMK_2026_LABEL, classifyParentIncome, formatCurrencyId, getParentEducationLabel, getParentGenderLabel, PARENT_EDUCATION_OPTIONS, PARENT_GENDER_OPTIONS } from "../../../utils/parentProfile";
import { XP_PER_HYDRATION_LOG, XP_PER_SURVEY } from "../../../utils/gamification";
import { calculateBasicFluidNeeds } from "../../../utils/hydrationCalc";

const XP_PER_LEVEL = 500;

type SchoolOption = {
  id: string;
  name: string;
};

export default function ProfilePage() {
  const { profile, logout, fetchProfile } = useUserStore();
  const router = useRouter();
  
  // Gamification State
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  
  // Customization State
  const [avatarColor, setAvatarColor] = useState('blue');
  const [avatarAccessory, setAvatarAccessory] = useState('none');
  const [activeTab, setActiveTab] = useState<'color' | 'accessory'>('color');
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [isEditingStudent, setIsEditingStudent] = useState(false);
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [studentSuccess, setStudentSuccess] = useState("");
  const [studentForm, setStudentForm] = useState({
    fullName: "",
    birthDate: "",
    gender: "male",
    weightKg: "",
    heightCm: "",
    schoolId: "",
    classLevel: "",
    childOrder: "",
  });
  const [isEditingParent, setIsEditingParent] = useState(false);
  const [isSavingParent, setIsSavingParent] = useState(false);
  const [parentError, setParentError] = useState("");
  const [parentSuccess, setParentSuccess] = useState("");
  const [parentForm, setParentForm] = useState({
    fullName: "",
    username: "",
    educationLevel: "",
    occupation: "",
    gender: "male",
    ageYears: "",
    incomeAmount: "",
  });

  useEffect(() => {
    async function fetchProfileData() {
      const supabase = createClient();

      if (profile?.role === "student") {
        const { data: schoolsData, error: schoolsError } = await supabase
          .from("schools")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (schoolsError) {
          console.error("Error fetching schools for student profile:", schoolsError);
          setSchools([]);
        } else {
          setSchools((schoolsData as SchoolOption[] | null) || []);
        }
      }

      // If student, calculate XP
      if (profile?.role === 'student' && profile.id) {
        // Count surveys
        const { count: surveyCount } = await supabase
          .from('survey_responses')
          .select('id', { count: 'exact', head: true })
          .eq('respondent_id', profile.id);
          
        // Count logs
        const { count: logCount } = await supabase
          .from('hydration_logs')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', profile.id);

        const { data: dailyCheckins, error: checkinError } = await supabase
          .from('daily_checkins')
          .select('xp_earned')
          .eq('student_id', profile.id);

        if (checkinError) {
          console.error("Error fetching daily checkins for XP:", checkinError);
        }

        const checkinXp = ((dailyCheckins as Array<{ xp_earned: number | null }> | null) || []).reduce((sum, item) => {
          return sum + (item.xp_earned || 0);
        }, 0);
          
        const totalXp = ((surveyCount || 0) * XP_PER_SURVEY) + ((logCount || 0) * XP_PER_HYDRATION_LOG) + checkinXp;
        const currentLevel = Math.floor(totalXp / XP_PER_LEVEL) + 1;
        
        setXp(totalXp);
        setLevel(currentLevel);

        // Load local customizations
        const savedColor = localStorage.getItem(`avatar_color_${profile.id}`);
        const savedAccessory = localStorage.getItem(`avatar_acc_${profile.id}`);
        
        if (savedColor && BUDDY_COLORS.find(c => c.id === savedColor && currentLevel >= c.minLevel)) {
          setAvatarColor(savedColor);
        }
        if (savedAccessory && BUDDY_ACCESSORIES.find(a => a.id === savedAccessory && currentLevel >= a.minLevel)) {
          setAvatarAccessory(savedAccessory);
        }
      }
      setLoading(false);
    }
    
    fetchProfileData();
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (profile?.role !== "student") return;

    const timeoutId = window.setTimeout(() => {
      setStudentForm({
        fullName: profile.nickname || "",
        birthDate: profile.birth_date || "",
        gender: profile.gender || "male",
        weightKg: profile.weight_kg ? String(profile.weight_kg) : "",
        heightCm: profile.height_cm ? String(profile.height_cm) : "",
        schoolId: profile.school_id || "",
        classLevel: profile.class_level ? String(profile.class_level) : "",
        childOrder: profile.child_order ? String(profile.child_order) : "",
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [profile]);

  useEffect(() => {
    if (profile?.role !== "parent") return;

    const timeoutId = window.setTimeout(() => {
      setParentForm({
        fullName: profile.nickname || "",
        username: profile.username || "",
        educationLevel: profile.education_level || "",
        occupation: profile.occupation || "",
        gender: profile.gender || "male",
        ageYears: profile.age ? String(profile.age) : "",
        incomeAmount: profile.income_amount ? String(profile.income_amount) : "",
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [profile]);

  const handleLogout = async () => {
    await logout();
    router.push("/auth");
  };

  const handleCancelStudentEdit = () => {
    if (profile?.role !== "student") return;

    setStudentError("");
    setStudentSuccess("");
    setIsEditingStudent(false);
    setStudentForm({
      fullName: profile.nickname || "",
      birthDate: profile.birth_date || "",
      gender: profile.gender || "male",
      weightKg: profile.weight_kg ? String(profile.weight_kg) : "",
      heightCm: profile.height_cm ? String(profile.height_cm) : "",
      schoolId: profile.school_id || "",
      classLevel: profile.class_level ? String(profile.class_level) : "",
      childOrder: profile.child_order ? String(profile.child_order) : "",
    });
  };

  const handleSaveStudentProfile = async () => {
    if (!profile?.id || profile.role !== "student") return;

    setStudentError("");
    setStudentSuccess("");

    const weightKg = Number(studentForm.weightKg);
    const heightCm = Number(studentForm.heightCm);
    const childOrder = Number(studentForm.childOrder);
    const classLevel = Number(studentForm.classLevel);

    if (!studentForm.fullName.trim()) {
      setStudentError("Nama lengkap wajib diisi.");
      return;
    }

    if (!studentForm.birthDate) {
      setStudentError("Tanggal lahir wajib diisi.");
      return;
    }

    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      setStudentError("Berat badan wajib diisi dengan angka yang valid.");
      return;
    }

    if (!Number.isFinite(heightCm) || heightCm <= 0) {
      setStudentError("Tinggi badan wajib diisi dengan angka yang valid.");
      return;
    }

    if (!studentForm.schoolId) {
      setStudentError("Sekolah wajib dipilih.");
      return;
    }

    if (![5, 6].includes(classLevel)) {
      setStudentError("Kelas hanya boleh 5 atau 6.");
      return;
    }

    if (!Number.isFinite(childOrder) || childOrder < 1) {
      setStudentError("Anak ke wajib diisi minimal 1.");
      return;
    }

    setIsSavingStudent(true);
    const supabase = createClient();

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: studentForm.fullName.trim(),
        })
        .eq("id", profile.id);

      if (profileError) throw profileError;

      const { error: studentProfileError } = await supabase
        .from("student_profiles")
        .update({
          birth_date: studentForm.birthDate,
          gender: studentForm.gender,
          weight_kg: weightKg,
          height_cm: heightCm,
          school_id: studentForm.schoolId || null,
          class_level: classLevel,
          child_order: childOrder,
          daily_water_target_ml: calculateBasicFluidNeeds(weightKg),
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (studentProfileError) throw studentProfileError;

      await fetchProfile();
      setStudentSuccess("Profil siswa berhasil diperbarui.");
      setIsEditingStudent(false);
    } catch (error) {
      setStudentError(error instanceof Error ? error.message : "Gagal menyimpan profil siswa.");
    } finally {
      setIsSavingStudent(false);
    }
  };

  const handleCancelParentEdit = () => {
    if (profile?.role !== "parent") return;

    setParentError("");
    setParentSuccess("");
    setIsEditingParent(false);
    setParentForm({
      fullName: profile.nickname || "",
      username: profile.username || "",
      educationLevel: profile.education_level || "",
      occupation: profile.occupation || "",
      gender: profile.gender || "male",
      ageYears: profile.age ? String(profile.age) : "",
      incomeAmount: profile.income_amount ? String(profile.income_amount) : "",
    });
  };

  const handleSaveParentProfile = async () => {
    if (!profile?.id || profile.role !== "parent") return;

    setParentError("");
    setParentSuccess("");

    const normalizedUsername = normalizeUsername(parentForm.username);
    const incomeAmount = Number(parentForm.incomeAmount);
    const incomeClassification = classifyParentIncome(incomeAmount);

    if (!parentForm.fullName.trim()) {
      setParentError("Nama lengkap wajib diisi.");
      return;
    }

    if (normalizedUsername.length < 3) {
      setParentError("Username minimal 3 karakter.");
      return;
    }

    if (!parentForm.educationLevel) {
      setParentError("Pendidikan terakhir wajib dipilih.");
      return;
    }

    if (!parentForm.occupation.trim()) {
      setParentError("Pekerjaan wajib diisi.");
      return;
    }

    if (!parentForm.ageYears || Number(parentForm.ageYears) < 17) {
      setParentError("Umur minimal 17 tahun.");
      return;
    }

    if (!Number.isFinite(incomeAmount) || incomeAmount <= 0) {
      setParentError("Nominal gaji bulanan wajib diisi.");
      return;
    }

    setIsSavingParent(true);
    const supabase = createClient();

    try {
      if (normalizedUsername !== profile.username) {
        const { data: existingUser, error: existingUserError } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", normalizedUsername)
          .neq("id", profile.id)
          .maybeSingle();

        if (existingUserError) throw existingUserError;
        if (existingUser) {
          setParentError("Username sudah dipakai. Silakan gunakan username lain.");
          setIsSavingParent(false);
          return;
        }
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: parentForm.fullName.trim(),
          username: normalizedUsername,
        })
        .eq("id", profile.id);

      if (profileError) throw profileError;

      const { error: parentProfileError } = await supabase
        .from("parent_profiles")
        .upsert({
          id: profile.id,
          education_level: parentForm.educationLevel || null,
          occupation: parentForm.occupation.trim() || null,
          gender: parentForm.gender,
          age_years: Number(parentForm.ageYears) || null,
          income_category: incomeClassification.category || null,
          income_reference: "umk_banyumas_2026",
          income_amount: incomeAmount,
          updated_at: new Date().toISOString(),
        });

      if (parentProfileError) throw parentProfileError;

      await fetchProfile();
      setParentSuccess("Profil orang tua berhasil diperbarui.");
      setIsEditingParent(false);
    } catch (error) {
      setParentError(error instanceof Error ? error.message : "Gagal menyimpan profil orang tua.");
    } finally {
      setIsSavingParent(false);
    }
  };

  const handleColorSelect = (colorId: string, minLevel: number) => {
    if (level >= minLevel) {
      setAvatarColor(colorId);
      localStorage.setItem(`avatar_color_${profile?.id}`, colorId);
    }
  };

  const handleAccessorySelect = (accId: string, minLevel: number) => {
    if (level >= minLevel) {
      setAvatarAccessory(accId);
      localStorage.setItem(`avatar_acc_${profile?.id}`, accId);
    }
  };

  const currentColorClass = getBuddyColor(avatarColor).color;
  const currentAcc = getBuddyAccessory(avatarAccessory);
  const AccIcon = currentAcc?.icon;

  if (loading) {
    return (
      <>
        <Header title="Profil" />
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>
      </>
    );
  }

  // --- STUDENT VIEW (GAMIFIED) ---
  if (profile?.role === 'student') {
    const nextLevelXp = level * XP_PER_LEVEL;
    const progressPercent = ((xp - ((level - 1) * XP_PER_LEVEL)) / XP_PER_LEVEL) * 100;

    return (
      <>
        <Header title="Profil & Karakter" />
        <div className="p-6 space-y-6 pb-28">
          
          {/* Level Progress Banner */}
          <Card className="bg-gradient-to-r from-indigo-600 to-blue-500 text-white border-none shadow-lg">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest">Level Kamu</p>
                <div className="flex items-end gap-1 mt-1">
                  <span className="text-4xl font-black">{level}</span>
                  <span className="text-sm font-medium mb-1 text-white/80">Student</span>
                </div>
              </div>
              <div className="text-right w-32">
                <div className="flex items-center justify-end gap-1 mb-1">
                  <Zap size={14} className="text-yellow-300" />
                  <span className="font-bold text-sm">{xp} / {nextLevelXp} XP</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
                </div>
                <p className="text-[9px] text-white/60 mt-1 uppercase font-bold">{nextLevelXp - xp} XP ke Level {level + 1}</p>
              </div>
            </CardContent>
          </Card>

          {/* Character Stage */}
          <div className="bg-slate-50 rounded-3xl border-2 border-slate-100 p-8 flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-100/50 via-transparent to-transparent"></div>
            
            <h3 className="font-bold text-slate-400 text-xs uppercase tracking-widest mb-6 relative z-10">Hydration Buddy Kamu</h3>
            
            {/* The Avatar */}
            <div className="relative w-32 h-32 flex items-center justify-center animate-bounce-slow">
              <Droplet size={140} className={`${currentColorClass} fill-current absolute drop-shadow-xl`} strokeWidth={1.5} />
              
              {/* Accessory */}
              {AccIcon && (
                <div className={`absolute -top-4 ${currentAcc.color} z-20 transition-all transform hover:scale-110`}>
                  <AccIcon size={64} strokeWidth={2} />
                </div>
              )}
              
              {/* Cute Face */}
              <div className="absolute z-10 flex flex-col items-center mt-8 gap-1">
                <div className="flex gap-4">
                  <div className="w-3 h-4 bg-slate-800 rounded-full"></div>
                  <div className="w-3 h-4 bg-slate-800 rounded-full"></div>
                </div>
                <div className="w-4 h-2 border-b-4 border-slate-800 rounded-full mt-1"></div>
              </div>
            </div>
            
            <div className="w-24 h-4 bg-slate-200 rounded-full blur-sm mt-4 opacity-50 relative z-10"></div>
          </div>

          {/* Customizer */}
          <Card className="border-2 border-slate-100 shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-100">
              <button 
                onClick={() => setActiveTab('color')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'color' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <Palette size={16} /> Warna
              </button>
              <button 
                onClick={() => setActiveTab('accessory')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'accessory' ? 'bg-purple-50 text-purple-600' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <Crown size={16} /> Aksesoris
              </button>
            </div>
            
            <CardContent className="p-4">
              {activeTab === 'color' && (
                <div className="grid grid-cols-4 gap-3">
                  {BUDDY_COLORS.map((c) => {
                    const isLocked = level < c.minLevel;
                    const isSelected = avatarColor === c.id;
                    return (
                      <button
                        key={c.id}
                        disabled={isLocked}
                        onClick={() => handleColorSelect(c.id, c.minLevel)}
                        className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
                          isSelected ? 'ring-4 ring-blue-200 scale-95 shadow-inner' : 
                          isLocked ? 'opacity-50 grayscale bg-slate-100 cursor-not-allowed' : 'hover:scale-105 hover:shadow-md'
                        } ${!isLocked && !isSelected ? c.bg : isLocked ? 'bg-slate-200' : c.bg}`}
                      >
                        {isLocked && <Lock size={20} className="text-white/80 absolute" />}
                        {isSelected && <div className="absolute inset-0 bg-black/10 rounded-2xl"></div>}
                        <span className="text-[8px] font-bold text-white absolute bottom-1 mt-auto">Lvl {c.minLevel}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeTab === 'accessory' && (
                <div className="grid grid-cols-4 gap-3">
                  {BUDDY_ACCESSORIES.map((a) => {
                    const isLocked = level < a.minLevel;
                    const isSelected = avatarAccessory === a.id;
                    const ItemIcon = a.icon;
                    return (
                      <button
                        key={a.id}
                        disabled={isLocked}
                        onClick={() => handleAccessorySelect(a.id, a.minLevel)}
                        className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border-2 ${
                          isSelected ? 'bg-purple-50 border-purple-300 scale-95 shadow-inner' : 
                          isLocked ? 'opacity-50 bg-slate-50 border-slate-100 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-purple-200 hover:shadow-md'
                        }`}
                      >
                        {isLocked && <Lock size={16} className="text-slate-400 absolute top-2 right-2" />}
                        {ItemIcon ? <ItemIcon size={28} className={isLocked ? 'text-slate-300' : a.color} /> : <span className="text-xs font-bold text-slate-400">Polos</span>}
                        <span className="max-w-[64px] truncate px-1 text-[8px] font-semibold text-slate-500">{a.name}</span>
                        <span className={`text-[8px] font-bold absolute bottom-1 ${isLocked ? 'text-slate-400' : 'text-slate-500'}`}>Lvl {a.minLevel}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-2 border-slate-100 shadow-sm">
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nama Lengkap</p>
                    <p className="font-semibold text-slate-700">{profile?.nickname || "Belum diisi"}</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Username</p>
                    <p className="font-semibold text-slate-700">@{profile?.username || "-"}</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <School2 size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sekolah</p>
                    <p className="font-semibold text-slate-700">{profile?.school_name || "Belum diisi"}</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <GraduationCap size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kelas</p>
                    <p className="font-semibold text-slate-700">{profile?.class_level ? `Kelas ${profile.class_level}` : "Belum diisi"}</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <Hash size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Anak Ke</p>
                    <p className="font-semibold text-slate-700">{profile?.child_order || "Belum diisi"}</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tanggal Lahir</p>
                    <p className="font-semibold text-slate-700">
                      {profile?.birth_date ? new Date(profile.birth_date).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "Belum diisi"}
                    </p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Jenis Kelamin</p>
                    <p className="font-semibold text-slate-700">{profile?.gender === "female" ? "Perempuan" : "Laki-laki"}</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <Droplet size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Berat Badan</p>
                    <p className="font-semibold text-slate-700">{profile?.weight_kg ? `${profile.weight_kg} kg` : "Belum diisi"}</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <Ruler size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tinggi Badan</p>
                    <p className="font-semibold text-slate-700">{profile?.height_cm ? `${profile.height_cm} cm` : "Belum diisi"}</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <Hash size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kode Siswa</p>
                    <p className="font-semibold text-slate-700">{profile?.student_code || "Belum diisi"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-100 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Data Siswa</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Username dan kode siswa dikunci. Data lain bisa diperbarui bila ada perubahan.
                  </p>
                </div>
                {!isEditingStudent ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStudentError("");
                      setStudentSuccess("");
                      setIsEditingStudent(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <Edit3 size={14} />
                    Edit Profil
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancelStudentEdit}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <X size={14} />
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveStudentProfile}
                      disabled={isSavingStudent}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
                    >
                      <Save size={14} />
                      {isSavingStudent ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                )}
              </div>

              {studentError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {studentError}
                </div>
              )}

              {studentSuccess && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {studentSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Nama Lengkap"
                  value={studentForm.fullName}
                  onChange={(event) => setStudentForm((current) => ({ ...current, fullName: event.target.value }))}
                  disabled={!isEditingStudent}
                />
                <Input
                  label="Username"
                  value={`@${profile?.username || ""}`}
                  disabled
                />
                <Input
                  label="Kode Siswa"
                  value={profile?.student_code || ""}
                  disabled
                />
                <Input
                  label="Tanggal Lahir"
                  type="date"
                  value={studentForm.birthDate}
                  onChange={(event) => setStudentForm((current) => ({ ...current, birthDate: event.target.value }))}
                  disabled={!isEditingStudent}
                />
                <Select
                  label="Jenis Kelamin"
                  value={studentForm.gender}
                  onChange={(event) => setStudentForm((current) => ({ ...current, gender: event.target.value }))}
                  disabled={!isEditingStudent}
                  options={[
                    { value: "male", label: "Laki-laki" },
                    { value: "female", label: "Perempuan" },
                  ]}
                />
                <Select
                  label="Sekolah"
                  value={studentForm.schoolId}
                  onChange={(event) => setStudentForm((current) => ({ ...current, schoolId: event.target.value }))}
                  disabled={!isEditingStudent}
                  options={schools.map((school) => ({ value: school.id, label: school.name }))}
                />
                <Select
                  label="Kelas"
                  value={studentForm.classLevel}
                  onChange={(event) => setStudentForm((current) => ({ ...current, classLevel: event.target.value }))}
                  disabled={!isEditingStudent}
                  options={[
                    { value: "5", label: "Kelas 5" },
                    { value: "6", label: "Kelas 6" },
                  ]}
                />
                <Input
                  label="Anak Ke"
                  type="number"
                  min="1"
                  value={studentForm.childOrder}
                  onChange={(event) => setStudentForm((current) => ({ ...current, childOrder: event.target.value }))}
                  disabled={!isEditingStudent}
                />
                <Input
                  label="Berat Badan (kg)"
                  type="number"
                  min="1"
                  step="0.1"
                  value={studentForm.weightKg}
                  onChange={(event) => setStudentForm((current) => ({ ...current, weightKg: event.target.value }))}
                  disabled={!isEditingStudent}
                />
                <Input
                  label="Tinggi Badan (cm)"
                  type="number"
                  min="1"
                  step="0.1"
                  value={studentForm.heightCm}
                  onChange={(event) => setStudentForm((current) => ({ ...current, heightCm: event.target.value }))}
                  disabled={!isEditingStudent}
                />
                <Input
                  label="Target Air Dasar"
                  value={`${calculateBasicFluidNeeds(Number(studentForm.weightKg) || profile?.weight_kg || 0)} ml`}
                  disabled
                />
              </div>
            </CardContent>
          </Card>

          {/* Basic Info */}
          <div className="bg-white rounded-3xl p-5 border-2 border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xl">
                {profile?.nickname ? profile.nickname.charAt(0).toUpperCase() : "U"}
              </div>
              <div>
                <p className="font-bold text-slate-800">{profile?.nickname}</p>
                <p className="text-xs text-slate-500">@{profile?.username || profile?.student_code}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
          
        </div>
      </>
    );
  }

  // --- PARENT / OTHER ROLE VIEW (BASIC) ---
  const incomeClassification = classifyParentIncome(profile?.income_amount);
  const parentDraftIncomeClassification = classifyParentIncome(Number(parentForm.incomeAmount));

  return (
    <>
      <Header title="Profil Saya" />
      <div className="p-6 space-y-6 pb-24">
        
        <div className="flex flex-col items-center justify-center py-6">
          <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 font-bold border-4 border-white shadow-md text-4xl mb-4">
            {profile?.nickname ? profile.nickname.charAt(0).toUpperCase() : "U"}
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{profile?.nickname || "User"}</h2>
          <p className="text-slate-500 font-medium capitalize flex items-center gap-1 mt-1">
            <ShieldCheck size={16} className="text-blue-500" />
            {profile?.role === "parent" ? "Orang Tua" : profile?.role}
          </p>
        </div>

        <Card className="border-2 border-slate-100 shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              <div className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                  <User size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nama Lengkap</p>
                  <p className="font-semibold text-slate-700">{profile?.nickname}</p>
                </div>
              </div>
              <div className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                  <User size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Username</p>
                  <p className="font-semibold text-slate-700">@{profile?.username || "-"}</p>
                </div>
              </div>
              {profile?.role === "parent" && (
                <>
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                      <GraduationCap size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pendidikan Terakhir</p>
                      <p className="font-semibold text-slate-700">{getParentEducationLabel(profile?.education_level)}</p>
                    </div>
                  </div>
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pekerjaan</p>
                      <p className="font-semibold text-slate-700">{profile?.occupation || "Belum diisi"}</p>
                    </div>
                  </div>
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                      <Hash size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Jenis Kelamin</p>
                      <p className="font-semibold text-slate-700">{getParentGenderLabel(profile?.gender)}</p>
                    </div>
                  </div>
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                      <User size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Umur</p>
                      <p className="font-semibold text-slate-700">{profile?.age ? `${profile.age} tahun` : "Belum diisi"}</p>
                    </div>
                  </div>
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                      <School2 size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gaji Bulanan</p>
                      <p className="font-semibold text-slate-700">{formatCurrencyId(profile?.income_amount)}</p>
                    </div>
                  </div>
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status Pendapatan</p>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${incomeClassification.className}`}>
                        {incomeClassification.label}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {profile?.role === "parent" && (
          <Card className="border-2 border-teal-100 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Edit Profil Orang Tua</h3>
                  <p className="text-sm text-slate-500 mt-1">Perbarui semua data orang tua langsung dari halaman profil.</p>
                </div>
                {!isEditingParent ? (
                  <Button size="sm" onClick={() => {
                    setParentError("");
                    setParentSuccess("");
                    setIsEditingParent(true);
                  }}>
                    <Edit3 size={16} className="mr-2" />
                    Edit Profil
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleCancelParentEdit} disabled={isSavingParent}>
                      <X size={16} className="mr-2" />
                      Batal
                    </Button>
                    <Button size="sm" onClick={handleSaveParentProfile} disabled={isSavingParent}>
                      <Save size={16} className="mr-2" />
                      {isSavingParent ? "Menyimpan..." : "Simpan"}
                    </Button>
                  </div>
                )}
              </div>

              {parentError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {parentError}
                </div>
              )}

              {parentSuccess && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {parentSuccess}
                </div>
              )}

              {isEditingParent ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      label="Nama Lengkap"
                      value={parentForm.fullName}
                      onChange={(event) => setParentForm({ ...parentForm, fullName: event.target.value })}
                      placeholder="Nama lengkap orang tua"
                    />
                    <Input
                      label="Username"
                      value={parentForm.username}
                      onChange={(event) => setParentForm({ ...parentForm, username: event.target.value })}
                      placeholder="username"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Select
                      label="Pendidikan Terakhir"
                      options={[...PARENT_EDUCATION_OPTIONS]}
                      value={parentForm.educationLevel}
                      onChange={(event) => setParentForm({ ...parentForm, educationLevel: event.target.value })}
                    />
                    <Input
                      label="Pekerjaan"
                      value={parentForm.occupation}
                      onChange={(event) => setParentForm({ ...parentForm, occupation: event.target.value })}
                      placeholder="Pekerjaan"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Select
                      label="Jenis Kelamin"
                      options={[...PARENT_GENDER_OPTIONS]}
                      value={parentForm.gender}
                      onChange={(event) => setParentForm({ ...parentForm, gender: event.target.value })}
                    />
                    <Input
                      label="Umur"
                      type="number"
                      min="17"
                      value={parentForm.ageYears}
                      onChange={(event) => setParentForm({ ...parentForm, ageYears: event.target.value })}
                      placeholder="Umur"
                    />
                  </div>

                  <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4 space-y-3">
                    <Input
                      label="Gaji Bulanan"
                      type="number"
                      min="0"
                      step="0.01"
                      value={parentForm.incomeAmount}
                      onChange={(event) => setParentForm({ ...parentForm, incomeAmount: event.target.value })}
                      placeholder="Nominal gaji bulanan"
                    />
                    <div className="rounded-xl bg-white px-4 py-3 text-xs text-slate-600">
                      <p>
                        Acuan otomatis: <span className="font-bold text-slate-800">{BANYUMAS_UMK_2026_LABEL}</span> ({formatCurrencyId(BANYUMAS_UMK_2026)})
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${parentDraftIncomeClassification.className}`}>
                          {parentDraftIncomeClassification.label}
                        </span>
                        <span>{parentDraftIncomeClassification.helperText}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Gunakan tombol edit untuk memperbarui nama, username, pendidikan, pekerjaan, jenis kelamin, umur, dan gaji bulanan.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {profile?.role === "parent" && (
          <Card className="border border-teal-100 bg-teal-50/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-bold text-teal-800">Acuan Pendapatan Orang Tua</p>
              <p className="mt-2 text-sm text-slate-700">
                {incomeClassification.helperText}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Acuan otomatis: {BANYUMAS_UMK_2026_LABEL} sebesar {formatCurrencyId(BANYUMAS_UMK_2026)}
              </p>
            </CardContent>
          </Card>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 p-4 mt-8 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 transition-colors active:scale-[0.98]"
        >
          <LogOut size={20} />
          Keluar dari Akun
        </button>

      </div>
    </>
  );
}
