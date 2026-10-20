export const LAUNCH_DATE = '2026-10-20';
export const DAILY_SIZE = 7;

const DAY_MS = 86_400_000;

export function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function dailyNumber(isoDate: string): number {
  const days = (Date.parse(isoDate + 'T00:00:00Z') - Date.parse(LAUNCH_DATE + 'T00:00:00Z')) / DAY_MS;
  return Math.round(days) + 1;
}

export function msUntilNextUtcMidnight(now: Date): number {
  const t = now.getTime();
  return (Math.floor(t / DAY_MS) + 1) * DAY_MS - t;
}

export function formatDailyLabel(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00Z')
    .toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
    .replace(',', '');
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 3600))}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`;
}
