import { describe, expect, it } from "vitest";
import { dialogueSpeakerName } from "./dialogue";
import { emphasisPlain, lineRuns } from "./dialogue-emphasis";
import { chooseScript, loungeScript, scriptNode, startScript, type DialogueScript } from "./dialogue-script";
import { lineDurationMs } from "./dialogue-type";
import { LOUNGE_NPCS } from "./lounge-layout";

function joined(script: DialogueScript): string {
  return Object.values(script.nodes)
    .map((node) => emphasisPlain(node.text))
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
    expect(emphasisPlain(scriptNode(start).text)).toContain("a medias");
    const halves = chooseScript(start, "choice-remolon-halves");
    expect(halves).not.toBe("close");
    if (halves === "close") return;
    expect(emphasisPlain(scriptNode(halves).text)).toContain("Croquis");
    expect(chooseScript(halves, "choice-remolon-stay")).toBe("close");
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

  it("da a cada persona un tema distinto y reserva el laboratorio a Croquis", () => {
    const themes: Record<string, RegExp[]> = {
      remolon: [/tele/i, /a medias/],
      brasa: [/prototipo/i, /Glotón/],
      naipe: [/apuest/, /carta/i],
      croquis: [/cómo nace una propuesta/i, /punto de encuentro/, /una sola máquina/i],
    };
    const onlyCroquis = [/punto de encuentro/, /potencial/, /creatividad/, /mundos, apps y juegos/, /máquina/i];
    const labels = new Set<string>();
    for (const npc of LOUNGE_NPCS) {
      const script = loungeScript(npc.id)!;
      const text = joined(script);
      for (const theme of themes[npc.id]!) expect(text, npc.id).toMatch(theme);
      expect(text, npc.id).not.toMatch(/máquinas|maquinas/i);
      expect(text, npc.id).not.toMatch(/github|iframe|navegador|pull request|cursor/i);
      if (npc.id === "croquis") {
        expect(text).toMatch(/amigos/);
        expect(text).toMatch(/colabor/);
        expect(text).toContain("yo la dejo");
      } else {
        for (const phrase of onlyCroquis) expect(text, npc.id).not.toMatch(phrase);
      }
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
          expect(labels.has(choice.label), choice.label).toBe(false);
          labels.add(choice.label);
          if (choice.next) pending.push(choice.next);
        }
      }
      expect([...seen].sort(), npc.id).toEqual(Object.keys(script.nodes).sort());
    }
  });

  it("marca una frase corta por nodo y reserva el gesto para parte del guion", () => {
    for (const npc of LOUNGE_NPCS) {
      const script = loungeScript(npc.id)!;
      let cues = 0;
      for (const node of Object.values(script.nodes)) {
        const { plain, runs } = lineRuns(node.text);
        const marks = runs.filter((run) => run.kind);
        expect(marks, npc.id).toHaveLength(1);
        expect(marks[0]!.text.length, npc.id).toBeLessThanOrEqual(24);
        expect(plain, npc.id).not.toMatch(/[{}]/);
        expect(lineDurationMs(plain), npc.id).toBeLessThan(6500);
        if (node.cue) cues += 1;
      }
      expect(cues, npc.id).toBeGreaterThanOrEqual(1);
      expect(cues, npc.id).toBeLessThan(Object.keys(script.nodes).length);
    }
  });
});
