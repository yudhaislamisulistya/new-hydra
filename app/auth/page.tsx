"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Droplets, School2, User, UserCheck, GraduationCap } from "lucide-react";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { calculateBasicFluidNeeds } from "../../utils/hydrationCalc";
import { buildSyntheticEmailFromUsername, normalizeUsername, resolveLoginIdentifier } from "../../utils/authIdentity";
import { BANYUMAS_UMK_2026, BANYUMAS_UMK_2026_LABEL, classifyParentIncome, formatCurrencyId, PARENT_EDUCATION_OPTIONS, PARENT_GENDER_OPTIONS } from "../../utils/parentProfile";
import { formatSchoolName, normalizeSchoolNameKey } from "../../utils/schoolName";
import { createClient } from "../../utils/supabase/client";

type Role = "student" | "parent" | "admin" | "teacher";
type Gender = "male" | "female";
type SchoolOption = { value: string; label: string };
const OTHER_SCHOOL_VALUE = "__other__";

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    fullName: "",
    birthDate: "",
    gender: "male" as Gender,
    weightKg: "",
    heightCm: "",
    schoolId: "",
    customSchoolName: "",
    classLevel: "5",
    childOrder: "",
    employeeNumber: "",
    phone: "",
    fullTitle: "",
    parentEducation: "",
    parentOccupation: "",
    parentAge: "",
    parentIncomeAmount: "",
  });

  const fetchSchools = useCallback(async () => {
    setSchoolsLoading(true);

    const { data, error } = await supabase
      .from("schools")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching schools:", error);
      setSchools([]);
      setSchoolsLoading(false);
      return;
    }

    setSchools(
      ((data as { id: string; name: string }[] | null) || []).map((school) => ({
        value: school.id,
        label: school.name,
      })),
    );
    setSchoolsLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSchools();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchSchools]);

  const studentSchoolOptions = useMemo(
    () => [...schools, { value: OTHER_SCHOOL_VALUE, label: "Lainnya / Other" }],
    [schools],
  );

  const normalizedCustomSchoolName = formatSchoolName(formData.customSchoolName);

  const resolveStudentSchoolId = useCallback(async () => {
    if (formData.schoolId && formData.schoolId !== OTHER_SCHOOL_VALUE) {
      return formData.schoolId;
    }

    const formattedSchoolName = formatSchoolName(formData.customSchoolName);
    const normalizedKey = normalizeSchoolNameKey(formData.customSchoolName);

    if (!formattedSchoolName || !normalizedKey) {
      return null;
    }

    const existingSchool = schools.find((school) => normalizeSchoolNameKey(school.label) === normalizedKey);
    if (existingSchool) {
      return existingSchool.value;
    }

    const { data, error } = await supabase
      .from("schools")
      .insert({
        name: formattedSchoolName,
        is_active: true,
      })
      .select("id, name")
      .single();

    if (error) {
      throw error;
    }

    const insertedSchool = data as { id: string; name: string };
    setSchools((currentSchools) => {
      if (currentSchools.some((school) => school.value === insertedSchool.id)) {
        return currentSchools;
      }

      return [...currentSchools, { value: insertedSchool.id, label: insertedSchool.name }].sort((left, right) =>
        left.label.localeCompare(right.label, "id-ID"),
      );
    });

    return insertedSchool.id;
  }, [formData.customSchoolName, formData.schoolId, schools, supabase]);

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg("");

    const loginEmail = resolveLoginIdentifier(formData.username);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
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

    const normalizedUsername = normalizeUsername(formData.username);
    const syntheticEmail = buildSyntheticEmailFromUsername(normalizedUsername);

    if (normalizedUsername.length < 3) {
      setErrorMsg("Username minimal 3 karakter.");
      setLoading(false);
      return;
    }

    if (!formData.fullName.trim()) {
      setErrorMsg("Nama lengkap wajib diisi.");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setErrorMsg("Password minimal 6 karakter.");
      setLoading(false);
      return;
    }

    if (role === "teacher" && !formData.schoolId) {
      setErrorMsg("Pilih sekolah terlebih dahulu.");
      setLoading(false);
      return;
    }

    if (role === "student") {
      if (!formData.schoolId) {
        setErrorMsg("Pilih sekolah terlebih dahulu.");
        setLoading(false);
        return;
      }

      if (formData.schoolId === OTHER_SCHOOL_VALUE && !normalizedCustomSchoolName) {
        setErrorMsg("Isi nama sekolah terlebih dahulu.");
        setLoading(false);
        return;
      }
    }

    if (role === "parent") {
      if (!formData.parentEducation) {
        setErrorMsg("Pendidikan terakhir orang tua wajib dipilih.");
        setLoading(false);
        return;
      }

      if (!formData.parentOccupation.trim()) {
        setErrorMsg("Pekerjaan orang tua wajib diisi.");
        setLoading(false);
        return;
      }

      if (!formData.parentAge || Number(formData.parentAge) < 17) {
        setErrorMsg("Umur orang tua minimal 17 tahun.");
        setLoading(false);
        return;
      }

      if (!formData.parentIncomeAmount || Number(formData.parentIncomeAmount) <= 0) {
        setErrorMsg("Nominal gaji orang tua wajib diisi.");
        setLoading(false);
        return;
      }
    }

    const { data: existingUser, error: existingUserError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (existingUserError) {
      console.error("Failed to validate username:", existingUserError);
    }

    if (existingUser) {
      setErrorMsg("Username sudah dipakai. Silakan gunakan username lain.");
      setLoading(false);
      return;
    }

    const parentIncomeAmount = Number(formData.parentIncomeAmount);
    const parentIncomeClassification = classifyParentIncome(parentIncomeAmount);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: syntheticEmail,
      password: formData.password,
      options: {
        data: {
          full_name: formData.fullName,
          role,
          username: normalizedUsername,
        },
      },
    });

    if (authError) {
      if (authError.message === "Database error saving new user") {
        setErrorMsg("Registrasi gagal karena trigger database profil belum sinkron. Jalankan SQL perbaikan registrasi terlebih dahulu.");
      } else {
        setErrorMsg(authError.message);
      }
      setLoading(false);
      return;
    }

    if (authData.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: formData.fullName,
          username: normalizedUsername,
          email: syntheticEmail,
          role,
        })
        .eq("id", authData.user.id);

      if (profileError) {
        console.error("Failed to update profile:", profileError);
      }
    }

    if (role === "student" && authData.user) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const studentCode = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const weight = parseFloat(formData.weightKg) || 20;
      let resolvedSchoolId: string | null = null;

      try {
        resolvedSchoolId = await resolveStudentSchoolId();
      } catch (error) {
        console.error("Failed to resolve student school:", error);
        setErrorMsg("Akun siswa berhasil dibuat, tetapi data sekolah gagal diproses. Coba periksa nama sekolah lalu ulangi.");
        setLoading(false);
        return;
      }

      const { error: studentProfileError } = await supabase.from("student_profiles").insert({
        id: authData.user.id,
        birth_date: formData.birthDate || null,
        gender: formData.gender,
        weight_kg: parseFloat(formData.weightKg) || null,
        height_cm: parseFloat(formData.heightCm) || null,
        daily_water_target_ml: calculateBasicFluidNeeds(weight),
        student_code: studentCode,
        school_id: resolvedSchoolId,
        class_level: Number(formData.classLevel) || null,
        child_order: parseInt(formData.childOrder, 10) || null,
      });

      if (studentProfileError) {
        console.error("Failed to create student profile:", studentProfileError);
      }
    }

    if (role === "teacher" && authData.user) {
      const { error: teacherProfileError } = await supabase.from("teacher_profiles").insert({
        id: authData.user.id,
        school_id: formData.schoolId || null,
        employee_number: formData.employeeNumber.trim() || null,
        full_title: formData.fullTitle.trim() || null,
        gender: formData.gender,
        phone: formData.phone.trim() || null,
      });

      if (teacherProfileError) {
        console.error("Failed to create teacher profile:", teacherProfileError);
        setErrorMsg("Akun guru berhasil dibuat, tetapi detail guru gagal disimpan. Pastikan tabel teacher_profiles sudah tersedia.");
        setLoading(false);
        return;
      }
    }

    if (role === "parent" && authData.user) {
      const { error: parentProfileError } = await supabase.from("parent_profiles").insert({
        id: authData.user.id,
        education_level: formData.parentEducation || null,
        occupation: formData.parentOccupation.trim() || null,
        gender: formData.gender,
        age_years: parseInt(formData.parentAge, 10) || null,
        income_category: parentIncomeClassification.category || null,
        income_reference: "umk_banyumas_2026",
        income_amount: Number.isFinite(parentIncomeAmount) ? parentIncomeAmount : null,
      });

      if (parentProfileError) {
        console.error("Failed to create parent profile:", parentProfileError);
        setErrorMsg("Akun orang tua berhasil dibuat, tetapi detail profil orang tua gagal disimpan. Pastikan tabel parent_profiles sudah tersedia.");
        setLoading(false);
        return;
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
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">NEW HYDRA</h1>
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
              <div className="space-y-4 animate-fade-in">
                <Input
                  label="Username"
                  placeholder="contoh: budi01"
                  value={formData.username}
                  onChange={(event) => setFormData({ ...formData, username: event.target.value })}
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="******"
                  value={formData.password}
                  onChange={(event) => setFormData({ ...formData, password: event.target.value })}
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

                      <button
                        onClick={() => setRole("teacher")}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                          role === "teacher" ? "border-violet-500 bg-violet-50" : "border-slate-100 hover:border-violet-200"
                        }`}
                      >
                        <div className={`p-3 rounded-full ${role === "teacher" ? "bg-violet-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                          <GraduationCap size={24} />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-slate-800">Guru</p>
                          <p className="text-xs text-slate-500">Daftar guru dan hubungkan ke sekolah</p>
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
                      {role === "student" ? "Profil Anak" : role === "teacher" ? "Profil Guru" : "Profil Orang Tua"}
                    </h2>

                    <Input
                      label="Nama Lengkap"
                      placeholder="Contoh: Budi Susanto"
                      value={formData.fullName}
                      onChange={(event) => setFormData({ ...formData, fullName: event.target.value })}
                    />
                    <Input
                      label="Username"
                      placeholder="contoh: budi01"
                      value={formData.username}
                      onChange={(event) => setFormData({ ...formData, username: event.target.value })}
                    />
                    <Input
                      label="Password"
                      type="password"
                      placeholder="Minimal 6 karakter"
                      value={formData.password}
                      onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                    />

                    {role === "student" && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Tanggal Lahir"
                            type="date"
                            value={formData.birthDate}
                            onChange={(event) => setFormData({ ...formData, birthDate: event.target.value })}
                          />
                          <Select
                            label="Jenis Kelamin"
                            options={[
                              { value: "male", label: "Laki-laki" },
                              { value: "female", label: "Perempuan" },
                            ]}
                            value={formData.gender}
                            onChange={(event) => setFormData({ ...formData, gender: event.target.value as Gender })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Berat (kg)"
                            type="number"
                            placeholder="Contoh: 30"
                            value={formData.weightKg}
                            onChange={(event) => setFormData({ ...formData, weightKg: event.target.value })}
                          />
                          <Input
                            label="Tinggi (cm)"
                            type="number"
                            placeholder="Contoh: 130"
                            value={formData.heightCm}
                            onChange={(event) => setFormData({ ...formData, heightCm: event.target.value })}
                          />
                        </div>

                        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-4">
                          <div className="flex items-center gap-2">
                            <School2 size={16} className="text-blue-600" />
                            <p className="text-sm font-bold text-blue-800">Data Sekolah Siswa</p>
                          </div>

                          <Select
                            label="Sekolah"
                            options={studentSchoolOptions}
                            value={formData.schoolId}
                            onChange={(event) => setFormData({
                              ...formData,
                              schoolId: event.target.value,
                              customSchoolName: event.target.value === OTHER_SCHOOL_VALUE ? formData.customSchoolName : "",
                            })}
                            disabled={schoolsLoading}
                          />

                          {formData.schoolId === OTHER_SCHOOL_VALUE && (
                            <div className="space-y-3">
                              <Input
                                label="Nama Sekolah"
                                placeholder="Contoh: SDN 1 Ampana"
                                value={formData.customSchoolName}
                                onChange={(event) => setFormData({ ...formData, customSchoolName: event.target.value })}
                              />
                              <div className="rounded-xl border border-blue-100 bg-white/80 px-3 py-3 text-xs text-slate-600">
                                <p className="font-semibold text-slate-700">Format sekolah yang akan disimpan</p>
                                <p className="mt-1">{normalizedCustomSchoolName || "Nama sekolah akan dirapikan otomatis setelah diisi."}</p>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-4">
                            <Select
                              label="Kelas"
                              options={[
                                { value: "5", label: "Kelas 5" },
                                { value: "6", label: "Kelas 6" },
                              ]}
                              value={formData.classLevel}
                              onChange={(event) => setFormData({ ...formData, classLevel: event.target.value })}
                            />
                            <Input
                              label="Anak Ke"
                              type="number"
                              min="1"
                              placeholder="Contoh: 1"
                              value={formData.childOrder}
                              onChange={(event) => setFormData({ ...formData, childOrder: event.target.value })}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {role === "teacher" && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <Select
                            label="Jenis Kelamin"
                            options={[
                              { value: "male", label: "Laki-laki" },
                              { value: "female", label: "Perempuan" },
                            ]}
                            value={formData.gender}
                            onChange={(event) => setFormData({ ...formData, gender: event.target.value as Gender })}
                          />
                          <Input
                            label="Nomor HP"
                            type="tel"
                            placeholder="Contoh: 08123456789"
                            value={formData.phone}
                            onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Nomor Induk Guru"
                            placeholder="Contoh: 19881234"
                            value={formData.employeeNumber}
                            onChange={(event) => setFormData({ ...formData, employeeNumber: event.target.value })}
                          />
                          <Input
                            label="Jabatan / Gelar"
                            placeholder="Contoh: Wali Kelas 5A"
                            value={formData.fullTitle}
                            onChange={(event) => setFormData({ ...formData, fullTitle: event.target.value })}
                          />
                        </div>

                        <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 space-y-4">
                          <div className="flex items-center gap-2">
                            <School2 size={16} className="text-violet-600" />
                            <p className="text-sm font-bold text-violet-800">Data Sekolah Guru</p>
                          </div>

                          <Select
                            label="Sekolah"
                            options={schools}
                            value={formData.schoolId}
                            onChange={(event) => setFormData({ ...formData, schoolId: event.target.value })}
                            disabled={schoolsLoading}
                          />
                        </div>
                      </>
                    )}

                    {role === "parent" && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <Select
                            label="Jenis Kelamin"
                            options={[...PARENT_GENDER_OPTIONS]}
                            value={formData.gender}
                            onChange={(event) => setFormData({ ...formData, gender: event.target.value as Gender })}
                          />
                          <Input
                            label="Umur"
                            type="number"
                            min="17"
                            placeholder="Contoh: 38"
                            value={formData.parentAge}
                            onChange={(event) => setFormData({ ...formData, parentAge: event.target.value })}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <Select
                            label="Pendidikan Terakhir"
                            options={[...PARENT_EDUCATION_OPTIONS]}
                            value={formData.parentEducation}
                            onChange={(event) => setFormData({ ...formData, parentEducation: event.target.value })}
                          />
                          <Input
                            label="Pekerjaan"
                            placeholder="Contoh: Ibu Rumah Tangga"
                            value={formData.parentOccupation}
                            onChange={(event) => setFormData({ ...formData, parentOccupation: event.target.value })}
                          />
                        </div>

                        <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4 space-y-4">
                          <div className="flex items-center gap-2">
                            <School2 size={16} className="text-teal-600" />
                            <p className="text-sm font-bold text-teal-800">Data Pendapatan Orang Tua</p>
                          </div>

                          <Input
                            label="Gaji Bulanan"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Contoh: 2500000"
                            value={formData.parentIncomeAmount}
                            onChange={(event) => setFormData({ ...formData, parentIncomeAmount: event.target.value })}
                          />

                          <div className="rounded-xl bg-white/80 px-3 py-3 text-xs text-slate-600 space-y-2">
                            <p>
                              Acuan otomatis: <span className="font-bold text-slate-800">{BANYUMAS_UMK_2026_LABEL}</span> ({formatCurrencyId(BANYUMAS_UMK_2026)})
                            </p>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${classifyParentIncome(Number(formData.parentIncomeAmount)).className}`}>
                                {classifyParentIncome(Number(formData.parentIncomeAmount)).label}
                              </span>
                              <span>{classifyParentIncome(Number(formData.parentIncomeAmount)).helperText}</span>
                            </div>
                          </div>
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
