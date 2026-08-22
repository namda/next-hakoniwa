import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../Modal', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="plan-item-modal">compact edit modal</div> : null,
}));

vi.mock('../Tooltip', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../SelectRHF', () => ({
  SelectRHF: () => null,
}));

vi.mock('../RangeSliderRHF', () => ({
  RangeSliderRHF: () => null,
}));

import PlanItem from '../PlanItem';

afterEach(() => {
  cleanup();
});

const getProps = ({ isCompact, edit }: { isCompact: boolean; edit: boolean }) =>
  ({
    isCompact,
    fromUuid: 'island-1',
    isChange: false,
    islandOptions: [{ label: 'Island 1', value: 'island-1' }],
    item: {
      id: 0,
      edit,
      to_uuid: 'island-1',
      plan_no: 0,
      times: 1,
      x: 0,
      y: 0,
      plan: 'financing',
    },
    onUpdate: vi.fn(),
    orderNo: 1,
    turn: 1,
    onDelete: vi.fn(),
    isDragged: false,
    onPointerDown: vi.fn(),
  }) as unknown as ComponentProps<typeof PlanItem>;

describe('PlanItem development layout', () => {
  it('keeps compact editing in a modal independently of viewport breakpoints', () => {
    render(<PlanItem {...getProps({ isCompact: true, edit: true })} />);

    expect(screen.getByTestId('plan-item-modal')).toBeDefined();
    expect(screen.getByText('No.1')).toBeDefined();
    expect(screen.getByText('T1').className).toContain('text-sm');
  });

  it('uses the denser inline desktop row only when the parent layout is desktop', () => {
    render(<PlanItem {...getProps({ isCompact: false, edit: false })} />);

    expect(screen.queryByTestId('plan-item-modal')).toBeNull();
    expect(screen.getByText('No.1')).toBeDefined();
    expect(screen.getByText('T1').className).toContain('text-xs');
    expect(screen.getByText('資金繰り').className).toContain('text-sm');
  });
});
