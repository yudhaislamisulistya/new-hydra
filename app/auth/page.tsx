"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { Droplets, User, UserCheck } from "lucide-react";
import { createClient } from "../../utils/supabase/client";

type Role = "student" | "parent" | "admin";
type Gender = "male" | "female";

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Form State
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    birthDate: "",
    gender: "male" as Gender,
    weightKg: "",
    heightCm: "",
  });

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const handleRegister = async () => {
    if (!role) return;
    
    setLoading(true);
    setErrorMsg("");

    // 1. Sign up user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          full_name: formData.fullName,
          role: role,
        }
      }
    });

    if (authError) {
      setErrorMsg(authError.message);
      setLoading(false);
      return;
    }

    // Note: The Supabase trigger will automatically insert into `profiles` table.
    
    // 2. If student, insert into student_profiles
    if (role === "student" && authData.user) {
      // Generate unique 5-char code (uppercase alphanumeric)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
      const studentCode = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

      const { error: profileError } = await supabase
        .from('student_profiles')
        .insert({
          id: authData.user.id,
          birth_date: formData.birthDate || null,
          gender: formData.gender,
          weight_kg: parseFloat(formData.weightKg) || null,
          height_cm: parseFloat(formData.heightCm) || null,
          daily_water_target_ml: 1500 + 20 * ((parseFloat(formData.weightKg) || 20) - 20), // DBB: 1500 + 20*(BB-20)
          student_code: studentCode,
        });
        
      if (profileError) {
         console.error("Failed to create student profile:", profileError);
      }
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col p-6 items-center justify-center">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg rotate-3">
            <Droplets size={32} className="text-white -rotate-3" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">NEW-HYDRAS</h1>
          <p className="text-slate-500 font-medium mt-1 text-center">
            {isLogin ? "Masuk ke akun Anda" : "Buat akun baru"}
          </p>
        </div>

        <Card className="shadow-lg border-0 ring-1 ring-slate-100">
          <CardContent className="p-6 md:p-8">
            {errorMsg && (
              <div className="mb-4 p-3 bg-red-100 text-red-600 text-sm rounded-lg">
                {errorMsg}
              </div>
            )}

            {isLogin ? (
              // --- LOGIN FORM ---
              <div className="space-y-4 animate-fade-in">
                <Input
                  label="Email"
                  type="email"
                  placeholder="email@contoh.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="******"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <Button className="w-full mt-4" size="lg" onClick={handleLogin} disabled={loading}>
                  {loading ? "Memproses..." : "Masuk"}
                </Button>
                <div className="text-center mt-4">
                  <p className="text-sm text-slate-500">
                    Belum punya akun?{" "}
                    <button onClick={() => setIsLogin(false)} className="text-blue-500 font-bold hover:underline">
                      Daftar
                    </button>
                  </p>
                </div>
              </div>
            ) : (
              // --- REGISTER FORM ---
              <>
                {step === 1 && (
                  <div className="space-y-6 animate-fade-in">
                    <h2 className="text-lg font-bold text-slate-800 text-center">Pilih Peran Kamu</h2>
                    <div className="grid gap-4">
                      <button
                        onClick={() => setRole("student")}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                          role === "student" ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:border-blue-200"
                        }`}
                      >
                        <div className={`p-3 rounded-full ${role === "student" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                          <User size={24} />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-slate-800">Anak / Siswa</p>
                          <p className="text-xs text-slate-500">Mulai catat minum harianmu!</p>
                        </div>
                      </button>

                      <button
                        onClick={() => setRole("parent")}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                          role === "parent" ? "border-teal-500 bg-teal-50" : "border-slate-100 hover:border-teal-200"
                        }`}
                      >
                        <div className={`p-3 rounded-full ${role === "parent" ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                          <UserCheck size={24} />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-slate-800">Orang Tua</p>
                          <p className="text-xs text-slate-500">Pantau hidrasi anak Anda</p>
                        </div>
                      </button>
                    </div>
                    
                    <div className="flex gap-3 mt-4">
                      <Button variant="outline" className="w-full" onClick={() => setIsLogin(true)}>
                        Batal
                      </Button>
                      <Button className="w-full" disabled={!role} onClick={() => setStep(2)}>
                        Lanjutkan
                      </Button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4 animate-fade-in">
                    <h2 className="text-lg font-bold text-slate-800 text-center mb-4">
                      {role === "student" ? "Profil Anak" : "Profil Orang Tua"}
                    </h2>
                    
                    <Input
                      label="Nama Lengkap"
                      placeholder="Contoh: Budi Susanto"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    />
                    <Input
                      label="Email"
                      type="email"
                      placeholder="email@contoh.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                    <Input
                      label="Password"
                      type="password"
                      placeholder="Minimal 6 karakter"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />

                    {role === "student" && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Tanggal Lahir"
                            type="date"
                            value={formData.birthDate}
                            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                          />
                          <Select
                            label="Jenis Kelamin"
                            options={[{ value: "male", label: "Laki-laki" }, { value: "female", label: "Perempuan" }]}
                            value={formData.gender}
                            onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Berat (kg)"
                            type="number"
                            placeholder="Contoh: 30"
                            value={formData.weightKg}
                            onChange={(e) => setFormData({ ...formData, weightKg: e.target.value })}
                          />
                          <Input
                            label="Tinggi (cm)"
                            type="number"
                            placeholder="Contoh: 130"
                            value={formData.heightCm}
                            onChange={(e) => setFormData({ ...formData, heightCm: e.target.value })}
                          />
                        </div>
                      </>
                    )}

                    <div className="flex gap-3 pt-4">
                      <Button variant="outline" className="w-full" onClick={() => setStep(1)} disabled={loading}>
                        Kembali
                      </Button>
                      <Button className="w-full" onClick={handleRegister} disabled={loading}>
                        {loading ? "Memproses..." : "Daftar & Masuk"}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
