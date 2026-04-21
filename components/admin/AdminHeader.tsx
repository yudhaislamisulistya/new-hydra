"use client";

import { useUserStore } from "../../store/useUserStore";
import { LogOut, Bell } from "lucide-react";
import { useRouter } from "next/navigation";

export function AdminHeader({ title }: { title: string }) {
  const { profile, logout } = useUserStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/auth");
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 h-16 px-8 flex items-center justify-between shadow-sm">
      <h1 className="text-xl font-bold text-slate-800">{title}</h1>
      
      <div className="flex items-center gap-6">
        <button className="text-slate-400 hover:text-slate-600 transition-colors relative">
          <Bell size={20} />
          <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
        </button>

        <div className="h-8 w-px bg-slate-200"></div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-sm font-semibold text-slate-700">{profile?.nickname || "Admin User"}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Administrator</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold border-2 border-slate-100 shadow-sm overflow-hidden">
            {profile?.nickname ? profile.nickname.charAt(0).toUpperCase() : "A"}
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 ml-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            title="Keluar"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
