/** Normalized landmarks measured from the supplied 1671 × 941 ATM reference.
 * Percentages keep the image and invisible PLAY hotspot in one coordinate space.
 */
export const ATM_REFERENCE = {
  width: 1671,
  height: 941,
  screenCenter: { x: 0.5, y: 0.477 },
  screen: { x: 0.285, y: 0.274, width: 0.43, height: 0.395 },
  // Safely inside the bezel: the end zoom covers the viewport with screen only.
  safeScreen: { width: 0.39, height: 0.35 },
  play: { x: 0.388, y: 0.404, width: 0.224, height: 0.16 },
} as const;

export function entryGeometry(
  viewWidth: number,
  viewHeight: number,
  imageWidth: number = ATM_REFERENCE.width,
  imageHeight: number = ATM_REFERENCE.height,
) {
  const viewportWidth = Math.max(1, viewWidth),
    viewportHeight = Math.max(1, viewHeight);
  // Landscape covers the viewport. Portrait caps the crop so the whole screen
  // stays readable; the same image provides a subdued, full-bleed ambient layer.
  const cover = Math.max(
    viewportWidth /
      (imageWidth *
        2 *
        Math.min(
          ATM_REFERENCE.screenCenter.x,
          1 - ATM_REFERENCE.screenCenter.x,
        )),
    viewportHeight /
      (imageHeight *
        2 *
        Math.min(
          ATM_REFERENCE.screenCenter.y,
          1 - ATM_REFERENCE.screenCenter.y,
        )),
  );
  const scale = Math.min(cover, viewportWidth / (imageWidth * 0.53));
  const width = imageWidth * scale,
    height = imageHeight * scale;
  const left = viewportWidth / 2 - width * ATM_REFERENCE.screenCenter.x;
  const top = viewportHeight / 2 - height * ATM_REFERENCE.screenCenter.y;
  const zoom =
    Math.max(
      viewportWidth / (width * ATM_REFERENCE.safeScreen.width),
      viewportHeight / (height * ATM_REFERENCE.safeScreen.height),
    ) * 1.08;
  return { width, height, left, top, zoom };
}
