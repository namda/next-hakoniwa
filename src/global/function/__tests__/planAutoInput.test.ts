import { islandInfoData } from '@/db/kysely';
import { usePlanDataStore } from '@/global/store/usePlanDataStore';
import { describe, expect, it } from 'vitest';
import {
  generatePlanAutoInput,
  getAutoInputType,
  insertGeneratedPlans,
  isAutoInputValue,
  LocalPlanItem,
} from '../planAutoInput';

const uuid = 'island-uuid';
const map: islandInfoData = [
  { type: 'ruins', landValue: 0, x: 0, y: 0 },
  { type: 'forest', landValue: 1, x: 1, y: 0 },
  { type: 'wasteland', landValue: 0, x: 2, y: 0 },
  { type: 'shallows', landValue: 0, x: 3, y: 0 },
  { type: 'forest', landValue: 2, x: 4, y: 0 },
  { type: 'forest', landValue: 6, x: 5, y: 0 },
  { type: 'sea', landValue: 0, x: 6, y: 0 },
  { type: 'oil_field', landValue: 0, x: 7, y: 0 },
  { type: 'submarine_missile', landValue: 0, x: 8, y: 0 },
];

describe('generatePlanAutoInput', () => {
  it('ruinsとwastelandを配列順のlevelingへ展開する', () => {
    const plans = generatePlanAutoInput({ type: 'bulk_leveling', islandInfo: map, uuid });
    expect(
      plans.map(({ plan, x, y, times, from_uuid, to_uuid }) => ({
        plan,
        x,
        y,
        times,
        from_uuid,
        to_uuid,
      }))
    ).toEqual([
      { plan: 'leveling', x: 0, y: 0, times: 1, from_uuid: uuid, to_uuid: uuid },
      { plan: 'leveling', x: 2, y: 0, times: 1, from_uuid: uuid, to_uuid: uuid },
    ]);
  });

  it('荒地だけをimmediate_levelingへ展開する', () => {
    expect(
      generatePlanAutoInput({ type: 'bulk_immediate_leveling', islandInfo: map, uuid })
    ).toMatchObject([
      { plan: 'immediate_leveling', x: 0, times: 1 },
      { plan: 'immediate_leveling', x: 2, times: 1 },
    ]);
  });

  it.each([
    ['shallows_landfill' as const, 'landfill'],
    ['shallows_drilling' as const, 'drilling'],
  ])('shallowsだけを%sへ展開する', (type, plan) => {
    expect(generatePlanAutoInput({ type, islandInfo: map, uuid })).toMatchObject([
      { plan, x: 3, y: 0, times: 1 },
    ]);
  });

  it('quantity=0なら全forestを伐採対象にする', () => {
    expect(
      generatePlanAutoInput({ type: 'logging', islandInfo: map, uuid, quantity: 0 }).map(
        (plan) => plan.x
      )
    ).toEqual([1, 4, 5]);
  });

  it.each([
    [1, [4, 5]],
    [3, [5]],
  ])('coefficientを使いquantity=%iの伐採対象を判定する', (quantity, expected) => {
    expect(
      generatePlanAutoInput({ type: 'logging', islandInfo: map, uuid, quantity }).map(
        (plan) => plan.x
      )
    ).toEqual(expected);
  });

  it('対象森ごとにloggingとafforestをtimes=1で生成する', () => {
    expect(
      generatePlanAutoInput({
        type: 'logging_and_afforest',
        islandInfo: map,
        uuid,
        quantity: 1,
      }).map(({ plan, x, times }) => [plan, x, times])
    ).toEqual([
      ['logging', 4, 1],
      ['afforest', 4, 1],
      ['logging', 5, 1],
      ['afforest', 5, 1],
    ]);
  });
});

describe('insertGeneratedPlans', () => {
  const item = (plan: string, id: number): LocalPlanItem => ({
    id,
    plan_no: id,
    edit: false,
    from_uuid: uuid,
    to_uuid: uuid,
    times: 1,
    x: id,
    y: 0,
    plan,
  });

  it('指定位置へ挿入し、上限内でidとplan_noを振り直す', () => {
    const generated = generatePlanAutoInput({ type: 'bulk_leveling', islandInfo: map, uuid });
    const result = insertGeneratedPlans({
      currentItems: [item('financing', 0), item('financing', 1)],
      generatedPlans: generated,
      position: 2,
      planLength: 3,
    });
    expect(result.insertedCount).toBe(2);
    expect(result.items.map(({ plan, id, plan_no }) => [plan, id, plan_no])).toEqual([
      ['financing', 0, 0],
      ['leveling', 1, 1],
      ['leveling', 2, 2],
    ]);
  });

  it('残り枠が奇数でも伐採と植林のペアを壊さない', () => {
    const generated = generatePlanAutoInput({
      type: 'logging_and_afforest',
      islandInfo: map,
      uuid,
      quantity: 0,
    });
    const result = insertGeneratedPlans({
      currentItems: [item('financing', 0), item('financing', 1)],
      generatedPlans: generated,
      position: 3,
      planLength: 5,
      keepPairs: true,
    });
    expect(result.insertedCount).toBe(2);
    expect(result.items.slice(-2).map((plan) => plan.plan)).toEqual(['logging', 'afforest']);
  });

  it('残り枠が1件だけなら伐採と植林をどちらも追加しない', () => {
    const generated = generatePlanAutoInput({
      type: 'logging_and_afforest',
      islandInfo: map,
      uuid,
      quantity: 0,
    });
    const result = insertGeneratedPlans({
      currentItems: [item('financing', 0), item('financing', 1)],
      generatedPlans: generated,
      position: 3,
      planLength: 3,
      keepPairs: true,
    });

    expect(result.insertedCount).toBe(0);
    expect(result.items.map((plan) => plan.plan)).toEqual(['financing', 'financing']);
  });

  it('自動入力全体を1回のUndoとRedoで操作できる', () => {
    const initialItems = [item('financing', 0), item('financing', 1)];
    const generated = generatePlanAutoInput({ type: 'bulk_leveling', islandInfo: map, uuid });
    const { items } = insertGeneratedPlans({
      currentItems: initialItems,
      generatedPlans: generated,
      position: 1,
      planLength: 4,
    });
    const store = usePlanDataStore.getState();
    store.reset();
    store.setItems(initialItems, true);
    store.setItems(items, true);

    usePlanDataStore.getState().undo();
    expect(usePlanDataStore.getState().items).toEqual(initialItems);
    usePlanDataStore.getState().redo();
    expect(usePlanDataStore.getState().items).toEqual(items);
    usePlanDataStore.getState().reset();
  });
});

describe('auto input values', () => {
  it('既知のauto valueだけを内部typeへ変換する', () => {
    expect(isAutoInputValue('auto:bulk_leveling')).toBe(true);
    expect(getAutoInputType('auto:bulk_leveling')).toBe('bulk_leveling');
    expect(getAutoInputType('auto:unknown')).toBeNull();
    expect(getAutoInputType('leveling')).toBeNull();
  });

  it('auto valueをPlan配列へ保存せず、展開後の通常Planだけを挿入する', () => {
    const generated = generatePlanAutoInput({ type: 'bulk_leveling', islandInfo: map, uuid });
    const result = insertGeneratedPlans({
      currentItems: [],
      generatedPlans: generated,
      position: 1,
      planLength: 30,
    });

    expect(result.items.map(({ plan }) => plan)).toEqual(['leveling', 'leveling']);
    expect(result.items.some(({ plan }) => isAutoInputValue(plan))).toBe(false);
  });
});
