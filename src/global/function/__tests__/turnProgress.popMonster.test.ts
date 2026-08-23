import type { islandInfo, islandInfoTurnProgress } from '@/db/kysely';
import * as mapMonster from '@/global/define/mapCategory/mapMonster';
import META_DATA from '@/global/define/metadata';
import { mapArrayConverter } from '@/global/function/island';
import * as utility from '@/global/function/utility';
import { buildIndexMap, islandDataStore } from '@/global/store/turnProgress';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  calculateMonsterSpawnRate,
  popMonsterExecute,
  sanitizeIslandInfoForPersistence,
} from '../turnProgress';

vi.mock('@/global/define/metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/global/define/metadata')>();
  return {
    default: {
      ...actual.default,
      MAP_SIZE: 12,
      MONSTER_SPAWN_RATE: { BELOW_1M: 0.03 },
      MONSTER_RATE: 0.006944,
      MONSTER_POPULATION_MULTIPLIER_PER_EXTRA_1M: 0.25,
    },
  };
});

vi.mock('@/db/kysely', () => ({
  isSqlite: true,
  parseJsonIslandDataTurnProgress: vi.fn(),
}));

type CreateIslandArgs = {
  population: number;
  area: number;
  monster: number;
  artificialMonster?: number;
  peopleCoords?: Array<{ x: number; y: number }>;
};

const createIsland = ({
  population,
  area,
  monster,
  artificialMonster = 0,
  peopleCoords = [{ x: 0, y: 0 }],
}: CreateIslandArgs): islandInfoTurnProgress => {
  const islandInfo: islandInfo[] = Array.from(
    { length: META_DATA.MAP_SIZE * META_DATA.MAP_SIZE },
    (_, i) => ({
      x: i % META_DATA.MAP_SIZE,
      y: Math.floor(i / META_DATA.MAP_SIZE),
      type: 'sea',
      landValue: 0,
    })
  ) as unknown as islandInfo[];

  for (const { x, y } of peopleCoords) {
    islandInfo[mapArrayConverter(x, y)] = {
      x,
      y,
      type: 'people',
      landValue: 120,
    } as islandInfo;
  }

  return {
    uuid: 'test-uuid',
    island_name: 'Test Island',
    prize: '',
    money: 0,
    area,
    population,
    food: 0,
    farm: 0,
    factory: 0,
    mining: 0,
    missile: 0,
    artificialMonster,
    fallMonument: 0,
    monster,
    island_info: islandInfo,
  } as unknown as islandInfoTurnProgress;
};

const setIslandToStore = (island: islandInfoTurnProgress) => {
  islandDataStore.setState({ data: [island], indexMap: buildIndexMap([island]) });
};

const getNaturalMonsterTypes = (population: number) => {
  return Object.values(mapMonster)
    .filter(
      (
        monster
      ): monster is (typeof mapMonster)[keyof typeof mapMonster] & { minPopPopulation: number } =>
        typeof monster === 'object' &&
        monster !== null &&
        'type' in monster &&
        typeof monster.minPopPopulation === 'number' &&
        monster.minPopPopulation <= population
    )
    .map((monster) => monster.type);
};

