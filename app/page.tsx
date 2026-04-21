"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Droplets } from "lucide-react";
import { createClient } from "../utils/supabase/client";

export default function SplashScreen() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      setTimeout(() => {
        if (session) {
          router.push("/dashboard");
        } else {
          router.push("/auth");
        }
      }, 2500); // 2.5 seconds splash
    };

    checkAuth();
  }, [router, supabase.auth]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-400 to-blue-600 p-6 text-white overflow-hidden relative">
      {/* Background bubbles animation placeholder */}
      <div className="absolute w-32 h-32 bg-white/10 rounded-full top-20 -left-10 animate-bounce" style={{ animationDuration: '4s' }} />
      <div className="absolute w-24 h-24 bg-white/10 rounded-full bottom-32 -right-4 animate-bounce" style={{ animationDuration: '6s' }} />
      
      <div className="flex flex-col items-center justify-center z-10 animate-fade-in-up">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl relative overflow-hidden">
          <Droplets size={48} className="text-blue-500 z-10 animate-pulse" />
          {/* Water fill effect */}
          <div className="absolute bottom-0 w-full h-1/2 bg-blue-100 animate-pulse" />
        </div>
        
        <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-center text-white drop-shadow-md">
          NEW-HYDRAS
        </h1>
        <p className="text-blue-100 font-medium text-center px-4 max-w-xs text-sm">
          Deteksi Status Hidrasi untuk Anak Sekolah Dasar
        </p>
      </div>

      <div className="absolute bottom-10 flex gap-2">
        <div className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0s' }} />
        <div className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.2s' }} />
        <div className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.4s' }} />
      </div>
    </div>
  );
}
