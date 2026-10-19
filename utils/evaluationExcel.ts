import { cellText, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseDate, styleHeader, type ImportStudent } from "./hydrationExcel";

export type EvaluationQuestion = { id: string; question_text: string; options: string[]; order_number: number };
export type Evaluation = { id: string; title: string; survey_type: string; questions: EvaluationQuestion[] };
export type ImportEvaluation = {
  sheet: string; rowNumber: number; student_id: string; studentName: string; studentCode: string;
  survey_id: string; title: string; response_date: string;
  answers: Record<string, { question_text: string; answer: string }>;
};
const normalize = (text: string) => text.trim().toLocaleLowerCase("id-ID");
const sheets = (evaluations: Evaluation[]) => evaluations.map((evaluation, index) => ({
  evaluation, name: `${evaluation.survey_type === "sikap" ? "Sikap" : "Pengetahuan"} ${index + 1}`,
}));
const questionRows = (evaluations: Evaluation[]) => sheets(evaluations).flatMap(({ evaluation, name }) => evaluation.questions.map((question, index) => [
  name, evaluation.id, `Q${index + 1}`, question.id, question.question_text, question.options.map((option, i) => `${i + 1}. ${option}`).join("\n"),
]));

export async function buildEvaluationTemplate(evaluations: Evaluation[], students: ImportStudent[], date: string) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NEW HYDRA";
  const guide = workbook.addWorksheet("Panduan");
  guide.columns = [{ header: "PENGISIAN CEPAT EVALUASI HIDRASI — NEW HYDRA", width: 115 }];
  styleHeader(guide);
  [
    "1. Isi lembar Pengetahuan dan/atau Sikap mulai baris 2. Satu baris = satu siswa, satu tanggal, satu evaluasi lengkap.",
    "2. Gunakan Kode Siswa dari lembar Siswa. Tanggal mengikuti tanggal catatan asupan (contoh " + date + "). Tanggal mendatang ditolak.",
    "3. Baca soal dan pilihan pada lembar Pertanyaan atau catatan di judul Q1, Q2, dst. Isi nomor pilihan (1, 2, 3, 4) atau teks jawaban persis.",
    "4. Nomor pilihan mengikuti urutan pada template, BUKAN nilai benar/salah. Jangan menebak atau mengubah jawaban siswa.",
    "5. Semua soal pada baris yang diisi wajib dijawab. Lembar evaluasi yang tidak diisi boleh dibiarkan kosong.",
    "6. Jangan mengubah judul kolom atau lembar Pertanyaan. Unduh ulang template jika admin mengubah soal atau pilihan jawaban.",
    "7. Simpan sebagai .xlsx, maksimal 2 MB / 500 evaluasi lengkap per file. Jangan gunakan rumus atau tautan.",
    "8. Periksa pratinjau sebelum konfirmasi. Jika ada kesalahan, tidak ada data dari file yang disimpan.",
    "9. Evaluasi yang sudah diisi pada siswa, tanggal, dan evaluasi yang sama akan dilewati; impor tidak menimpa jawaban lama.",
    "10. Pengisi tercatat sebagai akun yang melakukan impor. Hanya siswa yang dapat diakses oleh akun tersebut yang diterima.",
  ].forEach((instruction) => { const row = guide.addRow([instruction]); row.height = 36; row.alignment = { wrapText: true, vertical: "middle" }; });
  const studentSheet = workbook.addWorksheet("Siswa");
  studentSheet.columns = [{ header: "Kode Siswa", width: 40 }, { header: "Nama Siswa", width: 45 }];
  students.forEach((student) => studentSheet.addRow([student.student_code || student.id, student.name]));
  studentSheet.getColumn(1).numFmt = "@";
  styleHeader(studentSheet);
  workbook.definedNames.add(`Siswa!$A$2:$A$${Math.max(students.length + 1, 2)}`, "KodeSiswa");
  const reference = workbook.addWorksheet("Pertanyaan");
  reference.columns = ["Lembar", "ID Evaluasi", "Kode Soal", "ID Soal", "Pertanyaan", "Pilihan Jawaban (nomor)"].map((header, index) => ({ header, width: [24, 39, 12, 39, 70, 90][index] }));
  reference.addRows(questionRows(evaluations));
  reference.getColumn(5).alignment = { wrapText: true, vertical: "top" };
  reference.getColumn(6).alignment = { wrapText: true, vertical: "top" };
  reference.eachRow((row, index) => { if (index > 1) row.height = 150; });
  styleHeader(reference);
  for (const { evaluation, name } of sheets(evaluations)) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = ["Kode Siswa", "Tanggal", ...evaluation.questions.map((_, i) => `Q${i + 1}`)].map((header, index) => ({ header, width: index === 0 ? 40 : index === 1 ? 18 : 15 }));
    styleHeader(sheet);
    sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
    evaluation.questions.forEach((question, index) => {
      sheet.getCell(1, index + 3).note = `${question.question_text}\n${question.options.map((option, i) => `${i + 1}. ${option}`).join("\n")}`;
    });
    for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row++) {
      sheet.getRow(row).height = 24;
      sheet.getRow(row).font = { color: { argb: "FF1D4ED8" } };
      if (row % 2 === 0) sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9FF" } };
      sheet.getCell(row, 1).numFmt = "@";
      sheet.getCell(row, 1).dataValidation = { type: "list", formulae: ["KodeSiswa"], allowBlank: true, showErrorMessage: true, error: "Pilih kode dari lembar Siswa." };
      sheet.getCell(row, 2).numFmt = "yyyy-mm-dd";
      evaluation.questions.forEach((question, index) => {
        sheet.getCell(row, index + 3).dataValidation = { type: "list", allowBlank: true, formulae: [`"${question.options.map((_, i) => i + 1).join(",")}"`], showErrorMessage: true, error: "Gunakan nomor pilihan sesuai lembar Pertanyaan." };
      });
    }
  }
  return workbook.xlsx.writeBuffer();
}

