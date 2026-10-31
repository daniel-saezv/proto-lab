import { describe, expect, it } from "vitest";
import {
  LAB_ROOT_HREF,
  boardNavAction,
  formatBoardDate,
  kindDetailLabel,
  pagesPreviewUrl,
  phaseDetailLabel,
} from "./proposals-board-actions";
import type { ProposalStatusItem } from "./proposals-status-api";

function item(partial: Partial<ProposalStatusItem> & Pick<ProposalStatusItem, "number" | "title" | "phase">): ProposalStatusItem {
  return {
    kind: "propuesta",
    slug: null,
    updatedAt: "2026-03-02T00:00:00Z",
    ...partial,
  };
}

describe("acciones del tablón", () => {
  it("acepta el host de Pages y el subdominio de preview", () => {
    expect(pagesPreviewUrl("https://preview-test.proto-lab-3k6.pages.dev")).toBe(
      "https://preview-test.proto-lab-3k6.pages.dev/",
    );
    expect(pagesPreviewUrl("https://proto-lab-3k6.pages.dev/protos/chispa/")).toBe(
      "https://proto-lab-3k6.pages.dev/protos/chispa/",
    );
    expect(pagesPreviewUrl(LAB_ROOT_HREF)).toBe(LAB_ROOT_HREF);
  });

  it("rechaza otros orígenes y esquemas", () => {
    expect(pagesPreviewUrl("http://preview-test.proto-lab-3k6.pages.dev")).toBeNull();
    expect(pagesPreviewUrl("https://evil.example/?x=proto-lab-3k6.pages.dev")).toBeNull();
    expect(pagesPreviewUrl("https://notproto-lab-3k6.pages.dev")).toBeNull();
    expect(pagesPreviewUrl("javascript:alert(1)")).toBeNull();
    expect(pagesPreviewUrl("")).toBeNull();
    expect(pagesPreviewUrl(undefined)).toBeNull();
  });

  it("en preview lista abre la URL de la preview", () => {
    expect(
      boardNavAction(
        item({
          number: 8,
          title: "Chispas",
          phase: "preview_lista",
          previewUrl: "https://preview-test.proto-lab-3k6.pages.dev",
        }),
        ["chispa"],
      ),
    ).toEqual({
      kind: "preview",
      label: "Probar la preview",
      href: "https://preview-test.proto-lab-3k6.pages.dev/",
    });
  });

  it("en preview lista sin URL válida no hay acción", () => {
    expect(
      boardNavAction(item({ number: 8, title: "Chispas", phase: "preview_lista", previewUrl: "https://example.com" }), []),
    ).toBeNull();
    expect(boardNavAction(item({ number: 8, title: "Chispas", phase: "preview_lista" }), [])).toBeNull();
  });

  it("en publicada con slug del catálogo entra al prototipo", () => {
    expect(
      boardNavAction(
        item({
          number: 9,
          title: "Chispas",
          phase: "publicada",
          slug: "Chispa",
          kind: "iteracion",
          previewUrl: "https://proto-lab-3k6.pages.dev",
        }),
        ["chispa"],
      ),
    ).toEqual({ kind: "lab-prototype", label: "Ver en el lab", slug: "chispa" });
  });

  it("en publicada sin slug identificable va a la raíz del lab", () => {
    expect(
      boardNavAction(
        item({
          number: 10,
          title: "Cometa",
          phase: "publicada",
          slug: "cometa",
          previewUrl: "https://proto-lab-3k6.pages.dev",
        }),
        ["chispa"],
      ),
    ).toEqual({ kind: "lab-root", label: "Ver en el lab", href: LAB_ROOT_HREF });
    expect(boardNavAction(item({ number: 11, title: "Suelta", phase: "publicada" }), ["chispa"])).toEqual({
      kind: "lab-root",
      label: "Ver en el lab",
      href: LAB_ROOT_HREF,
    });
  });

  it("el resto de fases solo tienen detalle", () => {
    for (const phase of ["recibida", "aprobada", "en_curso", "pr_abierto", "ci_en_curso", "ci_correcta", "ci_con_fallos", "cerrada_sin_hacer"] as const) {
      expect(
        boardNavAction(
          item({
            number: 1,
            title: "T",
            phase,
            slug: "chispa",
            previewUrl: "https://preview-test.proto-lab-3k6.pages.dev",
          }),
          ["chispa"],
        ),
      ).toBeNull();
    }
  });

  it("etiqueta fase y tipo", () => {
    expect(phaseDetailLabel("preview_lista")).toBe("Preview lista");
    expect(phaseDetailLabel("publicada")).toBe("Publicada");
    expect(kindDetailLabel("iteracion")).toBe("Iteración");
    expect(kindDetailLabel("propuesta")).toBe("Propuesta");
    expect(formatBoardDate("2026-03-02T00:00:00Z")).toContain("2026");
    expect(formatBoardDate("no-fecha")).toBeNull();
  });
});
