import type { VisitSummary } from "../types/content";
import { getDatabase } from "./database";

function count(value: string | number | bigint | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function recordAnonymousVisit(locals: App.Locals, landingPath: string): Promise<void> {
  const database = getDatabase(locals);
  if (!database) return;
  const safePath = landingPath.length <= 300 ? landingPath : landingPath.slice(0, 300);
  try {
    await database.query(`
      INSERT INTO visit_daily_counts (visit_date, landing_path, visits)
      VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date, $1, 1)
      ON CONFLICT (visit_date, landing_path)
      DO UPDATE SET visits = visit_daily_counts.visits + 1
    `, [safePath]);
  } catch (error) {
    console.error("Unable to record anonymous visit", error);
  }
}

export async function getAllTimeVisitCount(locals?: App.Locals): Promise<number> {
  const database = getDatabase(locals);
  if (!database) return 0;
  try {
    const result = await database.query<{ total: string }>("SELECT COALESCE(SUM(visits), 0)::text AS total FROM visit_daily_counts");
    return count(result.rows[0]?.total);
  } catch (error) {
    console.error("Unable to read visit total", error);
    return 0;
  }
}

export async function getVisitSummary(locals: App.Locals): Promise<VisitSummary> {
  const database = getDatabase(locals);
  if (!database) return { today: 0, sevenDays: 0, thirtyDays: 0, allTime: 0, landingPages: [], daily: [] };
  const todayExpression = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date";
  const [totalsResult, landingResult, dailyResult] = await Promise.all([
    database.query<{ today: string; seven_days: string; thirty_days: string; all_time: string }>(`
      SELECT
        COALESCE(SUM(visits) FILTER (WHERE visit_date = ${todayExpression}), 0)::text AS today,
        COALESCE(SUM(visits) FILTER (WHERE visit_date >= ${todayExpression} - 6), 0)::text AS seven_days,
        COALESCE(SUM(visits) FILTER (WHERE visit_date >= ${todayExpression} - 29), 0)::text AS thirty_days,
        COALESCE(SUM(visits), 0)::text AS all_time
      FROM visit_daily_counts
    `),
    database.query<{ landing_path: string; visits: string }>(`
      SELECT landing_path, SUM(visits)::text AS visits
      FROM visit_daily_counts
      WHERE visit_date >= ${todayExpression} - 29
      GROUP BY landing_path
      ORDER BY SUM(visits) DESC, landing_path
      LIMIT 20
    `),
    database.query<{ date: string; visits: string }>(`
      SELECT visit_date::text AS date, SUM(visits)::text AS visits
      FROM visit_daily_counts
      WHERE visit_date >= ${todayExpression} - 29
      GROUP BY visit_date
      ORDER BY visit_date
    `),
  ]);
  const totals = totalsResult.rows[0];
  return {
    today: count(totals?.today),
    sevenDays: count(totals?.seven_days),
    thirtyDays: count(totals?.thirty_days),
    allTime: count(totals?.all_time),
    landingPages: landingResult.rows.map((row) => ({ path: row.landing_path, visits: count(row.visits) })),
    daily: dailyResult.rows.map((row) => ({ date: row.date, visits: count(row.visits) })),
  };
}
