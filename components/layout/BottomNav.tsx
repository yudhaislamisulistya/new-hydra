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
        { name: "Pantauan", href: "/dashboard", icon: Users },
        { name: "Perkembangan", href: "/progress", icon: BarChart3 },
        { name: "Profil", href: "/profile", icon: User },
      ]
    : [
        { name: "Halaman Utama", href: "/dashboard", icon: Home },
        { name: "Ayo Belajar", href: "/education", icon: BookOpen },
        { name: "Ayo Catat", href: "/tracker", icon: Droplet },
        { name: "Ayo Jawab", href: "/survey", icon: ClipboardList },
        { name: "Papan Peringkat", href: "/leaderboard", icon: Trophy },
      ];

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md min-h-20 bg-white border-t border-slate-200 px-4 pb-safe pt-2 flex justify-around items-center z-50">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center w-16 gap-1 transition-colors",
              isActive ? "text-blue-500" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-full transition-all",
              isActive && "bg-blue-50"
            )}>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-medium text-center leading-tight">{item.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
