import type { EventRate, islandInfo, islandInfoTurnProgress } from '@/db/kysely';
import { mapArrayConverter } from '@/global/function/island';
import * as utility from '@/global/function/utility';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { fireDisaster } from '../mapType';

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
});
