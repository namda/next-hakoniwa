import type { EventRate, islandInfo, islandInfoTurnProgress } from '@/db/kysely';
import { mapArrayConverter } from '@/global/function/island';
import * as utility from '@/global/function/utility';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { fireDisaster } from '../mapType';
import { people } from '../mapCategory/mapOther';

vi.mock('@/global/define/metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/global/define/metadata')>();
  return {
    default: {
      ...actual.default,
      MAP_SIZE: 12,
      FIRE: {
        POPULATION_DIVISOR: 200_000_000,
        SCALES: [
          { name: '小規模火災', weight: 60, damageRate: 20 },
          { name: '大規模火災', weight: 30, damageRate: 50 },
          { name: '壊滅的火災', weight: 10, damageRate: 100 },
        ],
      },
    },
  };
});

const createIsland = (population: number): islandInfoTurnProgress => {
  const islandInfo = Array.from({ length: 144 }, (_, i) => ({
    x: i % 12,
    y: Math.floor(i / 12),
    type: 'sea',
    landValue: 0,
  })) as islandInfo[];
  islandInfo[mapArrayConverter(5, 5)] = {
    x: 5,
    y: 5,
    type: 'people',
    landValue: population / 100,
  } as islandInfo;
  return {
    uuid: 'island',
    island_name: '島',
    island_info: islandInfo,
  } as unknown as islandInfoTurnProgress;
};

const eventRate = { fire: 1 } as EventRate;

describe('fireDisaster', () => {
  afterEach(() => vi.restoreAllMocks());

  test('都市HEX自身の人口を基準に火災発生率を算出する', () => {
    const island = createIsland(10_000);
    const probabilitySpy = vi.spyOn(utility, 'checkProbability').mockReturnValue(false);
    fireDisaster(5, 5, 1, island, eventRate);
    expect(probabilitySpy).toHaveBeenCalledWith(0.005);
  });

  test('小規模火災では人口を20%減らし都市を維持する', () => {
    const island = createIsland(12_000);
    vi.spyOn(utility, 'checkProbability').mockReturnValue(true);
    vi.spyOn(utility, 'randomIntInRange').mockReturnValue(1);
    const log = fireDisaster(5, 5, 1, island, eventRate);
    const cell = island.island_info[mapArrayConverter(5, 5)];
    expect(cell.type).toBe('people');
    expect(cell.landValue).toBe(96);
    expect(log?.log).toContain('12,000人から9,600人に減少');
    expect(log?.log).toContain('小規模火災');
  });

  test('壊滅的火災では人口を0にして荒地化する', () => {
    const island = createIsland(20_000);
    vi.spyOn(utility, 'checkProbability').mockReturnValue(true);
    vi.spyOn(utility, 'randomIntInRange').mockReturnValue(100);
    const log = fireDisaster(5, 5, 1, island, eventRate);
    expect(island.island_info[mapArrayConverter(5, 5)].type).toBe('wasteland');
    expect(log?.log).toContain('壊滅的火災');
    expect(log?.log).toContain('荒地になりました');
  });

  test.each([
    { population: 12_802, roll: 100, expected: 0 },
    { population: 500, roll: 1, expected: 400 },
    { population: 500, roll: 61, expected: 250 },
    { population: 250, roll: 61, expected: 125 },
    { population: 125, roll: 61, expected: 0 },
    { population: 198, roll: 61, expected: 0 },
    { population: 200, roll: 61, expected: 100 },
    { population: 100, roll: 1, expected: 0 },
  ])('火災後の人口境界: $population 人、roll=$roll', ({ population, roll, expected }) => {
    const island = createIsland(population);
    vi.spyOn(utility, 'checkProbability').mockReturnValue(true);
    vi.spyOn(utility, 'randomIntInRange').mockReturnValue(roll);
    fireDisaster(5, 5, 1, island, eventRate);
    const cell = island.island_info[mapArrayConverter(5, 5)];
    if (expected === 0) {
      expect(cell.type).toBe('wasteland');
    } else {
      expect(cell.type).toBe('people');
      expect(cell.landValue).toBe(expected / 100);
      expect(Math.round(cell.landValue * 100)).toBe(expected);
    }
    const saved = JSON.parse(JSON.stringify(island.island_info)) as islandInfo[];
    expect(saved.every((entry) => entry.type !== 'people' || entry.landValue >= 1)).toBe(true);
  });

  test('JSON保存後の次ターンでも最低人口を下回る村を残さない', () => {
    const island = createIsland(200);
    vi.spyOn(utility, 'checkProbability').mockReturnValue(true);
    vi.spyOn(utility, 'randomIntInRange').mockReturnValue(61);
    fireDisaster(5, 5, 1, island, eventRate);
    const restored = JSON.parse(JSON.stringify(island)) as islandInfoTurnProgress;
    restored.food = 100;
    restored.propaganda = 0;
    restored.fire = 0;
    vi.spyOn(utility, 'checkProbability').mockReturnValue(false);
    vi.spyOn(utility, 'randomIntInRange').mockReturnValue(1);
    people.event?.({ x: 5, y: 5, turn: 2, fromUuid: 'island', island: restored });
    expect(restored.island_info.every((cell) => cell.type !== 'people' || cell.landValue >= 1)).toBe(true);
  });
});
