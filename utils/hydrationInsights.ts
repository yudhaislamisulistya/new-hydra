export type DrinkCategory = "healthy" | "moderate" | "poor";
export type HydrationPeriodKey = "pagi" | "siang" | "sore" | "malam";

export type HydrationLogLike = {
  amount_ml: number;
  drink_type: string | null;
  logged_at: string;
};

const HEALTHY_TYPES = new Set([
  "Air minum utama",
  "Air putih/air matang",
  "Air mineral",
]);

const MODERATE_TYPES = new Set([
  "Susu cair murni",
  "Susu dan produk susu cair",
  "Jus buah tanpa gula",
  "Minuman isotonik/sport drink",
]);

export function getDrinkCategory(drinkType: string | null): DrinkCategory {
  if (!drinkType || HEALTHY_TYPES.has(drinkType)) {
    return "healthy";
  }

  if (MODERATE_TYPES.has(drinkType)) {
    return "moderate";
  }

  return "poor";
}

export function getDrinkBadge(drinkType: string | null) {
  const category = getDrinkCategory(drinkType);

  if (category === "healthy") {
    return {
      category,
      label: "Sehat",
      badgeClassName: "bg-emerald-100 text-emerald-700 border border-emerald-200",
      dotClassName: "bg-emerald-500",
    };
  }

  if (category === "moderate") {
    return {
      category,
      label: "Cukup baik",
      badgeClassName: "bg-amber-100 text-amber-700 border border-amber-200",
      dotClassName: "bg-amber-500",
    };
  }

  return {
    category,
    label: "Kurang baik",
    badgeClassName: "bg-rose-100 text-rose-700 border border-rose-200",
    dotClassName: "bg-rose-500",
  };
}

export function getHydrationPeriod(dateInput: Date | string): HydrationPeriodKey {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const hour = date.getHours();

  if (hour < 11) return "pagi";
  if (hour < 15) return "siang";
  if (hour < 18) return "sore";
  return "malam";
}

export function getHydrationPeriodMeta(period: HydrationPeriodKey) {
  if (period === "pagi") {
    return {
      key: period,
      label: "Pagi",
      range: "00.00 - 10.59",
      accentClassName: "bg-amber-100 text-amber-700 border-amber-200",
    };
  }

  if (period === "siang") {
    return {
      key: period,
      label: "Siang",
      range: "11.00 - 14.59",
      accentClassName: "bg-sky-100 text-sky-700 border-sky-200",
    };
  }

  if (period === "sore") {
    return {
      key: period,
      label: "Sore",
      range: "15.00 - 17.59",
      accentClassName: "bg-orange-100 text-orange-700 border-orange-200",
    };
  }

  return {
    key: period,
    label: "Malam",
    range: "18.00 - 23.59",
    accentClassName: "bg-indigo-100 text-indigo-700 border-indigo-200",
  };
}

export function buildHydrationPeriodSummaries(logs: HydrationLogLike[]) {
  const periods: HydrationPeriodKey[] = ["pagi", "siang", "sore", "malam"];
  const summaries = periods.map((period) => ({
    ...getHydrationPeriodMeta(period),
    totalMl: 0,
    count: 0,
  }));

  logs.forEach((log) => {
    const period = getHydrationPeriod(log.logged_at);
    const target = summaries.find((summary) => summary.key === period);
    if (!target) return;

    target.totalMl += log.amount_ml;
    target.count += 1;
  });

  return summaries;
}

export function getAdequacyStatus(totalIntake: number, targetIntake: number) {
  const isAdequate = targetIntake > 0 && totalIntake >= targetIntake;

  return {
    isAdequate,
    label: isAdequate ? "Adekuat" : "Tidak Adekuat",
    shortLabel: isAdequate ? "Target tercapai" : "Belum tercapai",
    className: isAdequate
      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
      : "bg-rose-100 text-rose-700 border border-rose-200",
  };
}

export function buildHydrationCorrections(logs: HydrationLogLike[], targetIntake: number) {
  const totalIntake = logs.reduce((total, log) => total + log.amount_ml, 0);
  const healthyCount = logs.filter((log) => getDrinkCategory(log.drink_type) === "healthy").length;
  const poorCount = logs.filter((log) => getDrinkCategory(log.drink_type) === "poor").length;
  const summaries = buildHydrationPeriodSummaries(logs);

  const notes: string[] = [];

  if (targetIntake > 0 && totalIntake < targetIntake) {
    notes.push(`Total minum baru ${totalIntake} ml dari target ${targetIntake} ml, jadi perlu dorongan tambahan.`);
  }

  if (poorCount > healthyCount) {
    notes.push("Pilihan minuman manis masih lebih dominan daripada air putih, jadi perlu koreksi jenis minuman.");
  }

  if (summaries[0] && summaries[0].totalMl === 0) {
    notes.push("Belum ada asupan pagi, sebaiknya mulai hidrasi lebih awal setelah bangun.");
  }

  if (summaries[3] && summaries[3].totalMl > totalIntake * 0.5 && totalIntake > 0) {
    notes.push("Asupan malam terlalu dominan, jadi distribusi minum sebaiknya lebih merata sejak pagi dan siang.");
  }

  if (notes.length === 0) {
    notes.push("Distribusi dan pilihan minuman sudah cukup baik. Pertahankan pola hidrasi yang konsisten.");
  }

  return notes;
}
