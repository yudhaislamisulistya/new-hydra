import { createClient } from "./api/client";
import { fetchAllRows } from "./dataAccess";
import { styleHeader } from "./hydrationExcel";
import { getParentEducationLabel } from "./parentProfile";

export type PersonalProfile = { id: string; role: string; full_name: string | null; username: string; email: string | null };
export type StudentPersonal = { id: string; student_code: string | null; gender: string | null; birth_date: string | null; weight_kg: number | null; height_cm: number | null; class_level: number | null; child_order: number | null; study_group: string; school_id: string | null };
export type ParentPersonal = { id: string; gender: string | null; age_years: number | null; education_level: string | null; occupation: string | null; income_amount: number | null };
export type PersonalData = { profiles: PersonalProfile[]; students: StudentPersonal[]; parents: ParentPersonal[]; schools: { id: string; name: string }[]; links: { parent_id: string; child_id: string }[] };
const genderLabel = (value: string | null) => value === "female" || value === "P" ? "Perempuan" : value === "male" || value === "L" ? "Laki-laki" : "Belum diisi";

export async function buildPersonalDataWorkbook(data: PersonalData) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook(); workbook.creator = "NEW HYDRA";
  const studentMap = new Map(data.students.map((student) => [student.id, student]));
  const parentMap = new Map(data.parents.map((parent) => [parent.id, parent]));
  const schoolMap = new Map(data.schools.map((school) => [school.id, school.name]));
  const profileMap = new Map(data.profiles.map((profile) => [profile.id, profile]));
  const students = workbook.addWorksheet("Data Siswa");
  const parents = workbook.addWorksheet("Data Orang Tua");
  students.columns = ["Nama Siswa", "Nama Pengguna", "Kode Siswa", "Surel", "Nama Sekolah", "Kelas", "Jenis Kelamin", "Tanggal Lahir", "Berat Badan (kg)", "Tinggi Badan (cm)", "Anak ke", "Program"].map((header) => ({ header, width: 26 }));
  parents.columns = ["Nama Orang Tua", "Nama Pengguna", "Surel", "Jenis Kelamin", "Umur (tahun)", "Pendidikan Terakhir", "Pekerjaan", "Penghasilan (Rp/bulan)", "Anak Terhubung"].map((header) => ({ header, width: 28 }));
  for (const profile of data.profiles) {
    if (profile.role === "student") {
      const student = studentMap.get(profile.id);
      students.addRow([profile.full_name || "", profile.username, student?.student_code || "", profile.email || "", schoolMap.get(student?.school_id || "") || "", student?.class_level ?? "", genderLabel(student?.gender || null), student?.birth_date || "", student?.weight_kg ?? "", student?.height_cm ?? "", student?.child_order ?? "", student?.study_group === "control" ? "Kontrol" : student?.study_group === "intervention" ? "Intervensi" : "Belum diisi"]);
    } else if (profile.role === "parent") {
      const parent = parentMap.get(profile.id);
      const children = data.links.filter((link) => link.parent_id === profile.id).map((link) => `${profileMap.get(link.child_id)?.full_name || "Siswa"} (${studentMap.get(link.child_id)?.student_code || link.child_id})`).join("; ");
      parents.addRow([profile.full_name || "", profile.username, profile.email || "", genderLabel(parent?.gender || null), parent?.age_years ?? "", getParentEducationLabel(parent?.education_level || null), parent?.occupation || "", parent?.income_amount ?? "", children]);
    }
  }
  for (const sheet of [students, parents]) {
    styleHeader(sheet); sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    sheet.eachRow((row, index) => { if (index > 1) { row.height = 32; row.alignment = { wrapText: true, vertical: "middle" }; } });
    sheet.getColumn(2).numFmt = "@";
  }
  students.getColumn(3).numFmt = "@";
  parents.getColumn(8).numFmt = '#,##0'; parents.getColumn(9).width = 55;
  return workbook.xlsx.writeBuffer();
}

export async function downloadPersonalData() {
  const client = createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("Silakan masuk terlebih dahulu.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Anda tidak memiliki izin mengunduh data pribadi pengguna.");
  const [profiles, students, parents, schools, links] = await Promise.all([
    fetchAllRows<PersonalProfile>((from, to) => client.from("profiles").select("id, role, full_name, username, email").in("role", ["student", "parent"]).order("id").range(from, to)),
    fetchAllRows<StudentPersonal>((from, to) => client.from("student_profiles").select("id, student_code, gender, birth_date, weight_kg, height_cm, class_level, child_order, study_group, school_id").order("id").range(from, to)),
    fetchAllRows<ParentPersonal>((from, to) => client.from("parent_profiles").select("id, gender, age_years, education_level, occupation, income_amount").order("id").range(from, to)),
    fetchAllRows<{id: string; name: string}>((from, to) => client.from("schools").select("id, name").order("id").range(from, to)),
    fetchAllRows<{parent_id: string; child_id: string}>((from, to) => client.from("parent_children").select("parent_id, child_id").order("id").range(from, to)),
  ]);
  const buffer = await buildPersonalDataWorkbook({ profiles, students, parents, schools, links });
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "data-diri-siswa-dan-orang-tua-hydra.xlsx"; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
