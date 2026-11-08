"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { createClient } from "../../utils/api/client";
import { MAX_IMPORT_BYTES, type ImportStudent } from "../../utils/hydrationExcel";
import { buildEvaluationTemplate, parseEvaluationExcel, type Evaluation, type ImportEvaluation } from "../../utils/evaluationExcel";
import { userError } from "../../utils/indonesian";

async function loadEvaluations(): Promise<Evaluation[]> {
  const { data, error } = await createClient().from("surveys")
    .select("id, title, survey_type, survey_questions(id, question_text, options, order_number)")
    .eq("is_active", true).eq("target_role", "student").in("survey_type", ["pengetahuan", "sikap"])
    .order("survey_type").order("id");
  if (error) throw error;
  const evaluations = ((data || []) as unknown as (Omit<Evaluation, "questions"> & { survey_questions: Evaluation["questions"] })[])
    .map(({ survey_questions, ...survey }) => ({ ...survey, questions: survey_questions.sort((a, b) => a.order_number - b.order_number || a.id.localeCompare(b.id)) }));
  if (!evaluations.length || evaluations.some((survey) => !survey.questions.length || survey.questions.some((q) => !Array.isArray(q.options) || !q.options.length || q.options.some((option) => typeof option !== "string")))) {
    throw new Error("Evaluasi belum siap. Minta admin melengkapi soal dan pilihan jawaban.");
  }
  return evaluations;
}

