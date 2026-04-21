export type ActivityLevel = "rendah" | "sedang" | "tinggi";
export type Gender = "L" | "P";
export type LooseGender = string | null | undefined;

export interface HydrationParams {
  weight_kg: number;
  gender: Gender;
  activity_level: ActivityLevel;
}

export function normalizeGender(gender: LooseGender): Gender {
  return gender === "P" || gender === "female" ? "P" : "L";
}

export function calculateBasicFluidNeeds(weight_kg: number): number {
  let fbb = 0;
  if (weight_kg <= 10) {
    fbb = 100 * weight_kg;
  } else if (weight_kg <= 20) {
    fbb = 1000 + 50 * (weight_kg - 10);
  } else {
    fbb = 1500 + 20 * (weight_kg - 20);
  }

  return Math.round(fbb);
}

export function getGenderFactor(gender: LooseGender): number {
  return normalizeGender(gender) === "P" ? 1.0 : 1.05;
}

export function getActivityFactor(activity_level: ActivityLevel): number {
  if (activity_level === "rendah") return 0;
  if (activity_level === "sedang") return 375;
  return 750;
}

export function calculateIntakeFromStoredBaseNeed(params: {
  base_need_ml: number;
  gender: LooseGender;
  activity_level: ActivityLevel;
  customActivityFactor?: Partial<Record<ActivityLevel, number>>;
}): number {
  const { base_need_ml, gender, activity_level, customActivityFactor } = params;
  const fg = getGenderFactor(gender);
  const defaultFa = getActivityFactor(activity_level);
  const fa = customActivityFactor?.[activity_level] ?? defaultFa;
  return Math.round(base_need_ml * fg + fa);
}

export function calculateRequiredIntake(params: HydrationParams): number {
  const { weight_kg, gender, activity_level } = params;

  // 1. Calculate FBB (Basic Fluid Needs based on weight)
  const fbb = calculateBasicFluidNeeds(weight_kg);

  // 2. Get Fg (Gender Factor)
  // Female (Perempuan) = 1.00, Male (Laki-laki) = 1.05
  const fg = getGenderFactor(gender);

  // 3. Get Fa (Activity Factor)
  const fa = getActivityFactor(activity_level);

  // 4. Total Required Fluid (TFI)
  const tfi = fbb * fg + fa;

  return Math.round(tfi);
}

export function formatLocalDateKey(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
