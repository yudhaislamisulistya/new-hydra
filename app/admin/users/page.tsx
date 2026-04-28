"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Edit3, Loader2, Save, Trash2, X } from "lucide-react";
import { AdminHeader } from "../../../components/admin/AdminHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { useUserStore } from "../../../store/useUserStore";
import { calculateBasicFluidNeeds } from "../../../utils/hydrationCalc";
import { BANYUMAS_UMK_2026, BANYUMAS_UMK_2026_LABEL, classifyParentIncome, formatCurrencyId, getParentEducationLabel, PARENT_EDUCATION_OPTIONS, PARENT_GENDER_OPTIONS } from "../../../utils/parentProfile";
import { createClient } from "../../../utils/supabase/client";

type UserRole = "student" | "parent" | "admin" | "teacher";
type StudentGender = "male" | "female";
type SchoolOption = { value: string; label: string };

type StudentProfile = {
  id: string;
  birth_date: string | null;
  gender: StudentGender | null;
  weight_kg: number | null;
  height_cm: number | null;
  daily_water_target_ml: number | null;
  student_code?: string | null;
};

type TeacherProfile = {
  id: string;
  school_id: string | null;
  employee_number: string | null;
  full_title: string | null;
  gender: StudentGender | null;
  phone: string | null;
  schools?: {
    name: string | null;
  } | {
    name: string | null;
  }[] | null;
};

type ParentProfile = {
  id: string;
  education_level: string | null;
  occupation: string | null;
  gender: StudentGender | null;
  age_years: number | null;
  income_category: string | null;
  income_reference: string | null;
  income_amount: number | null;
};

type AdminUser = {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  created_at: string;
  student_profiles?: StudentProfile | null;
  teacher_profiles?: TeacherProfile | null;
  parent_profiles?: ParentProfile | null;
};

type EditFormData = {
  full_name: string;
  email: string;
  role: UserRole;
  birth_date: string;
  gender: StudentGender;
  weight_kg: string;
  height_cm: string;
  daily_water_target_ml: string;
  school_id: string;
  employee_number: string;
  full_title: string;
  phone: string;
  education_level: string;
  occupation: string;
  age_years: string;
  income_amount: string;
};

const roleLabels: Record<UserRole, string> = {
  student: "Siswa",
  parent: "Orang Tua",
  admin: "Admin",
  teacher: "Guru",
};

function generateStudentCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function toNullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function AdminUsersPage() {
  const { profile: currentProfile } = useUserStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<"all" | UserRole>("all");
  const [refreshToken, setRefreshToken] = useState(0);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    full_name: "",
    email: "",
    role: "student",
    birth_date: "",
    gender: "male",
    weight_kg: "",
    height_cm: "",
    daily_water_target_ml: "",
    school_id: "",
    employee_number: "",
    full_title: "",
    phone: "",
    education_level: "",
    occupation: "",
    age_years: "",
    income_amount: "",
  });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [schools, setSchools] = useState<SchoolOption[]>([]);

  useEffect(() => {
    let isActive = true;

    async function fetchSchools() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("schools")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching schools for admin users:", error);
        return;
      }

      if (!isActive) return;

      setSchools(
        (((data as { id: string; name: string }[] | null) || []).map((school) => ({
          value: school.id,
          label: school.name,
        }))),
      );
    }

    void fetchSchools();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function fetchUsers() {
      const supabase = createClient();

      try {
        let query = supabase
          .from("profiles")
          .select(`
            id,
            role,
            full_name,
            email,
            created_at
          `)
          .order("created_at", { ascending: false });

        if (filterRole !== "all") {
          query = query.eq("role", filterRole);
        }

        const { data: profilesData, error: profilesError } = await query;
        if (profilesError) throw profilesError;

        const typedProfiles = (profilesData || []) as AdminUser[];
        const studentIds = typedProfiles.filter((profile) => profile.role === "student").map((profile) => profile.id);
        const teacherIds = typedProfiles.filter((profile) => profile.role === "teacher").map((profile) => profile.id);
        const parentIds = typedProfiles.filter((profile) => profile.role === "parent").map((profile) => profile.id);

        const studentMap: Record<string, StudentProfile> = {};
        const teacherMap: Record<string, TeacherProfile> = {};
        const parentMap: Record<string, ParentProfile> = {};

        if (studentIds.length > 0) {
          const { data: studentData, error: studentError } = await supabase
            .from("student_profiles")
            .select("*")
            .in("id", studentIds);

          if (studentError) throw studentError;

          ((studentData || []) as StudentProfile[]).forEach((studentProfile) => {
            studentMap[studentProfile.id] = studentProfile;
          });
        }

        if (teacherIds.length > 0) {
          const { data: teacherData, error: teacherError } = await supabase
            .from("teacher_profiles")
            .select("id, school_id, employee_number, full_title, gender, phone, schools(name)")
            .in("id", teacherIds);

          if (teacherError) throw teacherError;

          ((teacherData || []) as TeacherProfile[]).forEach((teacherProfile) => {
            teacherMap[teacherProfile.id] = teacherProfile;
          });
        }

        if (parentIds.length > 0) {
          const { data: parentData, error: parentError } = await supabase
            .from("parent_profiles")
            .select("id, education_level, occupation, gender, age_years, income_category, income_reference, income_amount")
            .in("id", parentIds);

          if (parentError) throw parentError;

          ((parentData || []) as ParentProfile[]).forEach((parentProfile) => {
            parentMap[parentProfile.id] = parentProfile;
          });
        }

        const merged = typedProfiles.map((profile) => ({
          ...profile,
          student_profiles: studentMap[profile.id] || null,
          teacher_profiles: teacherMap[profile.id] || null,
          parent_profiles: parentMap[profile.id] || null,
        }));

        if (isActive) setUsers(merged);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        if (isActive) setLoading(false);
      }
    }

    fetchUsers();

    return () => {
      isActive = false;
    };
  }, [filterRole, refreshToken]);

  const refreshUsers = () => {
    setLoading(true);
    setRefreshToken((token) => token + 1);
  };

  const handleFilterChange = (nextRole: "all" | UserRole) => {
    setLoading(true);
    setFilterRole(nextRole);
  };

  const handleOpenEdit = (user: AdminUser) => {
    const weight = user.student_profiles?.weight_kg;
    const defaultTarget = weight ? calculateBasicFluidNeeds(weight) : "";

    setEditingUser(user);
    setEditFormData({
      full_name: user.full_name || "",
      email: user.email || "",
      role: user.role,
      birth_date: user.student_profiles?.birth_date || "",
      gender: user.student_profiles?.gender || user.teacher_profiles?.gender || "male",
      weight_kg: weight ? String(weight) : "",
      height_cm: user.student_profiles?.height_cm ? String(user.student_profiles.height_cm) : "",
      daily_water_target_ml: user.student_profiles?.daily_water_target_ml
        ? String(user.student_profiles.daily_water_target_ml)
        : String(defaultTarget),
      school_id: user.teacher_profiles?.school_id || "",
      employee_number: user.teacher_profiles?.employee_number || "",
      full_title: user.teacher_profiles?.full_title || "",
      phone: user.teacher_profiles?.phone || "",
      education_level: user.parent_profiles?.education_level || "",
      occupation: user.parent_profiles?.occupation || "",
      age_years: user.parent_profiles?.age_years ? String(user.parent_profiles.age_years) : "",
      income_amount: user.parent_profiles?.income_amount ? String(user.parent_profiles.income_amount) : "",
    });
  };

  const handleCloseEdit = () => {
    if (isEditSubmitting) return;
    setEditingUser(null);
  };

  const handleEditSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;

    setIsEditSubmitting(true);
    const supabase = createClient();

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: editFormData.full_name.trim() || null,
          email: editFormData.email.trim() || null,
          role: editFormData.role,
        })
        .eq("id", editingUser.id);

      if (profileError) throw profileError;

      if (editFormData.role === "student") {
        const weight = toNullableNumber(editFormData.weight_kg);
        const calculatedTarget = weight ? calculateBasicFluidNeeds(weight) : null;
        const target = toNullableNumber(editFormData.daily_water_target_ml) || calculatedTarget;

        const { error: studentError } = await supabase
          .from("student_profiles")
          .upsert({
            id: editingUser.id,
            birth_date: editFormData.birth_date || null,
            gender: editFormData.gender,
            weight_kg: weight,
            height_cm: toNullableNumber(editFormData.height_cm),
            daily_water_target_ml: target,
            student_code: editingUser.student_profiles?.student_code || generateStudentCode(),
            updated_at: new Date().toISOString(),
          });

        if (studentError) throw studentError;
      }

      if (editFormData.role === "teacher") {
        const { error: teacherError } = await supabase
          .from("teacher_profiles")
          .upsert({
            id: editingUser.id,
            school_id: editFormData.school_id || null,
            employee_number: editFormData.employee_number.trim() || null,
            full_title: editFormData.full_title.trim() || null,
            gender: editFormData.gender,
            phone: editFormData.phone.trim() || null,
            updated_at: new Date().toISOString(),
          });

        if (teacherError) throw teacherError;
      }

      if (editFormData.role === "parent") {
        const incomeAmount = toNullableNumber(editFormData.income_amount);
        const incomeClassification = classifyParentIncome(incomeAmount);

        const { error: parentError } = await supabase
          .from("parent_profiles")
          .upsert({
            id: editingUser.id,
            education_level: editFormData.education_level || null,
            occupation: editFormData.occupation.trim() || null,
            gender: editFormData.gender,
            age_years: toNullableNumber(editFormData.age_years),
            income_category: incomeClassification.category || null,
            income_reference: "umk_banyumas_2026",
            income_amount: incomeAmount,
            updated_at: new Date().toISOString(),
          });

        if (parentError) throw parentError;
      }

      setEditingUser(null);
      refreshUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat menyimpan pengguna.";
      alert(`Gagal menyimpan pengguna: ${message}`);
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (user.id === currentProfile?.id) {
      alert("Akun admin yang sedang digunakan tidak bisa dihapus dari halaman ini.");
      return;
    }

    const confirmed = confirm(`Hapus pengguna "${user.full_name || user.email || "Tanpa Nama"}" dari aplikasi? Data profil dan relasi terkait akan dihapus.`);
    if (!confirmed) return;

    setDeletingUserId(user.id);
    const supabase = createClient();

    try {
      const deleteRows = async (tableName: string, columnName: string) => {
        const { error } = await supabase.from(tableName).delete().eq(columnName, user.id);
        if (error) throw error;
      };

      if (user.role === "student") {
        await deleteRows("child_notifications", "child_id");
        await deleteRows("parent_children", "child_id");
        await deleteRows("hydration_logs", "student_id");
        await deleteRows("survey_responses", "student_id");
        await deleteRows("student_profiles", "id");
      }

      if (user.role === "parent") {
        await deleteRows("child_notifications", "parent_id");
        await deleteRows("parent_children", "parent_id");
        await deleteRows("parent_profiles", "id");
      }

      if (user.role === "teacher") {
        await deleteRows("teacher_profiles", "id");
      }

      await deleteRows("survey_responses", "respondent_id");

      const { error: profileError } = await supabase.from("profiles").delete().eq("id", user.id);
      if (profileError) throw profileError;

      setUsers((currentUsers) => currentUsers.filter((currentUser) => currentUser.id !== user.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat menghapus pengguna.";
      alert(`Gagal menghapus pengguna: ${message}`);
      refreshUsers();
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <>
      <AdminHeader title="Manajemen Pengguna" />
      <div className="p-8">
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-xl">
              <h2 className="text-lg font-bold text-slate-800">Daftar Pengguna</h2>
              <select
                className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none"
                value={filterRole}
                onChange={(event) => handleFilterChange(event.target.value as "all" | UserRole)}
              >
                <option value="all">Semua Role</option>
                <option value="student">Anak / Siswa</option>
                <option value="parent">Orang Tua</option>
                <option value="teacher">Guru</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th scope="col" className="px-6 py-4">Nama Lengkap</th>
                    <th scope="col" className="px-6 py-4">Email</th>
                    <th scope="col" className="px-6 py-4">Role</th>
                    <th scope="col" className="px-6 py-4">Detail Tambahan</th>
                    <th scope="col" className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                        Memuat data pengguna...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                        Tidak ada pengguna ditemukan.
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                          {user.full_name || "-"}
                        </td>
                        <td className="px-6 py-4">
                          {user.email || "-"}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                            user.role === "student" ? "bg-blue-50 text-blue-600 border-blue-200" :
                            user.role === "parent" ? "bg-teal-50 text-teal-600 border-teal-200" :
                            user.role === "teacher" ? "bg-violet-50 text-violet-600 border-violet-200" :
                            "bg-purple-50 text-purple-600 border-purple-200"
                          }`}>
                            {roleLabels[user.role]}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {user.role === "student" && user.student_profiles ? (
                            <div className="text-xs">
                              {user.student_profiles.weight_kg || "-"} kg &bull; {user.student_profiles.height_cm || "-"} cm &bull; Target: {user.student_profiles.daily_water_target_ml || "-"}ml
                            </div>
                          ) : user.role === "teacher" && user.teacher_profiles ? (
                            <div className="text-xs space-y-1">
                              <div>{Array.isArray(user.teacher_profiles.schools) ? user.teacher_profiles.schools[0]?.name || "-" : user.teacher_profiles.schools?.name || "-"}</div>
                              <div>NIG: {user.teacher_profiles.employee_number || "-"} &bull; HP: {user.teacher_profiles.phone || "-"}</div>
                            </div>
                          ) : user.role === "parent" && user.parent_profiles ? (
                            <div className="text-xs space-y-1">
                              <div>{getParentEducationLabel(user.parent_profiles.education_level)} &bull; {user.parent_profiles.occupation || "-"}</div>
                              <div>{user.parent_profiles.age_years || "-"} th &bull; {classifyParentIncome(user.parent_profiles.income_amount).label}</div>
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(user)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
                              title="Edit pengguna"
                              aria-label={`Edit pengguna ${user.full_name || user.email || "tanpa nama"}`}
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(user)}
                              disabled={deletingUserId === user.id}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              title="Hapus pengguna"
                              aria-label={`Hapus pengguna ${user.full_name || user.email || "tanpa nama"}`}
                            >
                              {deletingUserId === user.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-between items-center text-sm text-slate-500">
              <span>Menampilkan {users.length} pengguna</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Edit Pengguna</h3>
                <p className="text-xs text-slate-500">Perbarui profil aplikasi pengguna.</p>
              </div>
              <button
                type="button"
                onClick={handleCloseEdit}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Tutup modal edit"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Nama Lengkap</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      value={editFormData.full_name}
                      onChange={(event) => setEditFormData({ ...editFormData, full_name: event.target.value })}
                      placeholder="Nama pengguna"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      type="email"
                      value={editFormData.email}
                      onChange={(event) => setEditFormData({ ...editFormData, email: event.target.value })}
                      placeholder="email@contoh.com"
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Role</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    value={editFormData.role}
                    onChange={(event) => setEditFormData({ ...editFormData, role: event.target.value as UserRole })}
                  >
                    <option value="student">Siswa</option>
                    <option value="parent">Orang Tua</option>
                    <option value="teacher">Guru</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>

                {editFormData.role === "student" && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                    <p className="mb-4 text-sm font-bold text-blue-700">Detail Siswa</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tanggal Lahir</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          type="date"
                          value={editFormData.birth_date}
                          onChange={(event) => setEditFormData({ ...editFormData, birth_date: event.target.value })}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Jenis Kelamin</span>
                        <select
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          value={editFormData.gender}
                          onChange={(event) => setEditFormData({ ...editFormData, gender: event.target.value as StudentGender })}
                        >
                          <option value="male">Laki-laki</option>
                          <option value="female">Perempuan</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Berat Badan (kg)</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          min="0"
                          step="0.1"
                          type="number"
                          value={editFormData.weight_kg}
                          onChange={(event) => {
                            const nextWeight = event.target.value;
                            const parsedWeight = toNullableNumber(nextWeight);
                            setEditFormData({
                              ...editFormData,
                              weight_kg: nextWeight,
                              daily_water_target_ml: parsedWeight ? String(calculateBasicFluidNeeds(parsedWeight)) : editFormData.daily_water_target_ml,
                            });
                          }}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tinggi Badan (cm)</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          min="0"
                          step="0.1"
                          type="number"
                          value={editFormData.height_cm}
                          onChange={(event) => setEditFormData({ ...editFormData, height_cm: event.target.value })}
                        />
                      </label>
                      <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">FBB / Kebutuhan Dasar (ml)</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          min="0"
                          step="1"
                          type="number"
                          value={editFormData.daily_water_target_ml}
                          onChange={(event) => setEditFormData({ ...editFormData, daily_water_target_ml: event.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {editFormData.role === "teacher" && (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                    <p className="mb-4 text-sm font-bold text-violet-700">Detail Guru</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Sekolah</span>
                        <select
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                          value={editFormData.school_id}
                          onChange={(event) => setEditFormData({ ...editFormData, school_id: event.target.value })}
                        >
                          <option value="">Pilih sekolah</option>
                          {schools.map((school) => (
                            <option key={school.value} value={school.value}>
                              {school.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Nomor Induk Guru</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                          value={editFormData.employee_number}
                          onChange={(event) => setEditFormData({ ...editFormData, employee_number: event.target.value })}
                          placeholder="Nomor induk guru"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Nomor HP</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                          value={editFormData.phone}
                          onChange={(event) => setEditFormData({ ...editFormData, phone: event.target.value })}
                          placeholder="08xxxxxxxxxx"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Jenis Kelamin</span>
                        <select
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                          value={editFormData.gender}
                          onChange={(event) => setEditFormData({ ...editFormData, gender: event.target.value as StudentGender })}
                        >
                          <option value="male">Laki-laki</option>
                          <option value="female">Perempuan</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Jabatan / Gelar</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                          value={editFormData.full_title}
                          onChange={(event) => setEditFormData({ ...editFormData, full_title: event.target.value })}
                          placeholder="Wali Kelas / Guru PJOK / S.Pd"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {editFormData.role === "parent" && (
                  <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
                    <p className="mb-4 text-sm font-bold text-teal-700">Detail Orang Tua</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pendidikan Terakhir</span>
                        <select
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          value={editFormData.education_level}
                          onChange={(event) => setEditFormData({ ...editFormData, education_level: event.target.value })}
                        >
                          <option value="">Pilih pendidikan</option>
                          {PARENT_EDUCATION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pekerjaan</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          value={editFormData.occupation}
                          onChange={(event) => setEditFormData({ ...editFormData, occupation: event.target.value })}
                          placeholder="Pekerjaan orang tua"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Jenis Kelamin</span>
                        <select
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          value={editFormData.gender}
                          onChange={(event) => setEditFormData({ ...editFormData, gender: event.target.value as StudentGender })}
                        >
                          {PARENT_GENDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Umur</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          min="17"
                          type="number"
                          value={editFormData.age_years}
                          onChange={(event) => setEditFormData({ ...editFormData, age_years: event.target.value })}
                          placeholder="Umur orang tua"
                        />
                      </label>
                      <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gaji Bulanan</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          min="0"
                          step="0.01"
                          type="number"
                          value={editFormData.income_amount}
                          onChange={(event) => setEditFormData({ ...editFormData, income_amount: event.target.value })}
                          placeholder="Nominal gaji bulanan"
                        />
                      </label>
                      <div className="md:col-span-2 rounded-xl bg-white px-4 py-3 text-xs text-slate-600 border border-teal-100">
                        <p>Acuan otomatis: <span className="font-bold text-slate-800">{BANYUMAS_UMK_2026_LABEL}</span> ({formatCurrencyId(BANYUMAS_UMK_2026)})</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${classifyParentIncome(toNullableNumber(editFormData.income_amount)).className}`}>
                            {classifyParentIncome(toNullableNumber(editFormData.income_amount)).label}
                          </span>
                          <span>{classifyParentIncome(toNullableNumber(editFormData.income_amount)).helperText}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 border-t border-slate-100 bg-slate-50 p-5">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  disabled={isEditSubmitting}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {isEditSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isEditSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
