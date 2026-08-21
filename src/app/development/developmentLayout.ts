export const DEVELOPMENT_MENU_MIN_WIDTH_PX = 28 * 16;
export const DEVELOPMENT_GRID_GAP_PX = 4;
export const DEVELOPMENT_MAP_RIGHT_GUTTER_PX = 4;

type DevelopmentMapRect = {
  x: number;
  y: number;
};

export const getDevelopmentMapPageTop = (viewportTop: number, scrollY: number) =>
  viewportTop + scrollY;

export const getCurrentScrollY = () => {
  if (typeof window === 'undefined') return 0;
  return window.scrollY;
};

export const getDevelopmentMapPageTopFromRect = (
  mapRect: DevelopmentMapRect | null | undefined,
  scrollY: number
) => {
  if (mapRect === null || mapRect === undefined) return 0;
  return getDevelopmentMapPageTop(mapRect.y, scrollY);
};

type DevelopmentLayoutInput = {
  viewportWidth: number;
  viewportBottom: number;
  mapRect?: DevelopmentMapRect | null;
  scrollY?: number;
};

export const shouldUseCompactDevelopmentLayout = ({
  viewportWidth,
  viewportBottom,
  mapRect,
  scrollY = 0,
}: DevelopmentLayoutInput) => {
  if (viewportWidth <= 0 || viewportBottom <= 0 || mapRect === null || mapRect === undefined) {
    return true;
  }

  const mapPageTop = getDevelopmentMapPageTop(mapRect.y, scrollY);
  const fullHeightMapSize = Math.max(0, viewportBottom - mapPageTop);
  const requiredWidth =
    mapRect.x +
    fullHeightMapSize +
    DEVELOPMENT_MAP_RIGHT_GUTTER_PX +
    DEVELOPMENT_GRID_GAP_PX +
    DEVELOPMENT_MENU_MIN_WIDTH_PX;

  return viewportWidth < requiredWidth;
};

export const getDevelopmentMapRightReservePx = (isCompact: boolean) => {
  if (isCompact) {
    return DEVELOPMENT_MAP_RIGHT_GUTTER_PX;
  }

  return DEVELOPMENT_MENU_MIN_WIDTH_PX + DEVELOPMENT_GRID_GAP_PX + DEVELOPMENT_MAP_RIGHT_GUTTER_PX;
};
