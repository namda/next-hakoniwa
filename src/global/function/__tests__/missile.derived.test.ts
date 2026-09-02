import type { islandInfo, islandInfoTurnProgress } from '@/db/kysely';
import META_DATA from '@/global/define/metadata';
import {
  ldMissile,
  nuclearMissile,
  sppMissile,
  stMissile,
  upliftMissile,
} from '@/global/define/planCategory/planAtack';
import type { planType } from '@/global/define/planType';
import { getMapAround, mapArrayConverter } from '@/global/function/island';
import * as utility from '@/global/function/utility';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  executeMissile,
  MISSILE_CHARACTERISTICS,
  processRefugees,
  type MissileType,
} from '../missile';

vi.mock('@/global/define/metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/global/define/metadata')>();
  return { default: { ...actual.default, MAP_SIZE: 12 } };
});

const createIsland = (uuid: string, defaultType = 'sea'): islandInfoTurnProgress =>
  ({
    uuid,
    island_name: uuid,
    money: 100000,
    island_info: Array.from({ length: META_DATA.MAP_SIZE ** 2 }, (_, i) => ({
      x: i % META_DATA.MAP_SIZE,
      y: Math.floor(i / META_DATA.MAP_SIZE),
      type: defaultType,
      landValue: 0,
    })),
  }) as unknown as islandInfoTurnProgress;

const setCell = (
  island: islandInfoTurnProgress,
  x: number,
  y: number,
  type: string,
  landValue = 0
) => {
  island.island_info[mapArrayConverter(x, y)] = { x, y, type, landValue } as islandInfo;
};

const dummyPlan = (name: string): planType =>
  ({ name, cost: 0, immediate: false }) as unknown as planType;

const fire = (missileType: MissileType, toIsland: islandInfoTurnProgress, x = 5, y = 5) => {
  const fromIsland = createIsland('from', 'plains');
  setCell(fromIsland, 0, 0, 'missile');
  return executeMissile({
    turn: 2,
    fromIsland,
    toIsland,
    targetX: x,
    targetY: y,
    missileType,
    times: 1,
    planType: dummyPlan(missileType),
  });
};

describe('派生ミサイル', () => {
  afterEach(() => vi.restoreAllMocks());

  test('特性と計画価格がR.A.準拠で定義されている', () => {
    expect(MISSILE_CHARACTERISTICS.spp).toMatchObject({
      errorHex: 0,
      ignoresDefense: true,
    });
    expect(MISSILE_CHARACTERISTICS.st).toMatchObject({ errorHex: 2, stealth: true });
    expect(MISSILE_CHARACTERISTICS.uplift.errorHex).toBe(2);
    expect(MISSILE_CHARACTERISTICS.nuclear.errorHex).toBe(1);
    expect(sppMissile.cost).toBe(1000);
    expect(stMissile.cost).toBe(50);
    expect(stMissile.description).toContain('誤差2HEX');
    expect(ldMissile.cost).toBe(100);
    expect(upliftMissile.cost).toBe(600);
    expect(nuclearMissile.cost).toBe(12000);
  });

  test('SPPは指定座標へ着弾し、防衛施設の迎撃を無視する', () => {
    const island = createIsland('to');
    setCell(island, 5, 5, 'people', 100);
    setCell(island, 5, 6, 'defense_base');
    const result = fire('spp', island);
    expect(island.island_info[mapArrayConverter(5, 5)].type).toBe('ruins');
    expect(result.cityKills).toBe(1);
    expect(result.logs[0].log).not.toContain('防衛施設により爆破');
  });

  test.each([
    ['sea', 'shallows'],
    ['submarine_missile', 'shallows'],
    ['shallows', 'ruins'],
    ['plains', 'mountain'],
    ['kujira', 'mountain'],
  ])('地形隆起弾は%sを%sへ変える', (before, after) => {
    const island = createIsland('to');
    setCell(island, 5, 5, before);
    const exact = getMapAround(5, 5, 2).findIndex(({ x, y }) => x === 5 && y === 5);
    vi.spyOn(utility, 'randomIntInRange').mockReturnValue(exact);
    fire('uplift', island);
    expect(island.island_info[mapArrayConverter(5, 5)].type).toBe(after);
  });

  test('核ミサイルは着弾点から2HEXの陸地・山・怪獣を荒地化し、海系を残す', () => {
    const island = createIsland('to', 'plains');
    setCell(island, 5, 5, 'mountain');
    setCell(island, 6, 5, 'kujira', 3);
    setCell(island, 4, 5, 'sea');
    setCell(island, 5, 4, 'shallows');
    setCell(island, 7, 5, 'submarine_missile');
    const exact = getMapAround(5, 5, 1).findIndex(({ x, y }) => x === 5 && y === 5);
    vi.spyOn(utility, 'randomIntInRange').mockReturnValue(exact);
    const result = fire('nuclear', island);
    expect(island.island_info[mapArrayConverter(5, 5)].type).toBe('ruins');
    expect(island.island_info[mapArrayConverter(6, 5)].type).toBe('ruins');
    expect(island.island_info[mapArrayConverter(4, 5)].type).toBe('sea');
    expect(island.island_info[mapArrayConverter(5, 4)].type).toBe('shallows');
    expect(island.island_info[mapArrayConverter(7, 5)].type).toBe('submarine_missile');
    expect(result.monsterKills).toBe(1);
  });
});

describe('難民受入', () => {
  test.each([1, 2, 3, 4, 5, 6, 10])('難民数%dでも1以上の整数人口マスを作る', (refugees) => {
    const island = createIsland('from', 'plains');

    const result = processRefugees(island, 2, refugees);
    const peopleCells = island.island_info.filter(({ type }) => type === 'people');

    expect(result.distributed).toBe(refugees);
    expect(peopleCells).toHaveLength(1);
    expect(peopleCells[0].landValue).toBe(refugees);
    expect(Number.isInteger(peopleCells[0].landValue)).toBe(true);
  });

  test('小数人口の既存都市を変更せず、整数の難民を別マスへ配置する', () => {
    const island = createIsland('from', 'sea');
    setCell(island, 0, 0, 'people', 199.99);
    setCell(island, 0, 1, 'plains');

    const result = processRefugees(island, 2, 2);
    const peopleCells = island.island_info.filter(({ type }) => type === 'people');

    expect(result.distributed).toBe(2);
    expect(peopleCells.map(({ landValue }) => landValue)).toEqual([199.99, 2]);
  });

  test('既存都市の整数の空き容量だけ受け入れ、残りを別マスへ配置する', () => {
    const island = createIsland('from', 'sea');
    setCell(island, 0, 0, 'people', 199);
    setCell(island, 0, 1, 'plains');

    const result = processRefugees(island, 2, 2);
    const peopleCells = island.island_info.filter(({ type }) => type === 'people');

    expect(result.distributed).toBe(2);
    expect(peopleCells.map(({ landValue }) => landValue)).toEqual([200, 1]);
  });

  test('小数の難民数は処理開始時に切り捨てる', () => {
    const island = createIsland('from', 'plains');

    const result = processRefugees(island, 2, 5.9);
    const peopleCells = island.island_info.filter(({ type }) => type === 'people');

    expect(result.distributed).toBe(5);
    expect(peopleCells).toHaveLength(1);
    expect(peopleCells[0].landValue).toBe(5);
    expect(Number.isInteger(peopleCells[0].landValue)).toBe(true);
  });
});
