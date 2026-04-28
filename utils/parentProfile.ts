export const PARENT_EDUCATION_OPTIONS = [
  { value: "sd", label: "SD" },
  { value: "smp", label: "SMP" },
  { value: "sma", label: "SMA/SMK" },
  { value: "diploma", label: "Diploma" },
  { value: "sarjana", label: "Sarjana" },
  { value: "magister", label: "Magister" },
  { value: "doktor", label: "Doktor" },
] as const;

export const PARENT_GENDER_OPTIONS = [
  { value: "male", label: "Laki-laki" },
  { value: "female", label: "Perempuan" },
] as const;

export const BANYUMAS_UMK_2026 = 2474598.99;
export const BANYUMAS_UMK_2026_LABEL = "UMK Banyumas 2026";

export function getParentEducationLabel(value: string | null | undefined) {
  return PARENT_EDUCATION_OPTIONS.find((option) => option.value === value)?.label || "Belum diisi";
}

export function getParentGenderLabel(value: string | null | undefined) {
  return PARENT_GENDER_OPTIONS.find((option) => option.value === value)?.label || "Belum diisi";
}

export function getParentIncomeCategoryLabel(value: string | null | undefined) {
  if (value === "umr") return "UMR";
  if (value === "tidak_umr") return "Tidak UMR";
  return "Belum diisi";
}

export function formatCurrencyId(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Belum diisi";

  return `Rp${value.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function classifyParentIncome(amount: number | null | undefined) {
  if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
    return {
      category: "",
      label: "Belum diisi",
      helperText: `Masukkan nominal gaji untuk dibandingkan dengan ${BANYUMAS_UMK_2026_LABEL}.`,
      className: "bg-slate-100 text-slate-600 border border-slate-200",
    };
  }

  const isUmr = amount >= BANYUMAS_UMK_2026;

  return {
    category: isUmr ? "umr" : "tidak_umr",
    label: isUmr ? "UMR" : "Tidak UMR",
    helperText: isUmr
      ? `Gaji termasuk setara atau di atas ${BANYUMAS_UMK_2026_LABEL}.`
      : `Gaji masih di bawah ${BANYUMAS_UMK_2026_LABEL}.`,
    className: isUmr
      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
      : "bg-amber-100 text-amber-700 border border-amber-200",
  };
}