describe('popMonsterExecute', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    islandDataStore.getState().reset();
  });

  test('人工怪獣がある場合は自然発生判定より先にメカいのらを出現させる', () => {
    const island = createIsland({
      population: 50_000,
      area: 50,
      monster: 0.03,
      artificialMonster: 1,
    });
    setIslandToStore(island);

    const probabilitySpy = vi.spyOn(utility, 'checkProbability').mockReturnValue(false);

    const logs = popMonsterExecute('test-uuid', 1);
    const updated = islandDataStore.getState().islandGet('test-uuid');

    expect(logs).toHaveLength(1);
    expect(updated?.island_info[mapArrayConverter(0, 0)].type).toBe('meka_inora');
    expect(logs?.[0].log).toContain('[b]都市[/b]が踏み荒らされました');
    expect(logs?.[0].log).not.toContain('[b]怪獣メカいのら[/b]が踏み荒らされました');
    expect(probabilitySpy).not.toHaveBeenCalled();
  });

  test('人口が閾値未満の場合は自然怪獣を出現させない', () => {
    const island = createIsland({
      population: 99_999,
      area: 50,
      monster: 100,
    });
    setIslandToStore(island);

    const probabilitySpy = vi.spyOn(utility, 'checkProbability').mockReturnValue(true);

    const logs = popMonsterExecute('test-uuid', 1);
    const updated = islandDataStore.getState().islandGet('test-uuid');

    expect(logs).toBeUndefined();
    expect(updated?.island_info[mapArrayConverter(0, 0)].type).toBe('people');
    expect(probabilitySpy).not.toHaveBeenCalled();
  });

  test('人口25万人帯では minPopPopulation を満たす怪獣候補から選ばれる', () => {
    const island = createIsland({
      population: 250_000,
      area: 100,
      monster: 100,
    });
    setIslandToStore(island);

    const expectedMonsterTypes = getNaturalMonsterTypes(island.population);

    vi.spyOn(utility, 'checkProbability').mockReturnValue(true);
    vi.spyOn(utility, 'randomIntInRange').mockImplementation((min, max) => {
      if (min === 0 && max === expectedMonsterTypes.length - 1) return max;
      return min;
    });

    popMonsterExecute('test-uuid', 1);
    const updated = islandDataStore.getState().islandGet('test-uuid');

    expect(expectedMonsterTypes).toHaveLength(5);
    expect(updated?.island_info[mapArrayConverter(0, 0)].type).toBeDefined();
    expect(expectedMonsterTypes).toContain(updated?.island_info[mapArrayConverter(0, 0)].type);
    expect(expectedMonsterTypes).not.toContain('king_inora');
    expect(expectedMonsterTypes).not.toContain('kujira');
  });

  test('人口40万人帯では minPopPopulation を満たす全怪獣候補から選ばれる', () => {
    const island = createIsland({
      population: 400_000,
      area: 100,
      monster: 100,
    });
    setIslandToStore(island);

    const expectedMonsterTypes = getNaturalMonsterTypes(island.population);

    vi.spyOn(utility, 'checkProbability').mockReturnValue(true);
    vi.spyOn(utility, 'randomIntInRange').mockImplementation((min, max) => {
      if (min === 0 && max === expectedMonsterTypes.length - 1) return max;
      return min;
    });

    popMonsterExecute('test-uuid', 1);
    const updated = islandDataStore.getState().islandGet('test-uuid');

    expect(expectedMonsterTypes).toHaveLength(7);
    expect(updated?.island_info[mapArrayConverter(0, 0)].type).toBeDefined();
    expect(expectedMonsterTypes).toContain(updated?.island_info[mapArrayConverter(0, 0)].type);
    expect(expectedMonsterTypes).toContain('king_inora');
    expect(expectedMonsterTypes).toContain('kujira');
  });

  test.each([
    [100_000, 0.003],
    [500_000, 0.015],
    [999_999, 0.03 * (999_999 / 1_000_000)],
  ])('100万人未満では人口%s人の出現率を%s%%/turnとして算出する', (population, expected) => {
    expect(calculateMonsterSpawnRate(population, 5000)).toBeCloseTo(expected);
  });

  test.each([
    [1000, 0.06944],
    [2500, 0.1736],
    [5000, 0.3472],
  ])('100万人では面積%s万坪に比例して出現率が%s%%になる', (area, expected) => {
    expect(calculateMonsterSpawnRate(1_000_000, area)).toBeCloseTo(expected);
  });

  test.each([
    [1_000_000, 0.3472],
    [2_000_000, 0.434],
    [3_000_000, 0.5208],
    [5_000_000, 0.6944],
  ])('5000万坪では人口%s人の補正後出現率が%s%%になる', (population, expected) => {
    expect(calculateMonsterSpawnRate(population, 5000)).toBeCloseTo(expected);
  });

  test('100万人未満では既に怪獣がいる場合に自然出現判定をしない', () => {
    const island = createIsland({ population: 999_999, area: 5000, monster: 0.03 });
    island.island_info[mapArrayConverter(1, 1)] = {
      x: 1,
      y: 1,
      type: 'sanjira',
      landValue: 2,
    } as islandInfo;
    setIslandToStore(island);
    const probabilitySpy = vi.spyOn(utility, 'checkProbability').mockReturnValue(true);
    expect(popMonsterExecute('test-uuid', 1)).toBeUndefined();
    expect(probabilitySpy).not.toHaveBeenCalled();
  });

  test('100万人以上では既存怪獣がいても1匹だけ自然出現する', () => {
    const island = createIsland({
      population: 1_000_000,
      area: 5000,
      monster: 0.03,
      peopleCoords: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ],
    });
    island.island_info[mapArrayConverter(1, 1)] = {
      x: 1,
      y: 1,
      type: 'sanjira',
      landValue: 2,
    } as islandInfo;
    setIslandToStore(island);
    const probabilitySpy = vi.spyOn(utility, 'checkProbability').mockReturnValue(true);
    const logs = popMonsterExecute('test-uuid', 1);
    expect(logs).toHaveLength(1);
    expect(probabilitySpy).toHaveBeenCalledWith(0.3472);
  });
});

describe('sanitizeIslandInfoForPersistence', () => {
  test('x,y,type,landValue 以外のキーを除去する', () => {
    const source = [
      {
        x: 1,
        y: 2,
        type: 'meka_inora',
        landValue: 2,
        monsterDistance: 99,
        tempFlag: true,
      } as unknown as islandInfo,
    ];

    const sanitized = sanitizeIslandInfoForPersistence(source);

    expect(sanitized).toEqual([{ x: 1, y: 2, type: 'meka_inora', landValue: 2 }]);
    expect(sanitized[0]).not.toHaveProperty('monsterDistance');
    expect(sanitized[0]).not.toHaveProperty('tempFlag');
  });
});