export async function parseEvaluationExcel(buffer: ArrayBuffer, evaluations: Evaluation[], students: ImportStudent[], today: string) {
  if (buffer.byteLength > MAX_IMPORT_BYTES) throw new Error("Ukuran file maksimal 2 MB.");
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { throw new Error("File tidak dapat dibaca. Gunakan template evaluasi Hydra berformat .xlsx."); }
  const expected = questionRows(evaluations);
  const reference = workbook.getWorksheet("Pertanyaan");
  if (!reference || reference.actualRowCount !== expected.length + 1 || expected.some((row, index) => row.some((value, column) => cellText(reference.getCell(index + 2, column + 1).value) !== value.trim()))) {
    throw new Error("Template tidak sesuai soal terbaru. Unduh ulang template; jangan mengubah lembar Pertanyaan.");
  }
  const studentMap = new Map(students.map((student) => [normalize(student.student_code || student.id), student]));
  const rows: ImportEvaluation[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let count = 0;
  for (const { evaluation, name } of sheets(evaluations)) {
    const sheet = workbook.getWorksheet(name);
    const headers = ["Kode Siswa", "Tanggal", ...evaluation.questions.map((_, index) => `Q${index + 1}`)];
    if (!sheet || headers.some((value, index) => cellText(sheet.getCell(1, index + 1).value) !== value)) throw new Error(`Lembar ${name} atau judul kolom tidak sesuai template.`);
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || !row.actualCellCount) return;
      if ((row.values as unknown[]).every((value) => value === null || value === undefined || (typeof value === "string" && !value.trim()))) return;
      if (count++ >= MAX_IMPORT_ROWS) { if (!errors.includes("Maksimal 500 evaluasi per file.")) errors.push("Maksimal 500 evaluasi per file."); return; }
      try {
        row.eachCell((cell, column) => { if (column > headers.length && cell.value !== null) throw new Error("Terdapat data di luar kolom template."); });
        const student = studentMap.get(normalize(cellText(row.getCell(1).value)));
        if (!student) throw new Error("Kode Siswa kosong, tidak dikenal, atau tidak dapat diakses.");
        const date = parseDate(row.getCell(2).value, today);
        const answers: ImportEvaluation["answers"] = {};
        evaluation.questions.forEach((question, index) => {
          const raw = cellText(row.getCell(index + 3).value);
          const answer = /^\d+$/.test(raw) ? question.options[Number(raw) - 1] : question.options.find((option) => normalize(option) === normalize(raw));
          if (!answer) throw new Error(`Q${index + 1} wajib diisi sesuai nomor atau teks pilihan jawaban.`);
          answers[question.id] = { question_text: question.question_text, answer };
        });
        const key = JSON.stringify([student.id, evaluation.id, date]);
        if (seen.has(key)) throw new Error("Siswa, tanggal, dan evaluasi yang sama muncul lebih dari sekali.");
        seen.add(key);
        rows.push({ sheet: name, rowNumber, student_id: student.id, studentName: student.name, studentCode: student.student_code || student.id, survey_id: evaluation.id, title: evaluation.title, response_date: date, answers });
      } catch (error) { errors.push(`${name}, baris ${rowNumber}: ${error instanceof Error ? error.message : "Data tidak valid."}`); }
    });
  }
  if (!rows.length && !errors.length) throw new Error("Template masih kosong. Isi satu baris lengkap pada lembar Pengetahuan atau Sikap mulai baris 2.");
  return { rows, errors };
}
