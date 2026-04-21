"use client";

import { useUserStore } from "../../../store/useUserStore";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { LogOut, User, Mail, ShieldCheck, Droplet, Crown, Zap, Lock, Palette } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEffect, useState } from "react";
import { BUDDY_ACCESSORIES, BUDDY_COLORS, getBuddyAccessory, getBuddyColor } from "../../../utils/hydrationBuddy";

const XP_PER_LEVEL = 500;

export default function ProfilePage() {
  const { profile, logout } = useUserStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  
  // Gamification State
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  
  // Customization State
  const [avatarColor, setAvatarColor] = useState('blue');
  const [avatarAccessory, setAvatarAccessory] = useState('none');
  const [activeTab, setActiveTab] = useState<'color' | 'accessory'>('color');

  useEffect(() => {
    async function fetchProfileData() {
      const supabase = createClient();
      
      // Get Email
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);

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
          
        const totalXp = ((surveyCount || 0) * 100) + ((logCount || 0) * 10);
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

  const handleLogout = async () => {
    await logout();
    router.push("/auth");
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

          {/* Basic Info */}
          <div className="bg-white rounded-3xl p-5 border-2 border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xl">
                {profile?.nickname ? profile.nickname.charAt(0).toUpperCase() : "U"}
              </div>
              <div>
                <p className="font-bold text-slate-800">{profile?.nickname}</p>
                <p className="text-xs text-slate-500">{email || profile?.student_code}</p>
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
              
              {email && (
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                    <Mail size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email</p>
                    <p className="font-semibold text-slate-700">{email}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
