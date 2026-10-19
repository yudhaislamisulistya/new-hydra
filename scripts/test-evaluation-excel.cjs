/* eslint-disable @typescript-eslint/no-require-imports -- Run TypeScript helpers with the existing compiler. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const ExcelJS = require("exceljs");
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};
const { buildEvaluationTemplate, parseEvaluationExcel } = require("../utils/evaluationExcel.ts");
const { calculateStudentFluidTarget, calculateRequiredIntake } = require("../utils/hydrationCalc.ts");
const { getAdequacyStatus } = require("../utils/hydrationInsights.ts");
const students = [{ id: "11111111-1111-4111-8111-111111111111", student_code: "001", name: "Siswa A" }, { id: "22222222-2222-4222-8222-222222222222", student_code: "002", name: "Siswa B" }];
const evaluations = ["pengetahuan", "sikap"].map((survey_type, i) => ({
  id: `${i + 1}`, title: `Evaluasi ${survey_type}`, survey_type,
  questions: Array.from({ length: 15 }, (_, index) => ({ id: `q${i}-${index}`, question_text: `Soal ${index + 1}`, order_number: index, options: index % 2 ? ["Tidak Setuju", "Kurang Setuju", "Setuju", "Sangat Setuju"] : ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"] })),
}));
const asBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
async function check() {
  const today = "2026-10-19";
  const template = await buildEvaluationTemplate(evaluations, students, today);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(template);
  assert.deepEqual(book.worksheets.map((sheet) => sheet.name), ["Panduan", "Siswa", "Pertanyaan", "Pengetahuan 1", "Sikap 2"]);
  assert.equal(book.getWorksheet("Pertanyaan").actualRowCount, 31);
  assert.equal(book.getWorksheet("Pengetahuan 1").getCell("C2").dataValidation.type, "list");
  assert.match(JSON.stringify(book.getWorksheet("Pengetahuan 1").getCell("C1").note), /Soal 1/);
  const parse = async (catalog = evaluations, allowed = students) => parseEvaluationExcel(asBuffer(await book.xlsx.writeBuffer()), catalog, allowed, today);
  await assert.rejects(parse(), /masih kosong/);
  const knowledge = book.getWorksheet("Pengetahuan 1"), attitude = book.getWorksheet("Sikap 2");
  knowledge.getRow(2).values = ["001", "2026-10-18", ...Array(15).fill(4)];
  attitude.getRow(2).values = ["002", new Date("2026-10-19T00:00:00Z"), ...evaluations[1].questions.map((q) => q.options[2])];
  const valid = await parse(); assert.equal(valid.errors.length, 0); assert.equal(valid.rows.length, 2);
  assert.equal(valid.rows[0].response_date, "2026-10-18");
  assert.equal(valid.rows[0].answers["q0-0"].answer, "Pilihan D");
  assert.equal(valid.rows[1].answers["q1-1"].answer, "Setuju");
  assert.match((await parse(evaluations, [students[0]])).errors[0], /tidak dapat diakses/);
  for (const [column, value, pattern] of [
    [1, "999", /Kode Siswa/], [2, "2026-10-20", /Tanggal/], [2, "2026-02-30", /Tanggal/],
    [3, null, /Q1 wajib/], [3, 0, /Q1 wajib/], [3, 5, /Q1 wajib/], [3, 2.5, /Q1 wajib/], [3, "Tak dikenal", /Q1 wajib/],
    [3, { formula: "2+2", result: 4 }, /bukan rumus/], [3, { text: "4", hyperlink: "https://example.com" }, /bukan rumus/],
    [18, "data tambahan", /di luar kolom/],
  ]) {
    const previous = knowledge.getCell(2, column).value; knowledge.getCell(2, column).value = value;
    assert.match((await parse()).errors[0], pattern); knowledge.getCell(2, column).value = previous;
  }
  knowledge.getRow(3).values = knowledge.getRow(2).values; assert.match((await parse()).errors[0], /lebih dari sekali/); knowledge.getRow(3).values = [];
  knowledge.getCell("B2").value = "18/10/2026"; assert.equal((await parse()).rows[0].response_date, "2026-10-18");
  const stale = structuredClone(evaluations); stale[0].questions[0].options.reverse(); await assert.rejects(parse(stale), /soal terbaru/);
  knowledge.getCell("C1").value = "wrong"; await assert.rejects(parse(), /judul kolom/); knowledge.getCell("C1").value = "Q1";
  for (let row = 3; row <= 502; row++) knowledge.getRow(row).values = ["001", "2026-10-18", ...Array(15).fill(4)];
  assert((await parse()).errors.includes("Maksimal 500 evaluasi per file."));
  await assert.rejects(parseEvaluationExcel(new ArrayBuffer(2097153), evaluations, students, today), /maksimal 2 MB/);
  await assert.rejects(parseEvaluationExcel(new TextEncoder().encode("not Excel").buffer, evaluations, students, today), /tidak dapat dibaca/);
  for (const gender of ["P", "female", "L", "male"]) {
    for (const level of ["rendah", "sedang", "tinggi"]) {
      const target = calculateStudentFluidTarget({ weight_kg: 25, gender, daily_water_target_ml: 1600 }, level);
      assert.equal(target, calculateRequiredIntake({ weight_kg: 25, gender, activity_level: level }));
      assert.equal(getAdequacyStatus(target - 1, target).isAdequate, false);
      assert.equal(getAdequacyStatus(target, target).isAdequate, true);
    }
  }
  assert.equal(calculateStudentFluidTarget({ weight_kg: 25, gender: "P" }), 1975);
  assert.equal(calculateStudentFluidTarget({ weight_kg: 25, gender: "L" }), 2055);
  assert.equal(getAdequacyStatus(1700, calculateStudentFluidTarget({ weight_kg: 25, gender: "P" })).isAdequate, false);
  assert.equal(calculateStudentFluidTarget({ gender: "P", daily_water_target_ml: 1600 }), 1975);
  assert.equal(getAdequacyStatus(4000, 1975 * 7).isAdequate, false);
  console.log("PASS: evaluation XLSX roundtrip (2 x 15 questions), canonical answers, dates, scope, completeness, stale templates, duplicates, limits and total fluid requirement thresholds");
}
check().catch((error) => { console.error(error); process.exitCode = 1; });
