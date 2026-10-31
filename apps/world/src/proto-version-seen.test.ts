import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSeenVersion, isPrototypeUnseen, markPrototypeSeen, unseenSlugs } from "./proto-version-seen";

describe("proto-version-seen", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    });
  });

  it("marca versiones vistas y detecta novedades", () => {
    expect(isPrototypeUnseen("chispa", "0.5.0")).toBe(true);
    markPrototypeSeen("chispa", "0.5.0");
    expect(getSeenVersion("chispa")).toBe("0.5.0");
    expect(isPrototypeUnseen("chispa", "0.5.0")).toBe(false);
    expect(isPrototypeUnseen("chispa", "0.6.0")).toBe(true);
  });

  it("lista slugs con cambios pendientes", () => {
    const list = unseenSlugs([
      { slug: "a", version: "1" },
      { slug: "b", version: "2" },
    ]);
    expect(list).toEqual(["a", "b"]);
    markPrototypeSeen("a", "1");
    expect(unseenSlugs([{ slug: "a", version: "1" }, { slug: "b", version: "2" }])).toEqual(["b"]);
  });
});
