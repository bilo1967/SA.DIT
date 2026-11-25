// Fit a whole video or a normalized crop without stretching the source image.
export function videoLayout(sourceWidth, sourceHeight, width, height, crop = null) {
  if (!(sourceWidth > 0 && sourceHeight > 0 && width > 0 && height > 0)) return null;
  const area = crop || { x: 0, y: 0, width: 1, height: 1 };
  const scale = Math.min(width / (sourceWidth * area.width), height / (sourceHeight * area.height));
  return {
    left: (width - sourceWidth * area.width * scale) / 2 - sourceWidth * area.x * scale,
    top: (height - sourceHeight * area.height * scale) / 2 - sourceHeight * area.y * scale,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}

// Clamp both drag endpoints to the displayed image, excluding letterbox bars.
export function dragSelection(start, end, frame) {
  const clamp = (point) => ({
    x: Math.max(frame.left, Math.min(frame.left + frame.width, point.x)),
    y: Math.max(frame.top, Math.min(frame.top + frame.height, point.y)),
  });
  const a = clamp(start), b = clamp(end);
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

// Store source-relative coordinates so crops survive window/video size changes.
export function normalizedCrop(selection, frame) {
  if (!selection || selection.width < 4 || selection.height < 4) return null;
  return { x: (selection.left - frame.left) / frame.width,
    y: (selection.top - frame.top) / frame.height,
    width: selection.width / frame.width, height: selection.height / frame.height };
}
