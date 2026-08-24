import { Cron } from 'croner';

export const MILLION_TSUBO = 100;
export const NATURAL_POPULATION_PER_HEX = 10_000;
export const MAX_POPULATION_PER_HEX = 20_000;

export type DaySchedule = {
  date: string;
  epochs: number[];
};

const zonedParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
};

export const assertTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
  } catch {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }
};

const zonedMidnight = (year: number, month: number, day: number, timeZone: string) => {
  let value = Date.UTC(year, month - 1, day);
  for (let i = 0; i < 4; i += 1) {
    const p = zonedParts(new Date(value), timeZone);
    const represented = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second)
    );
    value += Date.UTC(year, month - 1, day) - represented;
  }
  return new Date(value);
};

const enumerateWithCron = (cron: Cron, timeZone: string, date: string): DaySchedule => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  const [, y, m, d] = match;
  const start = zonedMidnight(Number(y), Number(m), Number(d), timeZone);
  const nextNominal = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1));
  const next = zonedParts(nextNominal, 'UTC');
  const end = zonedMidnight(Number(next.year), Number(next.month), Number(next.day), timeZone);
  const epochs: number[] = [];
  let cursor = new Date(start.getTime() - 1);
  while (true) {
    const run = cron.nextRun(cursor);
    if (!run || run >= end) break;
    if (run >= start) epochs.push(run.getTime());
    cursor = run;
    if (epochs.length > 100_000) throw new Error('Cron fires too frequently');
  }
  if (new Set(epochs).size !== epochs.length) throw new Error('Cron returned duplicate epochs');
  return { date, epochs };
};

export const enumerateCronDay = (
  expression: string,
  timeZone: string,
  date: string
): DaySchedule => {
  assertTimeZone(timeZone);
  let cron: Cron;
  try {
    cron = new Cron(expression, { timezone: timeZone });
  } catch {
    throw new Error(`Invalid cron: ${expression}`);
  }
  return enumerateWithCron(cron, timeZone, date);
};

export const analyzeCron = (
  expression: string,
  timeZone: string,
  startDate = '2026-01-01',
  days = 400
) => {
  assertTimeZone(timeZone);
  let cron: Cron;
  try {
    cron = new Cron(expression, { timezone: timeZone });
  } catch {
    throw new Error(`Invalid cron: ${expression}`);
  }
  const start = new Date(`${startDate}T00:00:00Z`);
  const schedules = Array.from({ length: days }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
    return { date, epochs: [] as number[] };
  });
  const byDate = new Map(schedules.map((schedule) => [schedule.date, schedule]));
  const boundaries = Array.from({ length: days + 1 }, (_, index) => {
    const [year, month, day] = new Date(start.getTime() + index * 86_400_000)
      .toISOString()
      .slice(0, 10)
      .split('-')
      .map(Number);
    return zonedMidnight(year, month, day, timeZone);
  });
  const rangeStart = boundaries[0];
  const rangeEnd = boundaries[boundaries.length - 1];
  let cursor = new Date(rangeStart.getTime() - 1);
  let dayIndex = 0;
  for (let runs = 0; ; runs += 1) {
    const run = cron.nextRun(cursor);
    if (!run || run >= rangeEnd) break;
    while (dayIndex + 1 < boundaries.length && run >= boundaries[dayIndex + 1]) dayIndex += 1;
    byDate.get(schedules[dayIndex].date)?.epochs.push(run.getTime());
    cursor = run;
    if (runs > 1_000_000) throw new Error('Cron fires too frequently');
  }
  for (const schedule of schedules)
    if (new Set(schedule.epochs).size !== schedule.epochs.length)
      throw new Error('Cron returned duplicate epochs');
  const counts = [...new Set(schedules.map(({ epochs }) => epochs.length))];
  const fixed = counts.length === 1 && counts[0] > 0;
  return { fixed, turnsPerDay: fixed ? counts[0] : null, counts, sample: schedules[0] };
};

export const eventsPerDay = (ratePercent: number, turnsPerDay: number) =>
  (turnsPerDay * ratePercent) / 100;
export const ratePerTurn = (dailyEvents: number, turnsPerDay: number) => {
  const rate = (dailyEvents / turnsPerDay) * 100;
  if (!Number.isFinite(rate) || rate < 0 || rate > 100)
    throw new Error('Rate must be between 0 and 100% per turn');
  return rate;
};
export const mapSummary = (size: number) => {
  if (!Number.isInteger(size) || size < 8)
    throw new Error('Map size must be an integer of at least 8');
  const hexes = size ** 2;
  return {
    size,
    hexes,
    maxArea: hexes * MILLION_TSUBO,
    naturalPopulation: hexes * NATURAL_POPULATION_PER_HEX,
    maxPopulation: hexes * MAX_POPULATION_PER_HEX,
  };
};
export const fallDownBorder = (size: number, ratio: number) => {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100)
    throw new Error('Ratio must be between 0 and 100');
  const border =
    Math.floor((mapSummary(size).maxArea * ratio) / 100 / MILLION_TSUBO + 1e-9) * MILLION_TSUBO;
  return { border, firstAffectedArea: border + MILLION_TSUBO };
};
export const monsterRateBelow1M = (base: number, population: number) =>
  (base * population) / 1_000_000;
export const monsterRateAbove1M = (
  base: number,
  population: number,
  area: number,
  multiplier: number
) => ((base * area) / 100) * (1 + (multiplier * (population - 1_000_000)) / 1_000_000);
export const fireRate = (base: number, population: number, divisor: number) => {
  if (!(divisor > 0)) throw new Error('Fire population divisor must be positive');
  return (base * population * 100) / divisor;
};
export const serializeNumber = (value: number) => Number(value.toFixed(10)).toString();
