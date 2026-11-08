/* eslint-disable @typescript-eslint/no-require-imports -- Run production TypeScript helpers using the existing compiler. */
const assert = require("node:assert/strict"), fs = require("node:fs"), ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { buildHydrationRange, buildDailyHydrationSummaries, dailyHydrationCsv, escapeReportHtml } = require("../utils/hydrationRange.ts");
const { getAdequacyStatus } = require("../utils/hydrationInsights.ts");
const today = "2026-11-08";
for (const timezone of ["UTC", "Asia/Jakarta", "America/New_York"]) {
  process.env.TZ = timezone;
  for (const [type, count, first] of [["7days", 7, "2026-11-02"], ["14days", 14, "2026-10-26"], ["1month", 30, "2026-10-10"]]) {
    const range = buildHydrationRange(type, "2025-01-01", "", "", today);
    assert.equal(range.dates.length, count); assert.equal(range.dates[0], first); assert.equal(range.dates.at(-1), today);
    assert.equal(range.endDate.getTime() + 1 - range.startDate.getTime(), count * 86400000);
    assert.equal(new Set(range.dates).size, count);
  }
  assert.deepEqual(buildHydrationRange("daily", "2026-11-07", "", "", today).dates, ["2026-11-07"]);
  assert.deepEqual(buildHydrationRange("custom", today, "2024-02-28", "2024-03-01", today).dates, ["2024-02-28", "2024-02-29", "2024-03-01"]);
  assert.deepEqual(buildHydrationRange("custom", today, "2025-12-31", "2026-01-02", today).dates, ["2025-12-31", "2026-01-01", "2026-01-02"]);
  assert.equal(buildHydrationRange("custom", today, "2026-03-07", "2026-03-09", today).dates.length, 3);
  assert.equal(buildHydrationRange("custom", today, "2026-08-11", today, today).dates.length, 90);
  for (const [start, end, pattern] of [["2026-08-10", today, /90 hari/], [today, "2026-11-07", /melewati/], ["", today, /Lengkapi/], ["2026-02-30", today, /valid/], [today, "2026-11-09", /valid/]]) {
    assert.throws(() => buildHydrationRange("custom", today, start, end, today), pattern);
  }
  assert.throws(() => buildHydrationRange("daily", "2026-02-30", "", "", today), /valid/);
  const dates = buildHydrationRange("custom", today, "2026-11-06", today, today).dates;
  const student = { id: "student-a", weight_kg: 25, gender: "P" };
  const activities = {
    "student-a:2026-11-06": { activity_level: "rendah", is_estimated: false },
    "student-a:2026-11-07": { activity_level: "tinggi", is_estimated: false },
  };
  const logs = [
    { id: "low", amount_ml: 4000, drink_type: "Air putih", logged_at: "2026-11-06T08:00:00+07:00" },
    { id: "high", amount_ml: 250, drink_type: "Air putih", logged_at: "2026-11-06T17:00:00Z" },
    { id: "outside", amount_ml: 9999, drink_type: "Air putih", logged_at: "2026-11-05T08:00:00+07:00" },
  ];
  const rows = buildDailyHydrationSummaries(logs, student, activities, dates);
  assert.deepEqual(rows.map(row => row.volume), [4000, 250, 0]);
  assert.deepEqual(rows.map(row => row.requiredMl), [1600, 2350, 1975]);
  assert.deepEqual(rows.map(row => row.status.label), ["Baik", "Tidak Baik", "Belum ada catatan"]);
  assert.deepEqual(rows.map(row => row.isEstimated), [false, false, true]);
  assert.equal(rows[1].logs[0].id, "high"); assert.equal(logs.length, 3);
  // An adequate combined total must never turn the second day's inadequate result into "Baik".
  assert.equal(getAdequacyStatus(rows[0].volume + rows[1].volume, rows[0].requiredMl + rows[1].requiredMl).isAdequate, true);
  assert.equal(rows[1].status.isAdequate, false);
  const varyingTargets = buildDailyHydrationSummaries([
    { ...logs[0], amount_ml: 1600 }, { ...logs[1], amount_ml: 2200 },
  ], student, activities, dates.slice(0, 2));
  assert.deepEqual(varyingTargets.map(row => row.status.isAdequate), [true, false]);
  // A range-average target of 1975 would incorrectly reverse both of these daily results.
  assert.deepEqual(varyingTargets.map(row => row.volume >= 1975), [false, true]);
  const csv = dailyHydrationCsv(rows);
  assert.equal(csv.split("\n").length, 4);
  assert.match(csv, /"2026-11-07","tinggi","Tersimpan","250","2350","1","Tidak Baik"/);
  assert.match(csv, /"2026-11-08","sedang","Perkiraan","0","1975","0","Belum ada catatan"/);
  assert.equal(escapeReportHtml('<script>"A" & \'B\'</script>'), "&lt;script&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/script&gt;");
}
console.log("PASS: daily/7/14/30/custom ranges, WIB/DST, inclusive boundaries, date validation, per-day activity and status, missing days, CSV and safe PDF text");
