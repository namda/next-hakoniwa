import { fireEvent, render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

vi.mock('../Modal', () => ({
  default: ({ open, body, footer }: { open: boolean; body: ReactNode; footer: ReactNode }) =>
    open ? (
      <div>
        {body}
        {footer}
      </div>
    ) : null,
}));

vi.mock('../Tooltip', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../function/useWindowSize', () => ({
  useWindowSize: () => ({ width: 375, height: 800 }),
}));

vi.mock('@/global/define/planType', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/global/define/planType')>();
  return {
    ...actual,
    getPlanDefine: vi.fn(actual.getPlanDefine),
    validLandType: vi.fn(() => true),
  };
});

import { getPlanDefine } from '@/global/define/planType';
import HakoniwaMap from '../HakoniwaMap';

afterEach(() => {
  vi.mocked(getPlanDefine).mockClear();
});

describe('HakoniwaMap plan auto input', () => {
  it('auto valueを通常Plan定義へ渡さない', () => {
    render(
      <HakoniwaMap
        isLoading={false}
        islandName="テスト"
        isDevelop
        uuid="island-uuid"
        data={[{ type: 'wasteland', landValue: 0, x: 0, y: 0 }]}
      />
    );

    fireEvent.click(screen.getByAltText(/荒地/));
    fireEvent.click(screen.getByRole('button', { name: '開発' }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'auto:bulk_leveling' },
    });
    fireEvent.click(screen.getByRole('button', { name: '計画の挿入' }));

    expect(vi.mocked(getPlanDefine).mock.calls.some(([value]) => value.startsWith('auto:'))).toBe(
      false
    );
  });
});
