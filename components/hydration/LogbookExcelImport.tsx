"use client";
import { userError } from "../../utils/indonesian";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { createClient } from "../../utils/api/client";
import { Pagination } from "../ui/Pagination";
import {
  buildImportPayload, buildLogbookTemplate, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseLogbookExcel,
  type ImportLog, type ImportStudent,
} from "../../utils/hydrationExcel";

export function LogbookExcelImport({ students, selectedDate, disabled, onBusyChange, onImported }: {
  students: ImportStudent[];
  selectedDate: string;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onImported: (rows: ImportLog[], added: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportLog[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [fileName, setFileName] = useState("");
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewPage, setPreviewPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  const reset = () => {
    setPreview([]);
    setErrors([]);
    setActionError("");
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };
  const begin = () => {
    if (inFlight.current || disabled) return false;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    return true;
  };
  const finish = () => {
    inFlight.current = false;
    setBusy(false);
    onBusyChange(false);
  };
  const download = async () => {
    if (!begin()) return;
    setActionError("");
    try {
      const buffer = await buildLogbookTemplate(students, selectedDate);
      const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "template-logbook-hydra.xlsx";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Error creating hydration logbook template:", error);
      setActionError("Template gagal diunduh. Periksa koneksi lalu coba lagi.");
    } finally {
      finish();
    }
  };
  const readFile = async (file: File) => {
    if (!begin()) return;
    setPreview([]);
    setErrors([]);
    setActionError("");
    setFileName(file.name);
    let timeout: number | undefined;
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Gunakan file .xlsx, bukan .xls, .csv, atau .xlsm.");
      if (file.size > MAX_IMPORT_BYTES) throw new Error("Ukuran file maksimal 2 MB.");
      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());
      const result = await Promise.race([
        file.arrayBuffer().then((buffer) => parseLogbookExcel(buffer, students, today)),
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(() => reject(new Error("Pembacaan file melewati batas waktu. Pilih ulang file atau simpan ulang sebagai .xlsx lalu coba lagi.")), 30000);
        }),
      ]);
      setPreview(result.rows);
      setErrors(result.errors);
    } catch (error) {
      setErrors([userError(error, "File gagal dibaca. Gunakan template Hydra.")]);
    } finally {
      window.clearTimeout(timeout);
      finish();
    }
  };
  const importRows = async () => {
    if (!preview.length || errors.length || !begin()) return;
    setActionError("");
    try {
      const payload = await buildImportPayload(preview);
      // A single database statement keeps the whole upload atomic; matching IDs
      // are skipped so retrying a successful upload does not duplicate intake.
      const { data, error } = await createClient().from("hydration_logs")
        .upsert(payload, { onConflict: "id", ignoreDuplicates: true }).select("id");
      if (error) throw error;
      onImported(preview, data?.length || 0);
      reset();
    } catch (error) {
      console.error("Error importing hydration logbook:", error);
      setActionError("Status penyimpanan belum dapat dikonfirmasi. Periksa koneksi dan akses siswa, lalu coba impor lagi. Catatan yang sama tidak akan digandakan.");
    } finally {
      finish();
    }
  };

  const studentCount = new Set(preview.map((row) => row.student_id)).size;
  const filteredPreview = preview.filter((row) => `${row.studentName} ${row.studentCode} ${row.date} ${row.period} ${row.drink_type} ${row.amount_ml}`.toLocaleLowerCase("id-ID").includes(previewSearch.trim().toLocaleLowerCase("id-ID")));
  const safePreviewPage = Math.min(previewPage, Math.max(1, Math.ceil(filteredPreview.length / 20)));
  return (
    <Card className="border-cyan-200 bg-cyan-50/40">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={22} className="shrink-0 text-cyan-700" />
          <h3 className="text-lg font-bold text-slate-800">Isi Logbook lewat Excel</h3>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Unduh template, isi catatan pada sheet Logbook, lalu unggah dan periksa sebelum impor.
          Satu file boleh memuat beberapa siswa yang dapat Anda akses. Pengisi mengikuti akun yang sedang masuk.
        </p>
        <Button type="button" variant="outline" className="w-full gap-2 bg-white" disabled={disabled || busy || !students.length} onClick={() => void download()}>
          <Download size={18} /> Unduh Template Excel
        </Button>
        <div>
          <label htmlFor="logbook-excel-file" className="mb-2 block text-sm font-semibold text-slate-700">Unggah logbook Excel (.xlsx)</label>
          <input ref={fileRef} id="logbook-excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={disabled || busy || !students.length}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }}
            className="sr-only" />
          <label htmlFor="logbook-excel-file" aria-disabled={disabled || busy || !students.length} className="inline-block cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-cyan-800">Pilih Berkas Excel</label><span className="ml-2 break-all text-xs text-slate-500">{fileName || "Belum ada berkas dipilih"}</span>
          <p className="mt-2 text-xs text-slate-500">Maksimal {MAX_IMPORT_ROWS} catatan / 2 MB. Waktu minum menggunakan WIB. Impor menambah catatan; koreksi memakai Sunting/Hapus.</p>
        </div>
        {busy && <p role="status" className="text-sm font-semibold text-cyan-700">Memproses Excel, mohon tunggu...</p>}
        {actionError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
        {errors.length > 0 && (
          <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-bold">Periksa file sebelum impor.</p>
            <ul className="max-h-48 list-disc space-y-1 overflow-auto pl-4">
              {errors.slice(0, 50).map((error, index) => <li key={index}>{error}</li>)}
            </ul>
            {errors.length > 50 && <p>Dan {errors.length - 50} kesalahan lainnya.</p>}
            <p>Belum ada catatan dari file ini yang disimpan.</p>
          </div>
        )}
        {preview.length > 0 && (
          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-slate-800">Pratinjau: {preview.length} catatan · {studentCount} siswa</h4>
              <p className="break-all text-xs text-slate-500">{fileName}</p>
              <p className="mt-1 text-xs text-slate-500">Total {preview.reduce((sum, row) => sum + row.amount_ml, 0)} ml. Baris impor yang sudah tersimpan akan diabaikan.</p>
            </div>
            <div tabIndex={0} aria-label="Pratinjau catatan Excel" className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white">
              <input aria-label="Cari pratinjau logbook" placeholder="Cari siswa, tanggal, atau minuman..." value={previewSearch} onChange={(event) => { setPreviewSearch(event.target.value); setPreviewPage(1); }} className="m-2 rounded-lg border p-2 text-sm" />
              <table className="w-full text-left text-xs">
                <thead className="bg-cyan-100 text-cyan-900"><tr>{["Baris", "Siswa", "Tanggal / Waktu", "Minuman", "ml"].map((title) => <th key={title} className="whitespace-nowrap p-3">{title}</th>)}</tr></thead>
                <tbody>{filteredPreview.slice((safePreviewPage - 1) * 20, safePreviewPage * 20).map((row) => <tr key={row.rowNumber} className="border-t border-slate-100">
                  <td className="p-3">{row.rowNumber}</td><td className="p-3"><span className="font-semibold">{row.studentName}</span><br />{row.studentCode}</td>
                  <td className="whitespace-nowrap p-3">{row.date}<br />{row.period}</td><td className="min-w-32 p-3">{row.drink_type}</td><td className="p-3 text-right font-semibold">{row.amount_ml}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <Pagination page={previewPage} total={filteredPreview.length} pageSize={20} onChange={setPreviewPage} />
            <p className="text-xs text-slate-500">Pencarian hanya memfilter pratinjau. Semua {preview.length} baris valid dalam file akan diproses saat impor.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || disabled} onClick={reset} className="gap-1"><X size={16} /> Batal</Button>
              <Button type="button" className="flex-1 gap-2" disabled={busy || disabled || errors.length > 0} onClick={() => void importRows()}><Upload size={18} /> Impor {preview.length} Catatan</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
