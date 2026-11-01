import { afterEach, describe, expect, it, vi } from "vitest";
import { boardDoodleIds } from "./proposals-board-chalk";
import { BOARD_MOTION_MS } from "./proposals-board-session";
import type { ProposalStatusItem } from "./proposals-status-api";

const shots = vi.hoisted(() => ({
  detail: [] as { text: number; back: number | null; action: number | null; actionDraw: number | null }[],
  list: [] as ({ progress: number } | null)[][],
}));

vi.mock("three", () => ({
  CanvasTexture: class {
    colorSpace: string | null = null;
    minFilter: unknown = null;
    magFilter: unknown = null;
    needsUpdate = false;
    dispose() {}
  },
  LinearFilter: 1006,
  SRGBColorSpace: "srgb",
}));

vi.mock("./proposals-board-detail", async () => {
  const actual = await vi.importActual<typeof import("./proposals-board-detail")>("./proposals-board-detail");
  return {
    ...actual,
    paintDetailBoard: (
      context: CanvasRenderingContext2D,
      model: Parameters<typeof actual.paintDetailBoard>[1],
      appearance: Parameters<typeof actual.paintDetailBoard>[2],
      emphasis: Parameters<typeof actual.paintDetailBoard>[3],
    ) => {
      shots.detail.push({
        text: appearance.text,
        back: emphasis.back,
        action: emphasis.action,
        actionDraw: emphasis.actionDraw,
      });
      return actual.paintDetailBoard(context, model, appearance, emphasis);
    },
    paintListAffordances: (
      context: CanvasRenderingContext2D,
      layouts: Parameters<typeof actual.paintListAffordances>[1],
      rows: Parameters<typeof actual.paintListAffordances>[2],
      markOf: Parameters<typeof actual.paintListAffordances>[3],
    ) => {
      shots.list.push(
        layouts.map((layout) => {
          const mark = markOf(layout.number);
          return mark ? { progress: mark.progress } : null;
        }),
      );
      return actual.paintListAffordances(context, layouts, rows, markOf);
    },
  };
});

import { createWhiteboardStatus } from "./whiteboard-status";

const items: ProposalStatusItem[] = [
  {
    number: 7,
    title: "Publicada",
    kind: "propuesta",
    slug: "chispa",
    phase: "publicada",
    updatedAt: "2026-04-01T00:00:00.000Z",
  },
  {
    number: 8,
    title: "Preview",
    kind: "propuesta",
    slug: "chispa",
    phase: "preview_lista",
    updatedAt: "2026-04-02T00:00:00.000Z",
    previewUrl: "https://preview-test.proto-lab-3k6.pages.dev/",
  },
];

