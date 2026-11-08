import { describe, expect, it } from "vitest";
import { ATM_REFERENCE, entryGeometry } from "../src/app/entryGeometry";
describe("ATM image-space alignment", () => {
  for (const [vw, vh] of [
    [1440, 900],
    [1920, 1080],
    [2560, 1080],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    it(`keeps the entire display and PLAY artwork in bounds at ${vw} × ${vh}`, () => {
      const g = entryGeometry(vw, vh),
        screen = ATM_REFERENCE.screen,
        play = ATM_REFERENCE.play;
      const left = g.left + screen.x * g.width,
        right = left + screen.width * g.width;
      const top = g.top + screen.y * g.height,
        bottom = top + screen.height * g.height;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(vw);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(bottom).toBeLessThanOrEqual(vh);
      expect(g.left + play.x * g.width).toBeGreaterThan(left);
      expect(g.left + (play.x + play.width) * g.width).toBeLessThan(right);
      expect(play.width * g.width).toBeGreaterThan(44);
      expect(play.height * g.height).toBeGreaterThan(44);
    });
    it(`centers the zoom on the display and moves the bezel outside ${vw} × ${vh}`, () => {
      const g = entryGeometry(vw, vh);
      expect(g.left + ATM_REFERENCE.screenCenter.x * g.width).toBeCloseTo(
        vw / 2,
        8,
      );
      expect(g.top + ATM_REFERENCE.screenCenter.y * g.height).toBeCloseTo(
        vh / 2,
        8,
      );
      expect(g.width * ATM_REFERENCE.safeScreen.width * g.zoom).toBeGreaterThan(
        vw,
      );
      expect(
        g.height * ATM_REFERENCE.safeScreen.height * g.zoom,
      ).toBeGreaterThan(vh);
      expect(g.zoom).toBeGreaterThan(1);
    });
  }
});
