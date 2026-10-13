import type { CellValue, Worksheet } from "exceljs";
import { DRINK_TYPES, TRACKER_PERIOD_HOURS, TRACKER_PERIOD_OPTIONS } from "./hydrationLogbook";

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const LOGBOOK_HEADERS = ["Kode Siswa", "Tanggal", "Waktu", "Jenis Minuman", "Volume (ml)"];

export type ImportStudent = { id: string; name: string; student_code: string | null };
export type ImportLog = {
  rowNumber: number;
  student_id: string;
  studentName: string;
  studentCode: string;
  date: string;
  period: string;
  drink_type: string;
  amount_ml: number;
  logged_at: string;
};

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");

function styleHeader(sheet: Worksheet) {
  sheet.getRow(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E7490" } };
  sheet.getRow(1).height = 30;
  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
}

export async function buildLogbookTemplate(students: ImportStudent[], exampleDate: string) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NEW HYDRA";
  const logbook = workbook.addWorksheet("Logbook");
  logbook.columns = LOGBOOK_HEADERS.map((header, index) => ({ header, width: [40, 18, 16, 55, 18][index] }));
  styleHeader(logbook);
  logbook.autoFilter = "A1:E501";

  const guide = workbook.addWorksheet("Panduan");
  guide.columns = [{ width: 40 }, { width: 18 }, { width: 16 }, { width: 55 }, { width: 18 }];
  guide.mergeCells("A1:E1");
  guide.getCell("A1").value = "TEMPLATE LOGBOOK MINUM — NEW HYDRA";
  styleHeader(guide);
  const instructions = [
    "1. Isi sheet Logbook mulai baris 2. Satu baris adalah total satu jenis minuman pada satu waktu untuk satu siswa.",
    "2. Ambil Kode Siswa dari sheet Siswa atau dropdown. Satu file boleh berisi beberapa siswa yang dapat Anda akses.",
    "3. Tanggal: gunakan YYYY-MM-DD (contoh " + exampleDate + ") atau tanggal Excel. Tanggal mendatang tidak diperbolehkan.",
    "4. Waktu: Pagi (08.00 WIB), Siang (12.00 WIB), Sore (16.00 WIB), atau Malam (20.00 WIB).",
    "5. Pilih Jenis Minuman dari dropdown. Isi Volume (ml) dengan bilangan bulat lebih dari 0, tanpa satuan ml.",
    "6. Gabungkan jumlah minuman jika siswa, tanggal, waktu, dan jenisnya sama. Jangan gunakan rumus di sheet Logbook.",
    "7. Maksimal 500 catatan dan ukuran file 2 MB. Simpan sebagai .xlsx; unggah lalu periksa pratinjau sebelum impor.",
    "8. Impor menambah catatan. Baris impor yang sama akan diabaikan saat diunggah ulang, termasuk dari akun pengisi lain.",
    "9. Gunakan Sunting/Hapus di aplikasi untuk koreksi; mengubah volume di Excel kemudian mengimpor akan menambah catatan baru.",
    "10. Nama pengisi dan perannya mengikuti akun yang melakukan impor. Data contoh di bawah tidak ikut diimpor.",
  ];
  instructions.forEach((text, index) => {
    const row = index + 3;
    guide.mergeCells(`A${row}:E${row}`);
    guide.getCell(row, 1).value = text;
    guide.getRow(row).height = 32;
    guide.getCell(row, 1).alignment = { wrapText: true, vertical: "middle" };
  });
  guide.getRow(15).values = LOGBOOK_HEADERS;
  guide.getRow(15).font = { bold: true };
  guide.getRow(16).values = [students[0]?.student_code || students[0]?.id || "KODE_SISWA", exampleDate, "Pagi", DRINK_TYPES[0].value, 250];

  const studentSheet = workbook.addWorksheet("Siswa");
  studentSheet.columns = [{ header: "Kode Siswa", width: 40 }, { header: "Nama Siswa", width: 48 }];
  students.forEach((student) => studentSheet.addRow([student.student_code || student.id, student.name]));
  studentSheet.getColumn(1).numFmt = "@";
  styleHeader(studentSheet);
  const choices = workbook.addWorksheet("Pilihan");
  choices.columns = [{ header: "Waktu", width: 16 }, { header: "Jenis Minuman", width: 55 }];
  DRINK_TYPES.forEach((drink, index) => choices.addRow([TRACKER_PERIOD_OPTIONS[index]?.label || null, drink.value]));
  styleHeader(choices);
  workbook.definedNames.add(`Siswa!$A$2:$A$${Math.max(students.length + 1, 2)}`, "KodeSiswa");
  workbook.definedNames.add("Pilihan!$A$2:$A$5", "WaktuMinum");
  workbook.definedNames.add(`Pilihan!$B$2:$B$${DRINK_TYPES.length + 1}`, "JenisMinuman");
  for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row++) {
    logbook.getRow(row).height = 22;
    logbook.getRow(row).font = { name: "Calibri", size: 11, color: { argb: "FF1D4ED8" } };
    if (row % 2 === 0) logbook.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9FF" } };
    for (const [column, range] of [[1, "KodeSiswa"], [3, "WaktuMinum"], [4, "JenisMinuman"]] as const) {
      logbook.getCell(row, column).dataValidation = { type: "list", allowBlank: true, formulae: [range], showErrorMessage: true, errorTitle: "Pilihan tidak valid", error: "Gunakan pilihan dari dropdown." };
    }
    logbook.getCell(row, 1).numFmt = "@";
    logbook.getCell(row, 2).numFmt = "yyyy-mm-dd";
    logbook.getCell(row, 5).numFmt = "0";
    logbook.getCell(row, 5).dataValidation = { type: "whole", operator: "between", formulae: [1, 2147483647], allowBlank: true, showErrorMessage: true, error: "Volume harus berupa bilangan bulat lebih dari 0 ml." };
  }
  return workbook.xlsx.writeBuffer();
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  throw new Error("Gunakan nilai biasa, bukan rumus, tautan, atau tipe sel khusus.");
}

