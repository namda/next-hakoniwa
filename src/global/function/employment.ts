/**
 * @module employment
 * @description 農場・有人工場・有人採掘場への労働人口配分。
 */

export type EmploymentStats = {
  farmWorkers: number;
  factoryWorkers: number;
  miningWorkers: number;
  employed: number;
  unemployed: number;
  unusedCapacity: number;
  totalCapacity: number;
  jobOpeningRatio: number | null;
};

export const calculateEmploymentStats = ({
  population,
  farmCapacity,
  factoryCapacity,
  miningCapacity,
}: {
  population: number;
  farmCapacity: number;
  factoryCapacity: number;
  miningCapacity: number;
}): EmploymentStats => {
  const safePopulation = Math.max(0, population);
  const safeFarmCapacity = Math.max(0, farmCapacity);
  const safeFactoryCapacity = Math.max(0, factoryCapacity);
  const safeMiningCapacity = Math.max(0, miningCapacity);

  const farmWorkers = Math.min(safePopulation, safeFarmCapacity);
  const remainingPopulation = Math.max(0, safePopulation - farmWorkers);
  const industrialCapacity = safeFactoryCapacity + safeMiningCapacity;
  const industrialWorkers = Math.min(remainingPopulation, industrialCapacity);

  const factoryWorkers =
    industrialCapacity > 0
      ? Math.min(
          safeFactoryCapacity,
          Math.floor((industrialWorkers * safeFactoryCapacity) / industrialCapacity)
        )
      : 0;

  const miningWorkers = Math.min(
    safeMiningCapacity,
    Math.max(0, industrialWorkers - factoryWorkers)
  );

  const employed = farmWorkers + factoryWorkers + miningWorkers;
  const totalCapacity = safeFarmCapacity + safeFactoryCapacity + safeMiningCapacity;

  return {
    farmWorkers,
    factoryWorkers,
    miningWorkers,
    employed,
    unemployed: Math.max(0, safePopulation - employed),
    unusedCapacity: Math.max(0, totalCapacity - employed),
    totalCapacity,
    jobOpeningRatio: safePopulation > 0 ? totalCapacity / safePopulation : null,
  };
};
