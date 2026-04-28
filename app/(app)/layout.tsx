"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "../../components/layout/BottomNav";
import { useUserStore } from "../../store/useUserStore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, profile, fetchProfile } = useUserStore();
  const router = useRouter();

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && profile?.role === "admin") {
      router.push("/admin");
    }
  }, [isLoading, isAuthenticated, profile, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Middleware handles actual route protection, 
  // but we can have an extra check here to avoid flicker of unprotected UI if it fails
  if (!isAuthenticated && !isLoading) {
    return null;
  }

  // Admin and Parent might have different bottom nav or no bottom nav at all in a real app,
  // but for now we keep it unified or we can conditionally hide it.
  const showBottomNav = profile?.role !== "admin" && profile?.role !== "teacher";

  return (
    <div className="min-h-full flex flex-col bg-slate-50 pb-20">
      {/* Content area */}
      <main className="flex-1 flex flex-col">{children}</main>
      
      {/* Bottom Navigation */}
      {showBottomNav && <BottomNav />}
    </div>
  );
}