export function EvaluationExcelImport({ students, selectedDate, disabled = false, onBusyChange, onImported }: {
  students: ImportStudent[]; selectedDate: string; disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onImported: (rows: ImportEvaluation[], added: number, skipped: number, updated: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportEvaluation[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [fileName, setFileName] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const reset = () => { setPreview([]); setErrors([]); setActionError(""); setFileName(""); if (fileRef.current) fileRef.current.value = ""; };
  const begin = () => {
    if (inFlight.current || disabled) return false;
    inFlight.current = true; setBusy(true); onBusyChange?.(true); return true;
  };
  const finish = () => { inFlight.current = false; setBusy(false); onBusyChange?.(false); };
  const download = async () => {
    if (!begin()) return;
    setActionError("");
    try {
      const buffer = await buildEvaluationTemplate(await loadEvaluations(), students, selectedDate);
      const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "template-evaluasi-hidrasi.xlsx"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setActionError(userError(error, "Template gagal diunduh. Periksa koneksi lalu coba lagi.")); }
    finally { finish(); }
  };
  const readFile = async (file: File) => {
    if (!begin()) return;
    setPreview([]); setErrors([]); setActionError(""); setFileName(file.name);
    let timeout: number | undefined;
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Gunakan file .xlsx dari template evaluasi Hydra.");
      if (file.size > MAX_IMPORT_BYTES) throw new Error("Ukuran file maksimal 2 MB.");
      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());
      const result = await Promise.race([
        Promise.all([file.arrayBuffer(), loadEvaluations()]).then(([buffer, evaluations]) => parseEvaluationExcel(buffer, evaluations, students, today)),
        new Promise<never>((_, reject) => { timeout = window.setTimeout(() => reject(new Error("Pembacaan file melewati batas waktu. Pilih ulang file lalu coba lagi.")), 30000); }),
      ]);
      setPreview(result.rows); setErrors(result.errors);
    } catch (error) { setErrors([userError(error, "File gagal dibaca.")]); }
    finally { window.clearTimeout(timeout); finish(); }
  };
  const importRows = async () => {
    if (overwrite && !window.confirm("Timpa jawaban yang sudah tersimpan untuk siswa, evaluasi, dan tanggal dalam file ini? Periksa seluruh pratinjau terlebih dahulu.")) return;
    if (!preview.length || errors.length || !begin()) return;
    setActionError("");
    try {
      const { data, error } = await createClient().rpc("submit_student_evaluations", { overwrite_existing: overwrite, entries: preview.map((row) => ({ student_id: row.student_id, survey_id: row.survey_id, response_date: row.response_date, answers: row.answers })) });
      if (error) throw error;
      onImported(preview, data.added, data.skipped, data.updated || 0); reset();
    } catch (error) {
      console.error("Evaluation import failed:", error);
      const message = userError(error, "Periksa koneksi dan akses siswa.");
      setActionError(`Impor belum dapat dikonfirmasi: ${message} Tidak ada penyimpanan sebagian. Unggah ulang aman; jawaban lama tidak akan ditimpa.`);
    } finally { finish(); }
  };
  return <Card className="border-indigo-200 bg-indigo-50/40">
    <CardContent className="space-y-4 p-5">
      <div className="flex items-center gap-2"><FileSpreadsheet size={22} className="shrink-0 text-indigo-700" /><h3 className="text-lg font-bold text-slate-800">Isi Pengetahuan & Sikap lewat Excel</h3></div>
      <p className="text-sm leading-6 text-slate-600">Unduh template soal terbaru. Isi satu baris lengkap per siswa dan tanggal catatan asupan, lalu unggah dan periksa jawaban sebelum impor. Pengisi mengikuti akun yang sedang masuk.</p>
      <Button type="button" variant="outline" className="w-full gap-2 bg-white" disabled={disabled || busy || !students.length} onClick={() => void download()}><Download size={18} /> Unduh Template Evaluasi Excel</Button>
      <div>
        <label htmlFor="evaluation-excel-file" className="mb-2 block text-sm font-semibold text-slate-700">Unggah evaluasi Excel (.xlsx)</label>
        <input id="evaluation-excel-file" ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={disabled || busy || !students.length}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }}
          className="sr-only" />
        <label htmlFor="evaluation-excel-file" aria-disabled={disabled || busy || !students.length} className="inline-block cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-indigo-800">Pilih Berkas Evaluasi</label><span className="ml-2 break-all text-xs text-slate-500">{fileName || "Belum ada berkas dipilih"}</span>
        <p className="mt-2 text-xs text-slate-500">Maksimal 500 evaluasi / 2 MB. Jawaban lama dilewati, kecuali Anda mengaktifkan pilihan timpa.</p>
        <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-indigo-800"><input type="checkbox" checked={overwrite} disabled={busy || disabled} onChange={(event) => setOverwrite(event.target.checked)} className="mt-1" />Timpa jawaban lama pada siswa, tanggal, dan evaluasi yang sama (untuk koreksi)</label>
      </div>
      {busy && <p role="status" className="text-sm font-semibold text-indigo-700">Memproses Excel, mohon tunggu...</p>}
      {actionError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
      {!!errors.length && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><p className="font-bold">Periksa file sebelum impor.</p><ul className="max-h-48 list-disc space-y-1 overflow-auto pl-4">{errors.slice(0, 50).map((error, i) => <li key={i}>{error}</li>)}</ul><p>Belum ada evaluasi dari file ini yang disimpan.{errors.length > 50 ? ` Dan ${errors.length - 50} kesalahan lainnya.` : ""}</p></div>}
      {!!preview.length && <div className="space-y-3">
        <h4 className="font-bold text-slate-800">Pratinjau: {preview.length} evaluasi · {new Set(preview.map((row) => row.student_id)).size} siswa</h4>
        <p className="break-all text-xs text-slate-500">{fileName}</p>
        <div tabIndex={0} aria-label="Pratinjau evaluasi Excel" className="max-h-80 space-y-2 overflow-auto">
          {preview.slice(0, 20).map((row) => <details key={`${row.sheet}-${row.rowNumber}`} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-slate-800">{row.studentName} ({row.studentCode}) · {row.response_date} · {row.title} · {Object.keys(row.answers).length} jawaban</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-600">{Object.entries(row.answers).map(([id, answer]) => <li key={id}>{answer.question_text}<p className="font-bold text-indigo-700">{answer.answer}</p></li>)}</ol>
          </details>)}
        </div>
        {preview.length > 20 && <p className="text-xs text-slate-500">Menampilkan 20 dari {preview.length} evaluasi. Semua baris valid akan diproses.</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || disabled} onClick={reset} className="gap-1"><X size={16} /> Batal</Button><Button type="button" className="flex-1 gap-2" disabled={busy || disabled || !!errors.length} onClick={() => void importRows()}><Upload size={18} /> Impor {preview.length} Evaluasi</Button></div>
      </div>}
    </CardContent>
  </Card>;
}
