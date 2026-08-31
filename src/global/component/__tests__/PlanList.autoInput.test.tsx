import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const trigger = vi.fn();

vi.mock('../../function/fetch/clientFetch', () => ({
  useClientFetch: () => ({ fetch: trigger }),
}));

vi.mock('@formkit/auto-animate/react', () => ({
  useAutoAnimate: () => [vi.fn(), vi.fn()],
}));

vi.mock('../../function/useDragReorder', () => ({
  useDragReorder: () => ({
    draggedId: null,
    previewItems: null,
    handlePointerDown: vi.fn(),
    setItemRowRef: vi.fn(),
    setScrollContainer: vi.fn(),
  }),
}));

vi.mock('../PlanItem', () => ({
  default: () => null,
}));

vi.mock('../Button', () => ({
  default: ({
    children,
    ...props
  }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import { generatePlanAutoInput, insertGeneratedPlans } from '../../function/planAutoInput';
import { usePlanDataStore } from '../../store/usePlanDataStore';
import PlanList from '../PlanList';

afterEach(() => {
  usePlanDataStore.getState().reset();
  trigger.mockReset();
});

describe('PlanList with plan auto input', () => {
  it('Plan APIへauto valueではなく展開後の通常Planだけを送信する', async () => {
    render(<PlanList islandList={[]} isPlanLoading={false} uuid="island-uuid" initPlanData={[]} />);

    const generatedPlans = generatePlanAutoInput({
      type: 'bulk_leveling',
      islandInfo: [{ type: 'wasteland', landValue: 0, x: 0, y: 0 }],
      uuid: 'island-uuid',
    });
    const { items } = insertGeneratedPlans({
      currentItems: usePlanDataStore.getState().items,
      generatedPlans,
      position: 1,
      planLength: 30,
    });

    act(() => usePlanDataStore.getState().setItems(items));
    const submitButton = screen.getByRole('button', { name: '計画送信' });
    await waitFor(() => expect((submitButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submitButton);

    expect(trigger).toHaveBeenCalledOnce();
    const request = trigger.mock.calls[0][0];
    const payload = JSON.parse(String(request.body)) as Array<{ plan: string }>;
    expect(payload).toMatchObject([{ plan: 'leveling' }]);
    expect(payload.some(({ plan }) => plan.startsWith('auto:'))).toBe(false);
  });
});
