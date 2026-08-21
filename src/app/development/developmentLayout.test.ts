import { describe, expect, it } from 'vitest';

import {
  DEVELOPMENT_GRID_GAP_PX,
  DEVELOPMENT_MAP_RIGHT_GUTTER_PX,
  DEVELOPMENT_MENU_MIN_WIDTH_PX,
  getDevelopmentMapRightReservePx,
  shouldUseCompactDevelopmentLayout,
} from './developmentLayout';

describe('shouldUseCompactDevelopmentLayout', () => {
  it('keeps desktop layout when a full-height map and menu fit', () => {
    expect(
      shouldUseCompactDevelopmentLayout({
        viewportWidth: 1366,
        viewportBottom: 760,
        mapRect: { x: 4, y: 150 },
      })
    ).toBe(false);
  });

  it('uses compact layout when a tall map would squeeze the menu', () => {
    expect(
      shouldUseCompactDevelopmentLayout({
        viewportWidth: 1280,
        viewportBottom: 1000,
        mapRect: { x: 4, y: 150 },
      })
    ).toBe(true);
  });

  it('can keep desktop layout below 1280px on a short viewport', () => {
    expect(
      shouldUseCompactDevelopmentLayout({
        viewportWidth: 1100,
        viewportBottom: 650,
        mapRect: { x: 4, y: 150 },
      })
    ).toBe(false);
  });

  it('uses compact layout until measurements are available', () => {
    expect(
      shouldUseCompactDevelopmentLayout({
        viewportWidth: 1920,
        viewportBottom: 1000,
      })
    ).toBe(true);
  });
});

describe('getDevelopmentMapRightReservePx', () => {
  it('reserves only the gutter in compact layout', () => {
    expect(getDevelopmentMapRightReservePx(true)).toBe(DEVELOPMENT_MAP_RIGHT_GUTTER_PX);
  });

  it('reserves menu width and gaps in desktop layout', () => {
    expect(getDevelopmentMapRightReservePx(false)).toBe(
      DEVELOPMENT_MENU_MIN_WIDTH_PX + DEVELOPMENT_GRID_GAP_PX + DEVELOPMENT_MAP_RIGHT_GUTTER_PX
    );
  });
});

describe('getDevelopmentMapPageTop', () => {
  it('keeps the same page position while the viewport scrolls', async () => {
    const { getDevelopmentMapPageTop } = await import('./developmentLayout');

    expect(getDevelopmentMapPageTop(190, 0)).toBe(190);
    expect(getDevelopmentMapPageTop(90, 100)).toBe(190);
    expect(getDevelopmentMapPageTop(-10, 200)).toBe(190);
  });
});

describe('scroll-stable development layout', () => {
  it('does not change layout only because the page was scrolled', () => {
    const beforeScroll = shouldUseCompactDevelopmentLayout({
      viewportWidth: 1280,
      viewportBottom: 900,
      mapRect: { x: 4, y: 190 },
      scrollY: 0,
    });

    const afterScroll = shouldUseCompactDevelopmentLayout({
      viewportWidth: 1280,
      viewportBottom: 900,
      mapRect: { x: 4, y: 90 },
      scrollY: 100,
    });

    expect(afterScroll).toBe(beforeScroll);
  });
});

describe('getDevelopmentMapPageTopFromRect', () => {
  it('returns the stable page top from a viewport rect and scroll position', async () => {
    const { getDevelopmentMapPageTopFromRect } = await import('./developmentLayout');

    expect(getDevelopmentMapPageTopFromRect({ x: 0, y: 190 }, 0)).toBe(190);
    expect(getDevelopmentMapPageTopFromRect({ x: 0, y: 90 }, 100)).toBe(190);
  });

  it('returns zero before the map rect is measured', async () => {
    const { getDevelopmentMapPageTopFromRect } = await import('./developmentLayout');

    expect(getDevelopmentMapPageTopFromRect(undefined, 100)).toBe(0);
  });
});

describe('null map rect', () => {
  it('treats a null map rect as unmeasured', async () => {
    const { getDevelopmentMapPageTopFromRect, shouldUseCompactDevelopmentLayout } =
      await import('./developmentLayout');

    expect(getDevelopmentMapPageTopFromRect(null, 100)).toBe(0);
    expect(
      shouldUseCompactDevelopmentLayout({
        viewportWidth: 1920,
        viewportBottom: 1000,
        mapRect: null,
      })
    ).toBe(true);
  });
});
