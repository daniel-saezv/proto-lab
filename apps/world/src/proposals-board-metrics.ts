export const WHITEBOARD_WIDTH = 960;
export const WHITEBOARD_HEIGHT = 540;
export const WHITEBOARD_MAX_ROWS = 5;

export type BoardRowLayout = {
  number: number;
  y: number;
  height: number;
  trackY: number;
  trackHeight: number;
};

export function computeRowLayouts(rowCount: number): BoardRowLayout[] {
  const header = 72;
  const footer = 36;
  const usable = WHITEBOARD_HEIGHT - header - footer;
  const rowHeight = Math.floor(usable / WHITEBOARD_MAX_ROWS);
  const layouts: BoardRowLayout[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const y = header + i * rowHeight;
    layouts.push({
      number: 0,
      y,
      height: rowHeight,
      trackY: y + Math.round(rowHeight * 0.52),
      trackHeight: Math.round(rowHeight * 0.38),
    });
  }
  return layouts;
}
