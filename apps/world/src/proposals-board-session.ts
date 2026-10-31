/** Duración del borrado y del trazo de tiza entre lista y detalle. */
export const BOARD_MOTION_MS = 640;
const ERASE_PORTION = 0.4;

export type BoardScreenName = "list" | "detail";

export type BoardFocus =
  | { zone: "row"; number: number }
  | { zone: "back" }
  | { zone: "action" };

export type BoardMotionSample = {
  stage: "erase" | "draw" | "settled";
  /** En erase baja de 1 a 0. En draw y settled sube o vale 1. */
  t: number;
  from: BoardScreenName;
  to: BoardScreenName;
};

export function sampleBoardMotion(elapsedMs: number, reduced: boolean): { stage: "erase" | "draw" | "settled"; t: number } {
  if (reduced) return { stage: "settled", t: 1 };
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed >= BOARD_MOTION_MS) return { stage: "settled", t: 1 };
  const u = elapsed / BOARD_MOTION_MS;
  if (u < ERASE_PORTION) {
    const local = u / ERASE_PORTION;
    const eased = local * local * (3 - 2 * local);
    return { stage: "erase", t: 1 - eased };
  }
  const local = (u - ERASE_PORTION) / (1 - ERASE_PORTION);
  const eased = local * local * (3 - 2 * local);
  return { stage: "draw", t: eased };
}

/** Texto que se apaga antes y trazo que se recoge después. `t` va de 1 (intacto) a 0 (borrado). */
export function eraseAppearance(t: number): { stroke: number; text: number } {
  const clamped = Math.min(1, Math.max(0, t));
  const text = clamped > 0.4 ? (clamped - 0.4) / 0.6 : 0;
  const stroke = clamped < 0.7 ? clamped / 0.7 : 1;
  return { stroke, text };
}

/** Trazo que entra y texto que aparece al final. `t` va de 0 a 1. */
export function drawAppearance(t: number): { stroke: number; text: number } {
  const clamped = Math.min(1, Math.max(0, t));
  const text = clamped > 0.45 ? (clamped - 0.45) / 0.55 : 0;
  return { stroke: clamped, text };
}

export type BoardKeyResult = { handled: boolean; activate: boolean };

export class BoardSession {
  interactive = false;
  screen: BoardScreenName = "list";
  selectedNumber: number | null = null;
  focus: BoardFocus | null = null;
  private motion: { from: BoardScreenName; to: BoardScreenName; startMs: number } | null = null;

  isMoving(): boolean {
    return this.motion != null;
  }

  motionSample(nowMs: number, reduced: boolean): BoardMotionSample {
    if (!this.motion) {
      return { stage: "settled", t: 1, from: this.screen, to: this.screen };
    }
    const sample = sampleBoardMotion(nowMs - this.motion.startMs, reduced);
    return { ...sample, from: this.motion.from, to: this.motion.to };
  }

  /** Cierra la transición si ya terminó. Devuelve true cuando el fotograma debe republicarse. */
  settle(nowMs: number, reduced: boolean): boolean {
    if (!this.motion) return false;
    const sample = sampleBoardMotion(nowMs - this.motion.startMs, reduced);
    if (sample.stage !== "settled") return false;
    this.screen = this.motion.to;
    this.motion = null;
    if (this.screen === "list") {
      this.selectedNumber = null;
      if (this.focus?.zone !== "row") this.focus = null;
    }
    return true;
  }

  setInteractive(on: boolean, rowNumbers: readonly number[]): boolean {
    if (this.interactive === on) return false;
    this.interactive = on;
    if (!on) {
      this.motion = null;
      this.screen = "list";
      this.selectedNumber = null;
      this.focus = null;
      return true;
    }
    if (this.focus == null) this.focus = firstRowFocus(rowNumbers);
    return true;
  }

  /** Si la fila elegida ya no está, vuelve a la lista. */
  syncRows(rowNumbers: readonly number[]): boolean {
    if (this.selectedNumber != null && !rowNumbers.includes(this.selectedNumber)) {
      this.motion = null;
      this.screen = "list";
      this.selectedNumber = null;
      this.focus = this.interactive ? firstRowFocus(rowNumbers) : null;
      return true;
    }
    if (this.focus?.zone === "row" && !rowNumbers.includes(this.focus.number)) {
      this.focus = this.interactive ? firstRowFocus(rowNumbers) : null;
      return true;
    }
    if (this.interactive && this.screen === "list" && this.focus == null && rowNumbers.length > 0) {
      this.focus = firstRowFocus(rowNumbers);
      return true;
    }
    return false;
  }

  select(number: number, rowNumbers: readonly number[], nowMs: number, reduced: boolean): boolean {
    if (!this.interactive || this.motion || this.screen !== "list") return false;
    if (!rowNumbers.includes(number)) return false;
    this.selectedNumber = number;
    this.focus = { zone: "back" };
    if (reduced) {
      this.screen = "detail";
      return true;
    }
    this.motion = { from: "list", to: "detail", startMs: nowMs };
    return true;
  }

