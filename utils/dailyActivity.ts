import { createClient } from "./api/client";
import { fetchAllRows } from "./dataAccess";
import type { ActivityLevel } from "./hydrationCalc";

export type DailyActivity = { student_id: string; activity_date: string; activity_level: ActivityLevel; is_estimated: boolean };
export type ActivityMap = Record<string, DailyActivity>;
export function activityFor(map: ActivityMap, studentId: string, date: string): ActivityLevel {
  return map[`${studentId}:${date}`]?.activity_level || "sedang";
}
export async function loadDailyActivities(studentIds: string[] | null, from: string, to = from): Promise<ActivityMap> {
  if (studentIds?.length === 0) return {};
  const rows = await fetchAllRows<DailyActivity>((start, end) => {
    let query = createClient().from("student_daily_activity").select("student_id, activity_date, activity_level, is_estimated")
      .gte("activity_date", from).lte("activity_date", to).order("student_id").order("activity_date").range(start, end);
    if (studentIds) query = query.in("student_id", studentIds);
    return query;
  });
  return Object.fromEntries(rows.map((row) => [`${row.student_id}:${row.activity_date}`, row]));
}
