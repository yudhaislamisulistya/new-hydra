"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Droplet, BookOpen, ClipboardList, Users, BarChart3, User, Trophy } from "lucide-react";
import { cn } from "../../utils/cn";
import { useUserStore } from "../../store/useUserStore";

export function BottomNav() {
  const pathname = usePathname();
  const { profile } = useUserStore();

  const navItems = profile?.role === "parent" 
    ? [
        { name: "Anak", href: "/dashboard", icon: Users },
        { name: "Progress", href: "/progress", icon: BarChart3 },
        { name: "Profil", href: "/profile", icon: User },
      ]
    : [
        { name: "Home", href: "/dashboard", icon: Home },
        { name: "Tracker", href: "/tracker", icon: Droplet },
        { name: "Edukasi", href: "/education", icon: BookOpen },
        { name: "Survei", href: "/survey", icon: ClipboardList },
        { name: "Ranking", href: "/leaderboard", icon: Trophy },
      ];

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-white border-t border-slate-200 px-4 pb-safe pt-2 flex justify-around items-center z-50">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center w-14 gap-1 transition-colors",
              isActive ? "text-blue-500" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-full transition-all",
              isActive && "bg-blue-50"
            )}>
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-medium">{item.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
