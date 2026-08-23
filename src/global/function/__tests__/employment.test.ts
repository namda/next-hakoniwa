import { describe, expect, test } from 'vitest';
import { calculateEmploymentStats } from '../employment';

describe('calculateEmploymentStats', () => {
  test('農場を優先し、残人口を工場と採掘場の設備規模比で配分する', () => {
    expect(
      calculateEmploymentStats({
        population: 1_000_000,
        farmCapacity: 500_000,
        factoryCapacity: 500_000,
        miningCapacity: 500_000,
      })
    ).toEqual({
      farmWorkers: 500_000,
      factoryWorkers: 250_000,
      miningWorkers: 250_000,
      employed: 1_000_000,
      unemployed: 0,
      unusedCapacity: 500_000,
      totalCapacity: 1_500_000,
      jobOpeningRatio: 1.5,
    });
  });

  test('有人設備が不足すると残人口を失業者として返す', () => {
    const result = calculateEmploymentStats({
      population: 100_000,
      farmCapacity: 20_000,
      factoryCapacity: 30_000,
      miningCapacity: 10_000,
    });

    expect(result).toMatchObject({
      farmWorkers: 20_000,
      factoryWorkers: 30_000,
      miningWorkers: 10_000,
      employed: 60_000,
      unemployed: 40_000,
      unusedCapacity: 0,
      totalCapacity: 60_000,
      jobOpeningRatio: 0.6,
    });
  });

  test('按分の端数があっても就業者総数を失わない', () => {
    const result = calculateEmploymentStats({
      population: 2,
      farmCapacity: 0,
      factoryCapacity: 1,
      miningCapacity: 2,
    });

    expect(result.factoryWorkers).toBe(0);
    expect(result.miningWorkers).toBe(2);
    expect(result.employed).toBe(2);
    expect(result.unemployed).toBe(0);
  });

  test('人口0では求人倍率をnullにし、全設備を未使用として返す', () => {
    expect(
      calculateEmploymentStats({
        population: 0,
        farmCapacity: 10,
        factoryCapacity: 20,
        miningCapacity: 30,
      })
    ).toEqual({
      farmWorkers: 0,
      factoryWorkers: 0,
      miningWorkers: 0,
      employed: 0,
      unemployed: 0,
      unusedCapacity: 60,
      totalCapacity: 60,
      jobOpeningRatio: null,
    });
  });

  test('負数の入力を0として扱う', () => {
    expect(
      calculateEmploymentStats({
        population: -1,
        farmCapacity: -2,
        factoryCapacity: -3,
        miningCapacity: -4,
      })
    ).toEqual({
      farmWorkers: 0,
      factoryWorkers: 0,
      miningWorkers: 0,
      employed: 0,
      unemployed: 0,
      unusedCapacity: 0,
      totalCapacity: 0,
      jobOpeningRatio: null,
    });
  });
});
