import { expect, test } from 'vitest';
import { LAUNCH_DATE, DAILY_SIZE, utcDateString, dailyNumber, msUntilNextUtcMidnight, formatDailyLabel, formatCountdown } from '../../src/core/daily';

test('constants', () => { expect(LAUNCH_DATE).toBe('2026-10-20'); expect(DAILY_SIZE).toBe(7); });
test('utcDateString uses UTC', () => expect(utcDateString(new Date('2026-10-20T23:30:00-05:00'))).toBe('2026-10-21'));
test('dailyNumber', () => { expect(dailyNumber('2026-10-20')).toBe(1); expect(dailyNumber('2026-10-21')).toBe(2); });
test('msUntilNextUtcMidnight', () => expect(msUntilNextUtcMidnight(new Date('2026-10-20T23:59:59.000Z'))).toBe(1000));
test('formatDailyLabel', () => expect(formatDailyLabel('2026-10-20')).toBe('Tue Oct 20'));
test('formatCountdown', () => { expect(formatCountdown(3_723_000)).toBe('01:02:03'); expect(formatCountdown(-5)).toBe('00:00:00'); });