function parseDate(value: CellValue, today: string) {
  let text = value instanceof Date ? value.toISOString().slice(0, 10) : cellText(value);
  const localFormat = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (localFormat) text = `${localFormat[3]}-${localFormat[2]}-${localFormat[1]}`;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== text || text < "1900-01-01" || text > today) {
    throw new Error("Tanggal harus valid (YYYY-MM-DD atau DD/MM/YYYY), paling lambat hari ini.");
  }
  return text;
}

export async function parseLogbookExcel(buffer: ArrayBuffer, students: ImportStudent[], today: string) {
  if (buffer.byteLength > MAX_IMPORT_BYTES) throw new Error("Ukuran file maksimal 2 MB.");
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error("File tidak dapat dibaca. Gunakan file Excel .xlsx dari template Hydra.");
  }
  const sheet = workbook.getWorksheet("Logbook");
  if (!sheet) throw new Error("Sheet Logbook tidak ditemukan. Gunakan template yang diunduh dari aplikasi.");
  if (LOGBOOK_HEADERS.some((header, index) => normalize(cellText(sheet.getCell(1, index + 1).value)) !== normalize(header))) {
    throw new Error("Judul kolom tidak sesuai template. Jangan mengubah baris pertama sheet Logbook.");
  }
  const studentMap = new Map(students.map((student) => [normalize(student.student_code || student.id), student]));
  const rows: ImportLog[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || row.actualCellCount === 0) return;
    if (rows.length + errors.length >= MAX_IMPORT_ROWS) {
      if (!errors.includes("Maksimal 500 catatan per file.")) errors.push("Maksimal 500 catatan per file.");
      return;
    }
    try {
      const values = [1, 2, 3, 4, 5].map((column) => row.getCell(column).value);
      if (values.every((value) => value === null || value === undefined || (typeof value === "string" && !value.trim())) && row.actualCellCount <= 5) return;
      row.eachCell((cell, column) => { if (column > 5 && cell.value !== null) throw new Error("Terdapat data di luar lima kolom template."); });
      const code = cellText(values[0]);
      const student = studentMap.get(normalize(code));
      if (!student) throw new Error("Kode Siswa kosong, tidak dikenal, atau tidak dapat diakses oleh akun Anda.");
      const date = parseDate(values[1], today);
      const period = TRACKER_PERIOD_OPTIONS.find((option) => normalize(option.value) === normalize(cellText(values[2])))?.value;
      if (!period) throw new Error("Waktu harus Pagi, Siang, Sore, atau Malam.");
      const drink = DRINK_TYPES.find((option) => [option.value, option.label].some((text) => normalize(text) === normalize(cellText(values[3]))));
      if (!drink) throw new Error("Jenis Minuman harus sesuai pilihan pada template.");
      const rawVolume = cellText(values[4]);
      const volume = Number(rawVolume);
      if (!/^\d+$/.test(rawVolume) || !Number.isInteger(volume) || volume < 1 || volume > 2147483647) throw new Error("Volume harus berupa bilangan bulat lebih dari 0 ml, tanpa satuan.");
      const loggedAt = new Date(`${date}T${String(TRACKER_PERIOD_HOURS[period]).padStart(2, "0")}:00:00+07:00`).toISOString();
      const key = JSON.stringify([student.id, loggedAt, drink.value, volume]);
      if (seen.has(key)) throw new Error("Catatan identik muncul lebih dari sekali dalam file. Gabungkan volumenya bila perlu.");
      seen.add(key);
      rows.push({ rowNumber, student_id: student.id, studentName: student.name, studentCode: student.student_code || student.id, date, period, drink_type: drink.value, amount_ml: volume, logged_at: loggedAt });
    } catch (error) {
      errors.push(`Baris ${rowNumber}: ${error instanceof Error ? error.message : "Data tidak valid."}`);
    }
  });
  if (rows.length === 0 && errors.length === 0) throw new Error("Sheet Logbook masih kosong. Isi catatan mulai baris 2; contoh pada Panduan tidak ikut diimpor.");
  return { rows, errors };
}

export async function buildImportPayload(rows: ImportLog[]) {
  return Promise.all(rows.map(async (row) => {
    // Content-based UUIDs make retrying the same import safe without overwriting corrections.
    const content = JSON.stringify(["hydra-logbook-v1", row.student_id, row.logged_at, row.drink_type, row.amount_ml]);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))).slice(0, 16);
    hash[6] = (hash[6] & 0x0f) | 0x80;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return { id, student_id: row.student_id, amount_ml: row.amount_ml, drink_type: row.drink_type, logged_at: row.logged_at };
  }));
}
