"use client";

import { useUserStore } from "../../store/useUserStore";
import { Bell, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../../utils/supabase/client";

type NotificationCountRow = {
  id: string;
};

export function Header({ title }: { title: string }) {
  const { profile, logout } = useUserStore();
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);

  const handleLogout = async () => {
    await logout();
    router.push("/auth");
  };

  useEffect(() => {
    const handleNotificationsUpdated = () => setRefreshToken((current) => current + 1);
    window.addEventListener("notifications-updated", handleNotificationsUpdated);

    return () => {
      window.removeEventListener("notifications-updated", handleNotificationsUpdated);
    };
  }, []);

  useEffect(() => {
    async function fetchUnreadCount() {
      if (!profile?.id || profile.role !== "student") {
        setUnreadCount(0);
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from("child_notifications")
        .select("id")
        .eq("child_id", profile.id)
        .eq("is_read", false);

      if (error) {
        console.error("Error fetching notification count:", error);
        return;
      }

      setUnreadCount(((data as NotificationCountRow[] | null) || []).length);
    }

    void fetchUnreadCount();
  }, [profile?.id, profile?.role, pathname, refreshToken]);

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 h-16 px-6 flex items-center justify-between">
      <h1 className="text-xl font-bold text-slate-800">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-sm font-semibold text-slate-700">{profile?.nickname || "User"}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{profile?.role || "GUEST"}</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 font-bold border-2 border-white shadow-sm overflow-hidden">
            {profile?.nickname ? profile.nickname.charAt(0).toUpperCase() : "U"}
          </div>
        </div>
        {profile?.role === "student" && (
          <button
            onClick={() => router.push("/notifications")}
            className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors relative"
            title="Notifikasi"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}
        <button 
          onClick={handleLogout}
          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
          title="Keluar"
        >
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}
