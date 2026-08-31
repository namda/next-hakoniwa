import { Plan, islandInfo, islandInfoData } from '@/db/kysely';
import { getMapDefine } from '@/global/define/mapType';

export const AUTO_INPUT_PREFIX = 'auto:';

export type PlanAutoInputType =
  | 'bulk_leveling'
  | 'bulk_immediate_leveling'
  | 'shallows_landfill'
  | 'shallows_drilling'
  | 'logging'
  | 'logging_and_afforest';

export type GeneratedPlan = Omit<Plan, 'plan_no'>;
export type LocalPlanItem = Plan & { id: number; edit: boolean };

export const planAutoInputOptions: Array<{
  value: `${typeof AUTO_INPUT_PREFIX}${PlanAutoInputType}`;
  label: string;
}> = [
  { value: 'auto:bulk_leveling', label: '一括整地' },
  { value: 'auto:bulk_immediate_leveling', label: '一括地ならし' },
  { value: 'auto:shallows_landfill', label: '浅瀬埋め立て' },
  { value: 'auto:shallows_drilling', label: '浅瀬掘削' },
  { value: 'auto:logging', label: '伐採自動入力' },
  { value: 'auto:logging_and_afforest', label: '伐採＆植林自動入力' },
];

export const planAutoInputDescriptions: Record<PlanAutoInputType, string> = {
  bulk_leveling: '現在の荒地すべてに「整地」を自動入力します。',
  bulk_immediate_leveling: '現在の荒地すべてに「地ならし」を自動入力します。',
  shallows_landfill: '現在の浅瀬すべてに「埋め立て」を自動入力します。',
  shallows_drilling: '現在の浅瀬すべてに「掘削」を自動入力します。',
  logging: '指定した本数以上の森に「伐採」を自動入力します。\n0の場合はすべての森を対象にします。',
  logging_and_afforest:
    '指定した本数以上の森に「伐採」「植林」を続けて自動入力します。\n0の場合はすべての森を対象にします。',
};

export const isAutoInputValue = (value: string): boolean => value.startsWith(AUTO_INPUT_PREFIX);

export const getAutoInputType = (value: string): PlanAutoInputType | null => {
  if (!isAutoInputValue(value)) return null;
  const type = value.slice(AUTO_INPUT_PREFIX.length);
  return planAutoInputOptions.some((option) => option.value === value)
    ? (type as PlanAutoInputType)
    : null;
};

const createGeneratedPlan = (uuid: string, plan: string, cell: islandInfo): GeneratedPlan => ({
  from_uuid: uuid,
  to_uuid: uuid,
  times: 1,
  x: cell.x,
  y: cell.y,
  plan,
});

const isWastelandCell = (cell: islandInfo) => cell.type === 'ruins' || cell.type === 'wasteland';

export const getForestTreeCount = (cell: islandInfo): number =>
  cell.landValue * (getMapDefine('forest').coefficient ?? 1);

const isLoggingTarget = (cell: islandInfo, quantity: number) =>
  cell.type === 'forest' && (quantity === 0 || getForestTreeCount(cell) >= quantity * 200);

export const generatePlanAutoInput = ({
  type,
  islandInfo,
  uuid,
  quantity = 0,
}: {
  type: PlanAutoInputType;
  islandInfo: islandInfoData;
  uuid: string;
  quantity?: number;
}): GeneratedPlan[] => {
  switch (type) {
    case 'bulk_leveling':
      return islandInfo
        .filter(isWastelandCell)
        .map((cell) => createGeneratedPlan(uuid, 'leveling', cell));
    case 'bulk_immediate_leveling':
      return islandInfo
        .filter(isWastelandCell)
        .map((cell) => createGeneratedPlan(uuid, 'immediate_leveling', cell));
    case 'shallows_landfill':
      return islandInfo
        .filter((cell) => cell.type === 'shallows')
        .map((cell) => createGeneratedPlan(uuid, 'landfill', cell));
    case 'shallows_drilling':
      return islandInfo
        .filter((cell) => cell.type === 'shallows')
        .map((cell) => createGeneratedPlan(uuid, 'drilling', cell));
    case 'logging':
      return islandInfo
        .filter((cell) => isLoggingTarget(cell, quantity))
        .map((cell) => createGeneratedPlan(uuid, 'logging', cell));
    case 'logging_and_afforest':
      return islandInfo
        .filter((cell) => isLoggingTarget(cell, quantity))
        .flatMap((cell) => [
          createGeneratedPlan(uuid, 'logging', cell),
          createGeneratedPlan(uuid, 'afforest', cell),
        ]);
  }
};

export const insertGeneratedPlans = ({
  currentItems,
  generatedPlans,
  position,
  planLength,
  keepPairs = false,
}: {
  currentItems: LocalPlanItem[];
  generatedPlans: GeneratedPlan[];
  position: number;
  planLength: number;
  keepPairs?: boolean;
}): { items: LocalPlanItem[]; insertedCount: number } => {
  const insertIndex = Math.max(0, Math.min(position - 1, currentItems.length));
  const availableSlots = Math.max(0, planLength - insertIndex);
  const insertLimit = keepPairs ? availableSlots - (availableSlots % 2) : availableSlots;
  const plansToInsert = generatedPlans.slice(0, insertLimit);
  const insertItems = plansToInsert.map((plan) => ({
    ...plan,
    id: -1,
    plan_no: -1,
    edit: false,
  }));
  const items = [...currentItems];
  items.splice(insertIndex, 0, ...insertItems);

  return {
    items: items.slice(0, planLength).map((item, index) => ({
      ...item,
      id: index,
      plan_no: index,
    })),
    insertedCount: insertItems.length,
  };
};
