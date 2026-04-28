import { formatLocalDateKey } from "./hydrationCalc";

export const XP_PER_SURVEY = 100;
export const XP_PER_HYDRATION_LOG = 10;
export const BASE_DAILY_CHECKIN_XP = 20;
export const STREAK_BONUS_STEP_XP = 5;
export const MAX_STREAK_BONUS_DAYS = 7;

export type DailyCheckinLike = {
  checkin_date: string;
  xp_earned?: number | null;
};

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getTrailingStreak(dateKeys: Set<string>, endDate: Date) {
  let streak = 0;
  let cursor = new Date(endDate);

  while (dateKeys.has(formatLocalDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function getCheckinReward(streakAfterCheckin: number) {
  const normalizedStreak = Math.max(streakAfterCheckin, 1);
  const streakBonus = Math.min(normalizedStreak - 1, MAX_STREAK_BONUS_DAYS - 1) * STREAK_BONUS_STEP_XP;
  const totalXp = BASE_DAILY_CHECKIN_XP + streakBonus;

  return {
    streakAfterCheckin: normalizedStreak,
    baseXp: BASE_DAILY_CHECKIN_XP,
    streakBonusXp: streakBonus,
    totalXp,
  };
}

export function buildCheckinStats(checkins: DailyCheckinLike[], referenceDate = new Date()) {
  const uniqueDates = Array.from(new Set(checkins.map((item) => item.checkin_date))).sort();
  const dateSet = new Set(uniqueDates);
  const todayKey = formatLocalDateKey(referenceDate);
  const checkedInToday = dateSet.has(todayKey);
  const streakAnchor = checkedInToday ? referenceDate : addDays(referenceDate, -1);
  const currentStreak = getTrailingStreak(dateSet, streakAnchor);
  const nextStreak = checkedInToday ? currentStreak : currentStreak + 1;
  const nextReward = getCheckinReward(nextStreak);
  const todayReward = checkedInToday ? getCheckinReward(currentStreak) : null;
  const totalCheckinXp = checkins.reduce((sum, item) => sum + (item.xp_earned || 0), 0);

  return {
    checkedInToday,
    currentStreak,
    nextStreak,
    nextReward,
    todayReward,
    totalCheckins: uniqueDates.length,
    totalCheckinXp,
    recentDates: uniqueDates.slice(-7),
  };
}
