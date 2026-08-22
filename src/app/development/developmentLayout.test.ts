import { describe, expect, it } from 'vitest';

import {
  DEVELOPMENT_GRID_GAP_PX,
  DEVELOPMENT_MAP_MIN_WIDTH_PX,
  DEVELOPMENT_MENU_MIN_WIDTH_PX,
  DEVELOPMENT_PAGE_HORIZONTAL_GUTTER_PX,
  getDevelopmentDesktopMinimumWidth,
  shouldUseCompactDevelopmentLayout,
} from './developmentLayout';

describe('development desktop/compact layout', () => {
  it('uses compact layout on an 820px-wide viewport', () => {
    expect(shouldUseCompactDevelopmentLayout({ viewportWidth: 820 })).toBe(true);
  });

  it('uses desktop layout on a 1014px-wide viewport', () => {
    expect(shouldUseCompactDevelopmentLayout({ viewportWidth: 1014 })).toBe(false);
  });

  it('keeps desktop layout on a tall 1280px-wide viewport', () => {
    expect(shouldUseCompactDevelopmentLayout({ viewportWidth: 1280 })).toBe(false);
  });

  it('uses compact layout until viewport width is known', () => {
    expect(shouldUseCompactDevelopmentLayout({ viewportWidth: 0 })).toBe(true);
  });

  it('derives the breakpoint from minimum usable map and menu widths', () => {
    const minimumWidth =
      DEVELOPMENT_MAP_MIN_WIDTH_PX +
      DEVELOPMENT_MENU_MIN_WIDTH_PX +
      DEVELOPMENT_GRID_GAP_PX +
      DEVELOPMENT_PAGE_HORIZONTAL_GUTTER_PX;

    expect(getDevelopmentDesktopMinimumWidth()).toBe(minimumWidth);
    expect(shouldUseCompactDevelopmentLayout({ viewportWidth: minimumWidth - 1 })).toBe(true);
    expect(shouldUseCompactDevelopmentLayout({ viewportWidth: minimumWidth })).toBe(false);
  });
});
