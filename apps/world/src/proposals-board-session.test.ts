import { describe, expect, it } from "vitest";
import {
  BOARD_MOTION_MS,
  BoardSession,
  drawAppearance,
  eraseAppearance,
  sampleBoardMotion,
} from "./proposals-board-session";

const rows = [7, 8, 9];

describe("movimiento de tiza del tablón", () => {
  it("borra y luego dibuja, y se asienta al terminar", () => {
    expect(sampleBoardMotion(0, false)).toEqual({ stage: "erase", t: 1 });
    const midErase = sampleBoardMotion(BOARD_MOTION_MS * 0.2, false);
    expect(midErase.stage).toBe("erase");
    expect(midErase.t).toBeLessThan(1);
    expect(midErase.t).toBeGreaterThan(0);
    const draw = sampleBoardMotion(BOARD_MOTION_MS * 0.7, false);
    expect(draw.stage).toBe("draw");
    expect(draw.t).toBeGreaterThan(0);
    expect(draw.t).toBeLessThan(1);
    expect(sampleBoardMotion(BOARD_MOTION_MS, false)).toEqual({ stage: "settled", t: 1 });
    expect(sampleBoardMotion(0, true)).toEqual({ stage: "settled", t: 1 });
  });

  it("el texto se va antes que el trazo y entra después", () => {
    expect(eraseAppearance(1)).toEqual({ stroke: 1, text: 1 });
    expect(eraseAppearance(0.5).text).toBeGreaterThan(0);
    expect(eraseAppearance(0.2).text).toBe(0);
    expect(eraseAppearance(0.2).stroke).toBeGreaterThan(0);
    expect(eraseAppearance(0)).toEqual({ stroke: 0, text: 0 });
    expect(drawAppearance(0)).toEqual({ stroke: 0, text: 0 });
    expect(drawAppearance(0.2).text).toBe(0);
    expect(drawAppearance(0.2).stroke).toBeGreaterThan(0);
    expect(drawAppearance(1)).toEqual({ stroke: 1, text: 1 });
  });
});

describe("sesión del tablón", () => {
  it("fuera de la vista fijada no selecciona", () => {
    const session = new BoardSession();
    expect(session.select(7, rows, 0, false)).toBe(false);
    expect(session.screen).toBe("list");
  });

  it("selecciona con transición y vuelve a la lista", () => {
    const session = new BoardSession();
    session.setInteractive(true, rows);
    expect(session.focus).toEqual({ zone: "row", number: 7 });
    expect(session.select(8, rows, 1_000, false)).toBe(true);
    expect(session.isMoving()).toBe(true);
    expect(session.selectedNumber).toBe(8);
    expect(session.motionSample(1_000, false).stage).toBe("erase");
    expect(session.motionSample(1_000, false).to).toBe("detail");
    expect(session.settle(1_000 + BOARD_MOTION_MS, false)).toBe(true);
    expect(session.screen).toBe("detail");
    expect(session.isMoving()).toBe(false);
    expect(session.deselect(rows, 2_000, false)).toBe(true);
    expect(session.motionSample(2_000, false).to).toBe("list");
    session.settle(2_000 + BOARD_MOTION_MS, false);
    expect(session.screen).toBe("list");
    expect(session.selectedNumber).toBeNull();
  });

  it("con menos movimiento el detalle es inmediato", () => {
    const session = new BoardSession();
    session.setInteractive(true, rows);
    session.select(8, rows, 0, true);
    expect(session.isMoving()).toBe(false);
    expect(session.screen).toBe("detail");
    expect(session.deselect(rows, 0, true)).toBe(true);
    expect(session.screen).toBe("list");
    expect(session.focus).toEqual({ zone: "row", number: 7 });
  });

  it("Escape deselecciona y las flechas eligen la acción", () => {
    const session = new BoardSession();
    session.setInteractive(true, rows);
    session.select(8, rows, 0, true);
    expect(session.key("ArrowDown", rows, true, 0, true)).toEqual({ handled: true, activate: false });
    expect(session.focus).toEqual({ zone: "action" });
    expect(session.key("Enter", rows, true, 0, true)).toEqual({ handled: true, activate: true });
    expect(session.screen).toBe("detail");
    expect(session.key("Escape", rows, true, 0, true).handled).toBe(true);
    expect(session.screen).toBe("list");
    expect(session.key("Escape", rows, false, 0, true).handled).toBe(false);
  });

  it("en otros estados Enter vuelve a la lista y no navega", () => {
    const session = new BoardSession();
    session.setInteractive(true, rows);
    session.select(7, rows, 0, true);
    expect(session.focus).toEqual({ zone: "back" });
    expect(session.key("Enter", rows, false, 0, true)).toEqual({ handled: true, activate: false });
    expect(session.screen).toBe("list");
    expect(session.key("ArrowDown", rows, false, 0, true).activate).toBe(false);
  });

  it("las flechas recorren filas y Enter abre la enfocada", () => {
    const session = new BoardSession();
    session.setInteractive(true, rows);
    session.key("ArrowDown", rows, false, 0, true);
    expect(session.focus).toEqual({ zone: "row", number: 8 });
    session.key("Enter", rows, false, 0, true);
    expect(session.screen).toBe("detail");
    expect(session.selectedNumber).toBe(8);
  });

  it("al salir de la vista vuelve a la lista sin transición", () => {
    const session = new BoardSession();
    session.setInteractive(true, rows);
    session.select(8, rows, 0, false);
    expect(session.isMoving()).toBe(true);
    session.setInteractive(false, rows);
    expect(session.interactive).toBe(false);
    expect(session.screen).toBe("list");
    expect(session.isMoving()).toBe(false);
    expect(session.selectedNumber).toBeNull();
  });

  it("si la propuesta desaparece, suelta la selección", () => {
    const session = new BoardSession();
    session.setInteractive(true, rows);
    session.select(9, rows, 0, true);
    expect(session.syncRows([7, 8])).toBe(true);
    expect(session.screen).toBe("list");
    expect(session.selectedNumber).toBeNull();
  });

  it("un toque en la acción la dispara y la vuelta no", () => {
    const session = new BoardSession();
    session.setInteractive(true, rows);
    session.select(8, rows, 0, true);
    expect(session.pointer("action", undefined, rows, true, 0, true)).toEqual({ handled: true, activate: true });
    expect(session.pointer("back", undefined, rows, true, 0, true).activate).toBe(false);
    expect(session.screen).toBe("list");
  });
});