function installCanvas() {
  const state: Record<string, unknown> = {
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    font: "16px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    lineCap: "butt",
    lineJoin: "miter",
  };
  const context = new Proxy(state, {
    get(target, prop) {
      if (prop === "measureText") {
        return (text: string) => {
          const width = String(text).length * 8;
          return {
            width,
            actualBoundingBoxLeft: 1,
            actualBoundingBoxRight: width,
            actualBoundingBoxAscent: 18,
            actualBoundingBoxDescent: 4,
          };
        };
      }
      if (typeof prop === "symbol") return undefined;
      if (prop in target) return target[prop as string];
      return () => {};
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  });
  vi.stubGlobal("document", {
    createElement() {
      return {
        width: 0,
        height: 0,
        dataset: {},
        style: {},
        className: "",
        setAttribute() {},
        remove() {},
        addEventListener() {},
        getContext() {
          return context;
        },
      };
    },
  });
}

describe("trazos de énfasis al cambiar de pantalla", () => {
  let now = 0;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    shots.detail.length = 0;
    shots.list.length = 0;
  });

  it("la pantalla nueva aparece sin trazo y la animación sale de cero", () => {
    installCanvas();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    now = 5_000;
    const board = createWhiteboardStatus({
      reducedMotion: false,
      interactive: true,
      knownSlugs: ["chispa"],
    });
    board.setItems(items, false);
    now = 5_900;
    board.tick(now);
    expect(board.getPhase()).toBe("live");

    now = 7_000;
    board.selectRow(8);
    expect(board.getUi().moving).toBe(true);

    const incomingFrom = shots.detail.length;
    now = 7_500;
    board.tick(now);
    const incoming = shots.detail.slice(incomingFrom).filter((shot) => shot.text > 0.02);
    expect(incoming.length).toBeGreaterThan(0);
    for (const shot of incoming) {
      expect(shot.back).toBe(0);
      expect(shot.action == null || shot.action <= 0.02).toBe(true);
      expect(shot.actionDraw == null || shot.actionDraw <= 0.02).toBe(true);
    }

    now = 7_000 + BOARD_MOTION_MS;
    board.tick(now);
    expect(board.getUi().moving).toBe(false);
    expect(board.getUi().screen).toBe("detail");
    const born = shots.detail.at(-1);
    expect(born?.back).toBe(0);
    expect(born?.actionDraw).toBe(0);

    now = 7_000 + BOARD_MOTION_MS + 140;
    board.tick(now);
    const early = shots.detail.at(-1);
    expect(early?.back).toBeGreaterThan(0.02);
    expect(early?.back).toBeLessThan(1);
    expect(early?.actionDraw).toBeGreaterThan(0.02);
    expect(early?.actionDraw).toBeLessThan(1);

    now = 7_000 + BOARD_MOTION_MS + 280;
    board.tick(now);
    const later = shots.detail.at(-1);
    expect(later?.back).toBeGreaterThan(early?.back ?? 1);
    expect(later?.actionDraw).toBeGreaterThan(early?.actionDraw ?? 1);
    expect(later?.back).toBeLessThan(1);

    now = 8_200;
    board.handleKey("ArrowDown");
    const onAction = shots.detail.at(-1);
    expect(onAction?.back).toBeNull();
    expect(onAction?.actionDraw).toBe(1);
    board.handleKey("ArrowUp");

    const listFrom = shots.list.length;
    now = 9_000;
    expect(board.handleKey("Escape")).toBe(true);
    const leaving = shots.detail.at(-1);
    expect(leaving?.text).toBe(1);
    expect(leaving?.back).toBe(1);
    expect(leaving?.actionDraw).toBe(1);
    now = 9_000 + BOARD_MOTION_MS;
    board.tick(now);
    expect(board.getUi().screen).toBe("list");
    const listed = shots.list.slice(listFrom);
    expect(listed.length).toBeGreaterThan(0);
    const focused = listed[0]!.filter((mark): mark is { progress: number } => mark != null);
    expect(focused).toHaveLength(1);
    expect(focused[0]!.progress).toBe(0);

    now = 9_000 + BOARD_MOTION_MS + 140;
    board.tick(now);
    const listedLater = shots.list.at(-1)!.filter((mark): mark is { progress: number } => mark != null);
    expect(listedLater[0]!.progress).toBeGreaterThan(0.02);
    expect(listedLater[0]!.progress).toBeLessThan(1);

    now = 11_000;
    board.selectRow(7);
    const againFrom = shots.detail.length;
    now = 11_500;
    board.tick(now);
    const again = shots.detail.slice(againFrom).filter((shot) => shot.text > 0.02);
    expect(again.length).toBeGreaterThan(0);
    for (const shot of again) {
      expect(shot.back).toBe(0);
      expect(shot.actionDraw == null || shot.actionDraw <= 0.02).toBe(true);
    }

    now = 11_000 + BOARD_MOTION_MS;
    board.tick(now);
    const againBorn = shots.detail.at(-1);
    expect(againBorn?.back).toBe(0);
    expect(againBorn?.actionDraw).toBe(0);
    expect(againBorn?.actionDraw).not.toBe(1);

    board.dispose();
  });

  it("al salir de la vista la escena conserva los dibujos de esa vista", () => {
    installCanvas();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const board = createWhiteboardStatus({
      reducedMotion: true,
      knownSlugs: ["chispa"],
    });
    board.setItems(items, false);
    expect(board.getPhase()).toBe("live");
    expect(board.getUi().interactive).toBe(false);

    board.setInteractive(true);
    const inView = boardDoodleIds().join("+");
    expect(inView).toBe("gatito+avion");
    expect(board.getUi().interactive).toBe(true);

    board.selectRow(8);
    expect(board.getUi().screen).toBe("detail");
    expect(boardDoodleIds().join("+")).toBe(inView);

    board.setInteractive(false);
    expect(board.getUi().interactive).toBe(false);
    expect(board.getUi().screen).toBe("list");
    expect(boardDoodleIds().join("+")).toBe(inView);

    random.mockReturnValue(0.99);
    board.setInteractive(true);
    expect(boardDoodleIds().join("+")).toBe("caracol+barco");

    board.dispose();
  });
});
