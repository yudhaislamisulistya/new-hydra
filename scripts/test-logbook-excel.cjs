/* eslint-disable @typescript-eslint/no-require-imports -- The CommonJS test runner registers a TypeScript require hook. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const ExcelJS = require("exceljs");

// Run the application's TypeScript helpers with the project's existing compiler.
require.extensions[".ts"] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(compiled.outputText, filename);
};
const { buildLogbookTemplate, parseLogbookExcel, buildImportPayload, LOGBOOK_HEADERS } = require("../utils/hydrationExcel.ts");
const students = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Siswa A", student_code: "001AB" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Siswa B", student_code: "002AB" },
];
const today = "2026-10-13";
const toArrayBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

async function check() {
  const template = await buildLogbookTemplate(students, today);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(template);
  assert.deepEqual(book.worksheets.map((sheet) => sheet.name), ["Logbook", "Panduan", "Siswa", "Pilihan"]);
  assert.equal(book.getWorksheet("Siswa").getCell("A2").value, "001AB");
  assert.equal(book.getWorksheet("Logbook").getCell("C2").dataValidation.type, "list");
  const drinkChoices = book.getWorksheet("Pilihan").getColumn(2).values;
  assert.equal(drinkChoices.filter(value => value === "Teh Manis Kemasan").length, 1);
  assert(drinkChoices.includes("Teh manis"));
  await assert.rejects(parseLogbookExcel(toArrayBuffer(template), students, today), /masih kosong/);

  const sheet = book.getWorksheet("Logbook");
  const parse = async () => parseLogbookExcel(toArrayBuffer(await book.xlsx.writeBuffer()), students, today);
  sheet.getRow(2).values = ["001AB", "2026-10-12", "Pagi", "Air putih / Air matang", 250];
  sheet.getRow(3).values = ["002AB", new Date("2026-10-13T00:00:00Z"), "sore", "Air kelapa", 125];
  const valid = await parse();
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.rows.length, 2);
  assert.equal(valid.rows[0].logged_at, "2026-10-12T01:00:00.000Z");
  assert.equal(valid.rows[1].logged_at, "2026-10-13T09:00:00.000Z");
  sheet.getCell("D2").value = " teh manis kemasan ";
  const packagedTea = await parse();
  assert.equal(packagedTea.errors.length, 0);
  assert.equal(packagedTea.rows[0].drink_type, "Teh Manis Kemasan");
  assert.equal((await buildImportPayload(packagedTea.rows))[0].drink_type, "Teh Manis Kemasan");
  sheet.getCell("D2").value = "Air putih / Air matang";
  const payload = await buildImportPayload(valid.rows);
  const retry = await buildImportPayload([...valid.rows].reverse());
  assert.equal(payload[0].id, retry[1].id);
  assert.notEqual(payload[0].id, payload[1].id);
  assert.deepEqual(Object.keys(payload[0]), ["id", "student_id", "amount_ml", "drink_type", "logged_at"]);
  const oldHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([
    "hydra-logbook-v1", valid.rows[0].student_id, valid.rows[0].logged_at, valid.rows[0].drink_type, valid.rows[0].amount_ml,
  ])))).slice(0, 16);
  oldHash[6] = (oldHash[6] & 0x0f) | 0x80; oldHash[8] = (oldHash[8] & 0x3f) | 0x80;
  assert.notEqual(payload[0].id.replaceAll("-", ""), Array.from(oldHash, byte => byte.toString(16).padStart(2, "0")).join(""));

  const limited = await parseLogbookExcel(toArrayBuffer(await book.xlsx.writeBuffer()), [students[0]], today);
  assert.equal(limited.errors.length, 1);
  assert.match(limited.errors[0], /Baris 3.*tidak dapat diakses/);
  for (const [column, value, expected] of [
    [1, "INVALID", /Kode Siswa/], [2, "2026-10-14", /Tanggal/], [2, "2026-02-30", /Tanggal/],
    [3, "tengah hari", /Waktu/], [4, "Tidak dikenal", /Jenis Minuman/],
    [5, 0, /Volume/], [5, -5, /Volume/], [5, 12.5, /Volume/], [5, "250 ml", /Volume/],
    [5, { formula: "100+150", result: 250 }, /bukan rumus/],
  ]) {
    const previous = sheet.getCell(2, column).value;
    sheet.getCell(2, column).value = value;
    assert.match((await parse()).errors[0], expected);
    sheet.getCell(2, column).value = previous;
  }
  sheet.getRow(4).values = sheet.getRow(2).values;
  assert.match((await parse()).errors[0], /identik/);
  sheet.getRow(4).values = [];
  sheet.getCell("B2").value = "12/10/2026";
  assert.equal((await parse()).rows[0].date, "2026-10-12");
  sheet.getCell("F2").value = "Unexpected extra column";
  assert.match((await parse()).errors[0], /lima kolom/);
  sheet.getCell("F2").value = null;
  sheet.getCell("A1").value = "Renamed header";
  await assert.rejects(parse(), /Judul kolom/);
  sheet.getRow(1).values = LOGBOOK_HEADERS;
  for (let row = 4; row <= 502; row++) sheet.getRow(row).values = ["001AB", "2026-10-12", "Pagi", "Air kelapa", row];
  assert((await parse()).errors.includes("Maksimal 500 catatan per file."));
  await assert.rejects(parseLogbookExcel(new ArrayBuffer(2 * 1024 * 1024 + 1), students, today), /maksimal 2 MB/);
  await assert.rejects(parseLogbookExcel(new TextEncoder().encode("not an xlsx").buffer, students, today), /File tidak dapat dibaca/);
  console.log("PASS: XLSX template, dates/WIB, permissions, malformed data, duplicates, safe retries and file limits");
}
check().catch((error) => { console.error(error); process.exitCode = 1; });
