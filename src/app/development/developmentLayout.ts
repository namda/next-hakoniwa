export const DEVELOPMENT_MENU_MIN_WIDTH_PX = 22 * 16;
export const DEVELOPMENT_MAP_MIN_WIDTH_PX = 32 * 16;
export const DEVELOPMENT_GRID_GAP_PX = 4;
export const DEVELOPMENT_PAGE_HORIZONTAL_GUTTER_PX = 8;

type DevelopmentLayoutInput = {
  viewportWidth: number;
};

export const getDevelopmentDesktopMinimumWidth = () =>
  DEVELOPMENT_MAP_MIN_WIDTH_PX +
  DEVELOPMENT_MENU_MIN_WIDTH_PX +
  DEVELOPMENT_GRID_GAP_PX +
  DEVELOPMENT_PAGE_HORIZONTAL_GUTTER_PX;

export const shouldUseCompactDevelopmentLayout = ({ viewportWidth }: DevelopmentLayoutInput) => {
  if (viewportWidth <= 0) return true;
  return viewportWidth < getDevelopmentDesktopMinimumWidth();
};
