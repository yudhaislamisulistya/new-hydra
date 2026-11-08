"use client";

export function Pagination({ page, total, pageSize = 10, onChange }: { page: number; total: number; pageSize?: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  return <nav aria-label="Navigasi halaman data" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm text-slate-600">
    <span>{total ? (current - 1) * pageSize + 1 : 0}–{Math.min(current * pageSize, total)} dari {total} data</span>
    <div className="flex items-center gap-3">
      <button type="button" disabled={current <= 1} onClick={() => onChange(current - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Sebelumnya</button>
      <span>Halaman {current} dari {pages}</span>
      <button type="button" disabled={current >= pages} onClick={() => onChange(current + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Berikutnya</button>
    </div>
  </nav>;
}