  deselect(rowNumbers: readonly number[], nowMs: number, reduced: boolean): boolean {
    if (!this.interactive) return false;
    if (this.motion) {
      this.snapList(rowNumbers);
      return true;
    }
    if (this.screen !== "detail") return false;
    this.focus = firstRowFocus(rowNumbers);
    if (reduced) {
      this.screen = "list";
      this.selectedNumber = null;
      return true;
    }
    this.motion = { from: "detail", to: "list", startMs: nowMs };
    return true;
  }

  key(
    key: string,
    rowNumbers: readonly number[],
    hasAction: boolean,
    nowMs: number,
    reduced: boolean,
  ): BoardKeyResult {
    if (!this.interactive) return { handled: false, activate: false };
    if (key === "Escape") {
      if (this.screen === "list" && !this.motion) return { handled: false, activate: false };
      if (this.motion?.to === "list") {
        this.snapList(rowNumbers);
        return { handled: false, activate: false };
      }
      if (this.motion) {
        this.snapList(rowNumbers);
        return { handled: true, activate: false };
      }
      this.deselect(rowNumbers, nowMs, reduced);
      return { handled: true, activate: false };
    }
    if (this.motion) {
      if (isBoardNavKey(key)) return { handled: true, activate: false };
      return { handled: false, activate: false };
    }
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      this.moveFocus(key, rowNumbers, hasAction);
      return { handled: true, activate: false };
    }
    if (key === "Enter" || key === " ") {
      return this.activateFocus(rowNumbers, hasAction, nowMs, reduced);
    }
    return { handled: false, activate: false };
  }

  pointer(
    zone: "row" | "back" | "action",
    number: number | undefined,
    rowNumbers: readonly number[],
    hasAction: boolean,
    nowMs: number,
    reduced: boolean,
  ): BoardKeyResult {
    if (!this.interactive || this.motion) return { handled: true, activate: false };
    if (zone === "row" && number != null && this.screen === "list") {
      this.select(number, rowNumbers, nowMs, reduced);
      return { handled: true, activate: false };
    }
    if (zone === "back" && this.screen === "detail") {
      this.deselect(rowNumbers, nowMs, reduced);
      return { handled: true, activate: false };
    }
    if (zone === "action" && this.screen === "detail" && hasAction) {
      return { handled: true, activate: true };
    }
    return { handled: true, activate: false };
  }

  private activateFocus(
    rowNumbers: readonly number[],
    hasAction: boolean,
    nowMs: number,
    reduced: boolean,
  ): BoardKeyResult {
    const focus = this.focus;
    if (this.screen === "list" && focus?.zone === "row") {
      this.select(focus.number, rowNumbers, nowMs, reduced);
      return { handled: true, activate: false };
    }
    if (this.screen === "detail" && focus?.zone === "back") {
      this.deselect(rowNumbers, nowMs, reduced);
      return { handled: true, activate: false };
    }
    if (this.screen === "detail" && focus?.zone === "action" && hasAction) {
      return { handled: true, activate: true };
    }
    return { handled: true, activate: false };
  }

  private moveFocus(key: string, rowNumbers: readonly number[], hasAction: boolean) {
    if (this.screen === "detail") {
      if (!hasAction || key === "Home") {
        this.focus = { zone: "back" };
        return;
      }
      if (key === "End") {
        this.focus = { zone: "action" };
        return;
      }
      this.focus = { zone: this.focus?.zone === "action" ? "back" : "action" };
      return;
    }
    if (rowNumbers.length === 0) {
      this.focus = null;
      return;
    }
    const current = this.focus?.zone === "row" ? rowNumbers.indexOf(this.focus.number) : 0;
    const index = current < 0 ? 0 : current;
    if (key === "Home") this.focus = { zone: "row", number: rowNumbers[0]! };
    else if (key === "End") this.focus = { zone: "row", number: rowNumbers[rowNumbers.length - 1]! };
    else if (key === "ArrowDown") {
      const next = rowNumbers[(index + 1) % rowNumbers.length]!;
      this.focus = { zone: "row", number: next };
    } else if (key === "ArrowUp") {
      const next = rowNumbers[(index - 1 + rowNumbers.length) % rowNumbers.length]!;
      this.focus = { zone: "row", number: next };
    }
  }

  private snapList(rowNumbers: readonly number[]) {
    this.motion = null;
    this.screen = "list";
    this.selectedNumber = null;
    this.focus = firstRowFocus(rowNumbers);
  }
}

function firstRowFocus(rowNumbers: readonly number[]): BoardFocus | null {
  const number = rowNumbers[0];
  return number == null ? null : { zone: "row", number };
}

function isBoardNavKey(key: string): boolean {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End" || key === "Enter" || key === " ";
}
