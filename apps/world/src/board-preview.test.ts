import { describe, expect, it } from "vitest";
import { pagesPreviewUrl, previewActions } from "./board-preview";
import type { ProposalStatusItem } from "./proposals-status-api";

function item(partial: Partial<ProposalStatusItem> & Pick<ProposalStatusItem, "number" | "title">): ProposalStatusItem {
  return {
    kind: "propuesta",
    slug: null,
    phase: "preview_lista",
    updatedAt: "2026-03-02T00:00:00Z",
    ...partial,
  };
}

describe("preview de la pizarra", () => {
  it("acepta el host de Pages y el subdominio de preview", () => {
    expect(pagesPreviewUrl("https://preview-test.proto-lab-3k6.pages.dev")).toBe(
      "https://preview-test.proto-lab-3k6.pages.dev/",
    );
    expect(pagesPreviewUrl("https://proto-lab-3k6.pages.dev/protos/chispa/")).toBe(
      "https://proto-lab-3k6.pages.dev/protos/chispa/",
    );
  });

  it("rechaza otros orígenes y esquemas", () => {
    expect(pagesPreviewUrl("http://preview-test.proto-lab-3k6.pages.dev")).toBeNull();
    expect(pagesPreviewUrl("https://evil.example/?x=proto-lab-3k6.pages.dev")).toBeNull();
    expect(pagesPreviewUrl("https://notproto-lab-3k6.pages.dev")).toBeNull();
    expect(pagesPreviewUrl("javascript:alert(1)")).toBeNull();
    expect(pagesPreviewUrl("")).toBeNull();
    expect(pagesPreviewUrl(undefined)).toBeNull();
  });

  it("solo lista propuestas que ya traen previewUrl", () => {
    const actions = previewActions([
      item({ number: 7, title: "Cometa lunar" }),
      item({
        number: 8,
        title: "Chispas más rápidas",
        previewUrl: "https://preview-test.proto-lab-3k6.pages.dev",
      }),
      item({
        number: 9,
        title: "Fuera",
        previewUrl: "https://example.com/demo",
      }),
    ]);
    expect(actions).toEqual([
      {
        number: 8,
        title: "Chispas más rápidas",
        href: "https://preview-test.proto-lab-3k6.pages.dev/",
      },
    ]);
  });
});
