import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, ClipboardList, Activity, Droplets, PlaySquare } from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Daftar User", icon: Users },
  { href: "/admin/quizzes", label: "Kuis", icon: ClipboardList },
  { href: "/admin/education", label: "Edukasi & Video", icon: PlaySquare },
  { href: "/admin/activity", label: "Aktivitas Minum", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0 shrink-0 shadow-xl">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
        <Droplets className="text-blue-500 mr-3" size={24} />
        <span className="font-bold text-white text-lg tracking-wide">HYDRAS ADMIN</span>
      </div>
      
      <nav className="flex-1 py-6 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-3 rounded-lg transition-colors ${
                isActive 
                  ? "bg-blue-600 text-white font-medium shadow-md shadow-blue-900/20" 
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon size={20} className="mr-3 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
        &copy; 2026 New-Hydras
      </div>
    </aside>
  );
}
