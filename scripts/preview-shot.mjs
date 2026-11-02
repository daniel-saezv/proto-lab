/** Recorte de una captura: canvas visible, o null para fotografiar la ventana. */

export function largestBox(boxes) {
  let best = null;
  for (const box of boxes) {
    if (!box || box.width < 8 || box.height < 8) continue;
    if (!best || box.width * box.height > best.width * best.height) best = box;
  }
  return best;
}

export function clipWithinViewport(box, viewport) {
  if (!box || !viewport) return null;
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const right = Math.min(viewport.width, Math.round(box.x + box.width));
  const bottom = Math.min(viewport.height, Math.round(box.y + box.height));
  const width = right - x;
  const height = bottom - y;
  if (width < 8 || height < 8) return null;
  return { x, y, width, height };
}

export function chooseClip(boxes, viewport) {
  const box = largestBox(boxes);
  if (!box) return null;
  return clipWithinViewport(box, viewport);
}
