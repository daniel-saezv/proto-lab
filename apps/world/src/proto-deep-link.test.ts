import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPrototypeSlugFromHash } from "./proto-deep-link";

describe("proto-deep-link", () => {
  it("lee el slug en el hash", () => {
    expect(readPrototypeSlugFromHash("#p=chispa")).toBe("chispa");
    expect(readPrototypeSlugFromHash("#p=mi%20proto")).toBe("mi proto");
    expect(readPrototypeSlugFromHash("#otro")).toBeNull();
    expect(readPrototypeSlugFromHash("")).toBeNull();
  });
});

describe("writePrototypeHash", () => {
  beforeEach(() => {
    vi.stubGlobal("history", { replaceState: vi.fn(), state: null });
    vi.stubGlobal("location", { pathname: "/", search: "", hash: "" });
  });

  it("usa replaceState para actualizar el hash", async () => {
    const { writePrototypeHash } = await import("./proto-deep-link");
    writePrototypeHash("chispa");
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/#p=chispa");
    (location as { hash: string }).hash = "#p=chispa";
    writePrototypeHash(null);
    expect(history.replaceState).toHaveBeenLastCalledWith(null, "", "/");
  });
});
