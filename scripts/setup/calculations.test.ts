import { describe, expect, it } from 'vitest';
import {
  analyzeCron,
  enumerateCronDay,
  eventsPerDay,
  fallDownBorder,
  fireRate,
  mapSummary,
  monsterRateAbove1M,
  monsterRateBelow1M,
  ratePerTurn,
} from './calculations';

describe('cron calculations', () => {
  it('counts Croner executions in a local calendar day', () => {
    const five = analyzeCron('0 */5 * * * *', 'Asia/Tokyo', '2026-01-01', 370);
    expect(five.fixed).toBe(true);
    expect(five.turnsPerDay).toBe(288);
    expect(analyzeCron('0 0 * * * *', 'Asia/Tokyo', '2026-01-01', 370).turnsPerDay).toBe(24);
    const day = enumerateCronDay('0 */7 * * * *', 'Asia/Tokyo', '2026-01-01');
    expect(day.epochs.length).toBeGreaterThan(0);
    expect(new Set(day.epochs).size).toBe(day.epochs.length);
  }, 60_000);
  it('detects variable daily schedules', () =>
    expect(analyzeCron('0 0 0 * * 1', 'Asia/Tokyo', '2026-01-01', 14).fixed).toBe(false));
  it('rejects invalid cron and timezone', () => {
    expect(() => analyzeCron('not cron', 'Asia/Tokyo')).toThrow();
    expect(() => analyzeCron('0 0 * * * *', 'Invalid/Zone')).toThrow();
  });
});

describe('game calculations', () => {
  it('round-trips daily rates', () =>
    expect(eventsPerDay(ratePerTurn(1.44, 144), 144)).toBeCloseTo(1.44));
  it('validates map and subsidence', () => {
    expect(mapSummary(8).hexes).toBe(64);
    expect(() => mapSummary(7)).toThrow();
    expect(fallDownBorder(12, 62.5)).toEqual({ border: 9000, firstAffectedArea: 9100 });
    expect(fallDownBorder(17, 62.2837370242)).toEqual({ border: 18000, firstAffectedArea: 18100 });
  });
  it('keeps monster and fire formulas', () => {
    expect(monsterRateBelow1M(0.03, 500_000)).toBe(0.015);
    expect(monsterRateAbove1M(0.01, 2_000_000, 5000, 0.25)).toBe(0.625);
    expect(fireRate(1, 10_000, 200_000_000)).toBe(0.005);
  });
});
