import { describe, expect, it } from "vitest";
import { dialogueSpeakerName } from "./dialogue";
import { chooseScript, loungeScript, scriptNode, startScript, type DialogueScript } from "./dialogue-script";
import { LOUNGE_NPCS } from "./lounge-layout";

function joined(script: DialogueScript): string {
  return Object.values(script.nodes)
    .map((node) => node.text)
    .join("\n");
}

describe("guion de diálogo", () => {
  it("conserva al Inventor como hablante de su propia sesión", () => {
    expect(dialogueSpeakerName({ kind: "inventor" })).toBe("Inventor");
    expect(dialogueSpeakerName({ kind: "script", name: "Brasa" })).toBe("Brasa");
  });

  it("avanza por las opciones y cierra cuando no hay siguiente nodo", () => {
    const script = loungeScript("remolon");
    expect(script).toBeTruthy();
    const start = startScript(script!);
    expect(scriptNode(start).text).toContain("Remolón");
    const lab = chooseScript(start, "choice-remolon-lab");
    expect(lab).not.toBe("close");
    if (lab === "close") return;
    expect(scriptNode(lab).text).toContain("punto de encuentro");
    expect(chooseScript(lab, "choice-remolon-stay")).toBe("close");
  });

  it("da a cada persona del rincón un guion con su nombre", () => {
    expect(LOUNGE_NPCS.map((npc) => npc.id).sort()).toEqual(Object.keys({
      remolon: true,
      brasa: true,
      naipe: true,
      croquis: true,
    }).sort());
    for (const npc of LOUNGE_NPCS) {
      const script = loungeScript(npc.id);
      expect(script?.speaker.name, npc.id).toBe(npc.name);
      expect(script?.speaker.id, npc.id).toBe(npc.id);
      const hello = scriptNode(startScript(script!));
      expect(hello.choices.length, npc.id).toBeGreaterThanOrEqual(2);
      expect(hello.choices.some((choice) => !choice.next), npc.id).toBe(true);
    }
  });

  it("explica el laboratorio y una sola máquina, sin salir del papel", () => {
    for (const npc of LOUNGE_NPCS) {
      const script = loungeScript(npc.id)!;
      const text = joined(script);
      expect(text, npc.id).toContain("punto de encuentro");
      expect(text, npc.id).toContain("potencial");
      expect(text, npc.id).toContain("creatividad");
      expect(text, npc.id).toMatch(/amigos/);
      expect(text, npc.id).toMatch(/colabor/);
      expect(text, npc.id).toMatch(/mundos, apps y juegos/);
      expect(text, npc.id).toContain("máquina");
      expect(text, npc.id).not.toMatch(/máquinas/i);
      expect(text, npc.id).not.toMatch(/maquinas/i);
      expect(text, npc.id).not.toMatch(/github|iframe|navegador|pull request|cursor/i);
      const seen = new Set<string>();
      const pending = [script.start];
      while (pending.length > 0) {
        const id = pending.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const node = script.nodes[id];
        expect(node, `${npc.id}:${id}`).toBeTruthy();
        const ids = new Set<string>();
        for (const choice of node!.choices) {
          expect(ids.has(choice.id), choice.id).toBe(false);
          ids.add(choice.id);
          if (choice.next) pending.push(choice.next);
        }
      }
      expect([...seen].sort()).toEqual(Object.keys(script.nodes).sort());
    }
  });
});
