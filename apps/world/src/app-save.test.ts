import { describe, expect, it } from "vitest";
import { APP_SAVE_PREFIX, SAVE_LIMITS, appStorageKey, createAppSave, createSaveBridge, replyToSave, type SaveLimits } from "./app-save";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
  };
}

const tiny: SaveLimits = { maxKeyLength: 8, maxKeys: 2, maxValueBytes: 8, maxSlugBytes: 40 };

describe("guardado por slug", () => {
  it("guarda, lee y borra en la bolsa del slug", () => {
    const storage = memoryStorage();
    const save = createAppSave(storage, "asset-lab");
    expect(save.get("partida")).toBeNull();
    save.set("partida", "noche-1");
    expect(save.get("partida")).toBe("noche-1");
    expect(storage.getItem(appStorageKey("asset-lab"))).toContain("noche-1");
    expect(storage.getItem("proto-lab:seen-versions")).toBeNull();
    save.remove("partida");
    expect(save.get("partida")).toBeNull();
    expect(storage.getItem(appStorageKey("asset-lab"))).toBeNull();
  });

  it("aísla un slug de otro", () => {
    const storage = memoryStorage();
    const first = createAppSave(storage, "asset-lab");
    const second = createAppSave(storage, "chispa");
    first.set("partida", "una");
    second.set("partida", "otra");
    expect(first.get("partida")).toBe("una");
    expect(second.get("partida")).toBe("otra");
    expect(appStorageKey("asset-lab").startsWith(APP_SAVE_PREFIX)).toBe(true);
  });

  it("rechaza claves raras y corta el cupo", () => {
    const storage = memoryStorage();
    const save = createAppSave(storage, "demo", tiny);
    expect(() => save.set("../x", "a")).toThrow(/invalid/);
    expect(() => save.set("__proto__", "a")).toThrow(/invalid/);
    expect(() => save.set("clave", "demasiado-larga")).toThrow(/quota/);
    save.set("a", "1");
    save.set("b", "2");
    expect(() => save.set("c", "3")).toThrow(/quota/);
    expect(save.get("a")).toBe("1");
    expect(save.get("c")).toBeNull();
  });

  it("no escribe si la bolsa no cabe", () => {
    const storage = memoryStorage();
    const save = createAppSave(storage, "demo", { ...tiny, maxValueBytes: 20, maxSlugBytes: 20, maxKeys: 4 });
    save.set("a", "1234");
    expect(() => save.set("b", "12345678")).toThrow(/quota/);
    expect(save.get("a")).toBe("1234");
    expect(save.get("b")).toBeNull();
  });

  it("responde al mensaje y ignora otra ventana", () => {
    const storage = memoryStorage();
    const bridge = createSaveBridge("demo", storage);
    const postMessage = viPost();
    const frame = { contentWindow: { postMessage: postMessage.fn } } as unknown as HTMLIFrameElement;
    bridge.onMessage({ source: frame.contentWindow, data: { source: "proto-lab", type: "alive" } } as MessageEvent, frame);
    expect(postMessage.calls).toHaveLength(0);
    bridge.onMessage(
      { source: {}, data: { source: "proto-lab", type: "save", id: 1, op: "set", key: "partida", value: "x" } } as MessageEvent,
      frame,
    );
    expect(postMessage.calls).toHaveLength(0);
    expect(storage.getItem(appStorageKey("demo"))).toBeNull();
    bridge.onMessage(
      { source: frame.contentWindow, data: { source: "proto-lab", type: "save", id: 4, op: "set", key: "partida", value: "noche" } } as MessageEvent,
      frame,
    );
    bridge.onMessage(
      { source: frame.contentWindow, data: { source: "proto-lab", type: "save", id: 5, op: "get", key: "partida" } } as MessageEvent,
      frame,
    );
    expect(postMessage.calls[1]?.value).toBe("noche");
    const direct = replyToSave(createAppSave(storage, "demo"), { source: "proto-lab", type: "save", id: 9, op: "get", key: 12 });
    expect(direct?.ok).toBe(false);
  });
});

function viPost() {
  const calls: Array<{ value: string | null; error?: string }> = [];
  return {
    calls,
    fn: (message: { ok?: boolean; value?: string | null; error?: string }) => {
      calls.push({ value: message.value ?? null, error: message.error });
    },
  };
}

describe("cifras publicadas", () => {
  it("deja 256 KiB por slug y 32 KiB por valor", () => {
    expect(SAVE_LIMITS.maxSlugBytes).toBe(256 * 1024);
    expect(SAVE_LIMITS.maxValueBytes).toBe(32 * 1024);
    expect(SAVE_LIMITS.maxKeys).toBe(32);
    expect(SAVE_LIMITS.maxKeyLength).toBe(64);
  });
});
