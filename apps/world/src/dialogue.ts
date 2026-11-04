import type { DialogueCue } from "./dialogue-cues";
import { inventorChoices, phaseAfterWorkshopTrip, type ChoiceAction } from "./dialogue-flow";
import { lineRuns, type EmphasisKind, type LineRun } from "./dialogue-emphasis";
import { INVENTOR_RESULT_OK, inventorSpeech, type DialoguePhase } from "./dialogue-speech";
import { chooseScript, scriptNode, startScript, type DialogueScript, type ScriptCursor } from "./dialogue-script";
import { typeDelayMs } from "./dialogue-type";
import { LIMITS } from "./limits";
import type { CatalogEntry, ProposalDraft, SubmitOutcome } from "./types";
import { postWorkshop } from "./workshop-api";
import {
  WORKSHOP_UI,
  WORKSHOP_UTTERANCE_MAX,
  workshopCounter,
  workshopDiffLine,
  workshopFailedChoices,
  workshopKindLabel,
  workshopSpeech,
  workshopSummaryChoices,
  workshopSummaryError,
  workshopTurnChoices,
  type WorkshopDraftView,
  type WorkshopRequest,
  type WorkshopResult,
  type WorkshopScreen,
} from "./workshop-view";

export const INVENTOR_NAME = "Inventor";

export function dialogueSpeakerName(session: { kind: "inventor" } | { kind: "script"; name: string }): string {
  return session.kind === "inventor" ? INVENTOR_NAME : session.name;
}

type Mode = "propuesta" | "iteracion";

type Phase = DialoguePhase | { name: "done"; text: string; outcome: string };

type SpeakerSession = { kind: "inventor" } | { kind: "script"; cursor: ScriptCursor };

type Choice = { id: string; label: string; run: () => void };

const RESULT: Record<string, string> = {
  ok: INVENTOR_RESULT_OK,
  limit: "Hoy el cuaderno ya no da más de sí: has dejado varias ideas y conviene dejarlas reposar. Vuelve mañana.",
  unauthorized: "No consigo reconocerte. Esta puerta solo se abre con el pase del laboratorio. Entra desde el enlace del grupo y vuelve a hablarme.",
  config: "El cuaderno está, pero falta la llave del taller. El dueño tiene que terminar de configurarlo.",
  validation: "Algo del texto no cabe en el cuaderno. Dímelo un poco más claro.",
  github: "He intentado dejar la nota y el tablón no ha respondido. Prueba otra vez dentro de un rato.",
  network: "No llego al taller. Cuando vuelva la conexión, me lo repites.",
};

export function createDialogue(options: {
  root: HTMLElement;
  prototypes: CatalogEntry[];
  instant: boolean;
  submit: (draft: ProposalDraft) => Promise<SubmitOutcome>;
  onShowInstallHelp?: () => void;
  onOpen: () => void;
  onClose: () => void;
  /** Viaje al escritorio o de vuelta. `done` abre la fase siguiente. */
  onWorkshopTravel?: (dest: "desk" | "home", done: () => void) => void;
  /** El diálogo se cierra con el Inventor fuera de su sitio. */
  onInventorReset?: () => void;
  /** Encuadre del hablante. `null` al cerrar. */
  onFocus?: (focus: { speakerId: string; cue: DialogueCue | null } | null) => void;
  /** Un énfasis acaba de revelarse: gesto corto del personaje. */
  onEmphasis?: () => void;
  /** Turno del taller. Si no llega, se usa `postWorkshop`. */
  workshop?: (request: WorkshopRequest) => Promise<WorkshopResult>;
  /** `talk` mira a cámara; `work` usa la mesa; `off` al irse. */
  onWorkshopBeat?: (beat: "off" | "talk" | "work") => void;
}) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let phase: Phase = { name: "greet" };
  let session: SpeakerSession = { kind: "inventor" };
  let draft: ProposalDraft = { kind: "propuesta", title: "", description: "" };
  let token = 0;
  let open = false;
  let atDesk = false;
  let traveling = false;
  let originalNote: ProposalDraft | null = null;
  let workshopSession: string | null = null;
  let workshopScreen: WorkshopScreen | null = null;
  let workshopCorrecting = false;
  let nextNotice: string | undefined;
  const askWorkshopRemote = options.workshop ?? postWorkshop;

  const viewport = window.visualViewport;
  const liftKeyboard = () => {
    if (!viewport || !options.root.classList.contains("is-workshop")) {
      options.root.style.removeProperty("--workshop-kb");
      return;
    }
    const overlap = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    options.root.style.setProperty("--workshop-kb", `${Math.round(overlap)}px`);
  };
  viewport?.addEventListener("resize", liftKeyboard);
  viewport?.addEventListener("scroll", liftKeyboard);
  let typingFrame = 0;
  let emphTimer = 0;
  let skipTyping: (() => void) | null = null;
  const calm = options.instant || reduced;
  if (calm) options.root.classList.add("dialogue-still");

  function stopTyping() {
    if (typingFrame !== 0) cancelAnimationFrame(typingFrame);
    typingFrame = 0;
    skipTyping = null;
  }

  function flashEmphasis() {
    if (calm) return;
    delete options.root.dataset.emph;
    void options.root.offsetWidth;
    options.root.dataset.emph = "1";
    window.clearTimeout(emphTimer);
    emphTimer = window.setTimeout(() => {
      delete options.root.dataset.emph;
    }, 460);
    options.onEmphasis?.();
  }

  options.root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node) || !options.root.contains(target)) return;
    if (target instanceof Element && target.closest("button, input, textarea")) return;
    skipTyping?.();
  });

  function bumpBubble() {
    options.root.classList.remove("dialogue-arrive");
    void options.root.offsetWidth;
    options.root.classList.add("dialogue-arrive");
  }

  function activeCue(): DialogueCue | null {
    if (session.kind === "script") return scriptNode(session.cursor).cue ?? null;
    return null;
  }

  function resetDraft(kind: Mode, slug?: string) {
    draft = { kind, title: "", description: "", slug };
  }

  function speech(): string {
    if (session.kind === "script") return scriptNode(session.cursor).text;
    if (phase.name === "done") return phase.text;
    if (phase.name === "workshop" && workshopScreen) return workshopSpeech(workshopScreen);
    return inventorSpeech(phase, draft, options.prototypes);
  }

  function draftPayload(source: ProposalDraft): WorkshopDraftView {
    return {
      kind: source.kind,
      title: source.title,
      description: source.description,
      ...(source.slug ? { slug: source.slug } : {}),
    };
  }

  function restoreOriginalNote() {
    if (!originalNote) return;
    draft = { kind: originalNote.kind, title: originalNote.title, description: originalNote.description, slug: originalNote.slug };
  }

  function abandonSession() {
    const id = workshopSession;
    workshopSession = null;
    if (id) void askWorkshopRemote({ op: "abandon", sessionId: id });
  }

  function leaveDesk(message?: string) {
    restoreOriginalNote();
    abandonSession();
    workshopScreen = null;
    workshopCorrecting = false;
    options.onWorkshopBeat?.("off");
    if (message) nextNotice = message;
    beginWorkshopTrip("home");
  }

  function askWorkshop(body: WorkshopRequest) {
    const my = token;
    void askWorkshopRemote(body).then((result) => {
      if (!open || my !== token || phase.name !== "workshop") {
        if (result.sessionId) void askWorkshopRemote({ op: "abandon", sessionId: result.sessionId });
        return;
      }
      applyWorkshop(result);
    });
  }

  function beginModelTurn(body: WorkshopRequest) {
    workshopCorrecting = false;
    workshopScreen = { kind: "loading", purpose: body.op === "turn" && body.decision === "stop" ? "summary" : "model" };
    options.onWorkshopBeat?.(workshopScreen.purpose === "model" ? "work" : "talk");
    render();
    askWorkshop(body);
  }

  function applyWorkshop(result: WorkshopResult) {
    if (!result.ok) {
      if (result.restore) {
        leaveDesk(result.message);
        return;
      }
      if (result.sessionId) workshopSession = result.sessionId;
      workshopScreen = { kind: "failed", message: result.message || WORKSHOP_UI.failed };
      options.onWorkshopBeat?.("talk");
      render();
      return;
    }
    draft = { ...draft, title: result.draft.title, description: result.draft.description };
    if (result.phase === "summary") {
      workshopSession = null;
      workshopCorrecting = false;
      workshopScreen = { kind: "summary", speech: result.speech, turn: result.turn, maxTurns: result.maxTurns };
      options.onWorkshopBeat?.("talk");
      render();
      return;
    }
    workshopSession = result.sessionId ?? workshopSession;
    workshopCorrecting = false;
    workshopScreen = {
      kind: "turn",
      speech: result.speech,
      change: result.change,
      turn: result.turn,
      maxTurns: result.maxTurns,
    };
    options.onWorkshopBeat?.("talk");
    render();
  }

  function choices(): Choice[] {
    if (session.kind === "script") {
      const cursor = session.cursor;
      return scriptNode(cursor).choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        run: () => {
          const next = chooseScript(cursor, choice.id);
          if (next === "close") close();
          else {
            session = { kind: "script", cursor: next };
            render();
          }
        },
      }));
    }
    if (phase.name === "done") {
      return [{ id: "choice-close", label: "Seguir en el laboratorio", run: () => close() }];
    }
    return inventorChoices(phase, draft, options.prototypes).map((choice) => ({
      id: choice.id,
      label: choice.label,
      run: () => applyChoice(choice.action),
    }));
  }

  function applyChoice(action: ChoiceAction) {
    if (action.type === "close") {
      close();
      return;
    }
    if (action.type === "install") {
      close();
      options.onShowInstallHelp?.();
      return;
    }
    if (action.type === "send") {
      void send();
      return;
    }
    if (action.type === "trip") {
      beginWorkshopTrip(action.dest);
      return;
    }
    if (action.type === "pick") {
      draft.slug = action.slug;
      draft.kind = "iteracion";
      phase = { name: "title", mode: "iteracion" };
      render();
      return;
    }
    if (action.reset) resetDraft(action.reset);
    phase = action.phase;
    render();
  }

  function beginWorkshopTrip(dest: "desk" | "home") {
    const my = ++token;
    traveling = true;
    stopTyping();
    window.clearTimeout(emphTimer);
    options.root.hidden = true;
    const finish = () => {
      if (!open || my !== token) return;
      traveling = false;
      atDesk = dest === "desk";
      phase = phaseAfterWorkshopTrip(dest);
      if (dest === "desk") {
        originalNote = { kind: draft.kind, title: draft.title, description: draft.description, slug: draft.slug };
        workshopSession = null;
        workshopCorrecting = false;
        workshopScreen = { kind: "loading", purpose: "model" };
        options.onWorkshopBeat?.("work");
      } else {
        workshopScreen = null;
        workshopCorrecting = false;
      }
      options.root.hidden = false;
      bumpBubble();
      render();
      if (dest === "desk" && originalNote) askWorkshop({ op: "start", draft: draftPayload(originalNote) });
    };
    if (!options.onWorkshopTravel) {
      finish();
      return;
    }
    options.onWorkshopTravel(dest, finish);
  }

  function render(notice?: string) {
    const my = ++token;
    stopTyping();
    window.clearTimeout(emphTimer);
    delete options.root.dataset.emph;
    options.root.replaceChildren();
    options.root.dataset.outcome = phase.name === "done" ? phase.outcome : "";
    options.root.classList.toggle("is-workshop", phase.name === "workshop");
    if (phase.name === "workshop" && workshopScreen) options.root.dataset.workshop = workshopScreen.kind;
    else delete options.root.dataset.workshop;
    liftKeyboard();
    const pending = nextNotice;
    nextNotice = undefined;
    const banner = notice ?? pending;

    const speaker = session.kind === "script" ? session.cursor.script.speaker : { id: "inventor", name: INVENTOR_NAME };
    options.root.dataset.speaker = speaker.id;

    const portrait = document.createElement("div");
    portrait.className = speaker.id === "inventor" ? "portrait" : `portrait portrait--${speaker.id}`;
    portrait.setAttribute("aria-hidden", "true");

    const name = document.createElement("p");
    name.className = "dialogue-name";
    name.id = "dialogue-name";
    name.textContent = dialogueSpeakerName(session.kind === "script" ? { kind: "script", name: speaker.name } : { kind: "inventor" });

    const text = document.createElement("p");
    text.className = "dialogue-text";
    text.dataset.testid = "dialogue-text";
    text.setAttribute("aria-live", "polite");
    const full = banner ? `${banner}\n\n${speech()}` : speech();
    const { plain, runs } = lineRuns(full);
    const line = mountLine(text, plain, runs);

    const head = document.createElement("div");
    head.className = "dialogue-head";
    head.append(portrait, name);
    options.root.append(head, text);

    const cue = activeCue();
    if (cue) options.root.dataset.cue = cue;
    else delete options.root.dataset.cue;
    options.onFocus?.({ speakerId: speaker.id, cue });

    const finish = () => {
      if (my !== token) return;
      text.dataset.typing = "0";
      line.caret.remove();
      if (phase.name === "title" || phase.name === "body") showInput(my);
      else if (phase.name === "workshop") showWorkshop(my);
      else showChoices(my);
    };

    const reveal = (count: number, previous: number): EmphasisKind | null => {
      let crossed: EmphasisKind | null = null;
      for (const view of line.views) {
        const start = view.run.start;
        const end = view.run.end;
        const slice = plain.slice(start, Math.min(end, Math.max(start, count)));
        if (view.el.textContent !== slice) view.el.textContent = slice;
        if (view.run.kind && previous < end && count >= end) {
          view.el.classList.add("is-on");
          crossed = view.run.kind;
        }
      }
      return crossed;
    };

    if (calm) {
      reveal(plain.length, 0);
      for (const view of line.views) {
        if (view.run.kind) view.el.classList.add("is-on");
      }
      finish();
      return;
    }

    text.dataset.typing = "1";
    let shown = 0;
    let previous = 0;
    let carry = 0;
    let last = performance.now();
    let finished = false;
    const complete = (skipped: boolean) => {
      if (finished || my !== token) return;
      finished = true;
      stopTyping();
      const kind = reveal(plain.length, previous);
      if (skipped && (kind || runs.some((run) => run.kind))) flashEmphasis();
      else if (kind) flashEmphasis();
      finish();
    };
    skipTyping = () => complete(true);
    const step = (now: number) => {
      if (my !== token || finished) return;
      const budget = Math.min(50, now - last);
      last = now;
      carry += budget;
      let guard = 0;
      while (shown < plain.length && carry >= typeDelayMs(plain, shown) && guard < 6) {
        carry -= typeDelayMs(plain, shown);
        shown += 1;
        guard += 1;
      }
      const kind = reveal(shown, previous);
      previous = shown;
      if (kind) flashEmphasis();
      if (shown >= plain.length) {
        complete(false);
        return;
      }
      typingFrame = requestAnimationFrame(step);
    };
    typingFrame = requestAnimationFrame(step);
  }

  function mountLine(text: HTMLElement, plain: string, runs: LineRun[]) {
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = plain;
    const visual = document.createElement("span");
    visual.className = "dlg-visual";
    visual.setAttribute("aria-hidden", "true");
    const views: Array<{ el: HTMLElement; run: LineRun }> = [];
    for (const run of runs) {
      const el = document.createElement("span");
      el.className = run.kind ? `dlg-em dlg-em--${run.kind}` : "dlg-run";
      visual.append(el);
      views.push({ el, run });
    }
    const caret = document.createElement("span");
    caret.className = "dlg-caret";
    caret.setAttribute("aria-hidden", "true");
    visual.append(caret);
    text.append(sr, visual);
    return { views, caret };
  }

  function addChoice(id: string, label: string, run: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dialogue-choice";
    button.dataset.testid = id;
    button.textContent = label;
    button.addEventListener("click", run);
    options.root.append(button);
  }

  function showWorkshop(my: number) {
    if (my !== token || phase.name !== "workshop" || !workshopScreen) return;
    const screen = workshopScreen;
    if (screen.kind === "loading") {
      addChoice("choice-workshop-back", "Volver a mi nota", () => leaveDesk());
      focusWorkshop(options.root.querySelector("button"));
      return;
    }
    if (screen.kind === "failed") {
      for (const choice of workshopFailedChoices()) {
        addChoice(choice.id, choice.label, () => {
          if (choice.id === "choice-workshop-back") {
            leaveDesk();
            return;
          }
          if (workshopSession) beginModelTurn({ op: "turn", sessionId: workshopSession, decision: "retry" });
          else if (originalNote) beginModelTurn({ op: "start", draft: draftPayload(originalNote) });
          else leaveDesk(WORKSHOP_UI.closed);
        });
      }
      focusWorkshop(options.root.querySelector("button"));
      return;
    }
    if (screen.kind === "summary") {
      const counter = document.createElement("p");
      counter.className = "workshop-counter";
      counter.dataset.testid = "workshop-counter";
      counter.textContent = workshopCounter(screen.turn, screen.maxTurns);
      const kind = document.createElement("p");
      kind.className = "workshop-kind";
      kind.dataset.testid = "workshop-kind";
      kind.textContent = workshopKindLabel(draft);
      const title = document.createElement("input");
      title.type = "text";
      title.className = "dialogue-input";
      title.dataset.testid = "workshop-title";
      title.maxLength = LIMITS.titleMax;
      title.autocomplete = "off";
      title.spellcheck = true;
      title.setAttribute("aria-label", "Título");
      title.value = draft.title;
      const description = document.createElement("textarea");
      description.className = "dialogue-input";
      description.dataset.testid = "workshop-description";
      description.rows = 3;
      description.maxLength = LIMITS.descriptionMax;
      description.autocomplete = "off";
      description.spellcheck = true;
      description.setAttribute("aria-label", "Descripción");
      description.value = draft.description;
      const diff = document.createElement("p");
      diff.className = "workshop-diff";
      diff.dataset.testid = "workshop-diff";
      const paintDiff = () => {
        diff.textContent = workshopDiffLine(originalNote ?? draft, { title: title.value, description: description.value });
      };
      paintDiff();
      title.addEventListener("input", paintDiff);
      description.addEventListener("input", paintDiff);
      options.root.append(counter, kind, title, description, diff);
      const submit = () => {
        const error = workshopSummaryError(title.value, description.value);
        if (error) {
          nextNotice = error;
          draft.title = title.value;
          draft.description = description.value;
          render();
          return;
        }
        draft.title = title.value.trim().replace(/\s+/g, " ");
        draft.description = description.value.trim();
        void send();
      };
      for (const choice of workshopSummaryChoices()) {
        addChoice(choice.id, choice.label, () => {
          if (choice.id === "choice-workshop-submit") submit();
          else leaveDesk();
        });
      }
      focusWorkshop(title);
      return;
    }

    const counter = document.createElement("p");
    counter.className = "workshop-counter";
    counter.dataset.testid = "workshop-counter";
    counter.textContent = workshopCounter(screen.turn, screen.maxTurns);
    options.root.append(counter);
    if (screen.change) {
      options.root.append(
        workshopCard("workshop-now", "Ahora", [draft.title, draft.description]),
        workshopCard("workshop-next", "Quedaría", [
          screen.change.title,
          screen.change.description,
          ...(screen.change.why ? [screen.change.why] : []),
        ]),
      );
    }
    let utterance: HTMLTextAreaElement | null = null;
    const needsField = workshopCorrecting || !screen.change;
    if (needsField) {
      utterance = document.createElement("textarea");
      utterance.className = "dialogue-input";
      utterance.dataset.testid = "workshop-utterance";
      utterance.rows = 2;
      utterance.maxLength = WORKSHOP_UTTERANCE_MAX;
      utterance.autocomplete = "off";
      utterance.spellcheck = true;
      utterance.setAttribute("aria-label", "Tu respuesta");
      utterance.placeholder = "Cuéntaselo al Inventor";
      options.root.append(utterance);
    }
    const say = () => {
      const value = utterance?.value.trim() ?? "";
      if (!value) {
        nextNotice = WORKSHOP_UI.needWords;
        render();
        return;
      }
      if (!workshopSession) {
        leaveDesk(WORKSHOP_UI.closed);
        return;
      }
      beginModelTurn({
        op: "turn",
        sessionId: workshopSession,
        decision: screen.change ? "correct" : "reply",
        utterance: value,
      });
    };
    utterance?.addEventListener("keydown", (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        say();
      }
    });
    const turnChoices = workshopTurnChoices({ hasChange: Boolean(screen.change), turn: screen.turn }).filter(
      (choice) => !(choice.id === "choice-workshop-correct" && workshopCorrecting),
    );
    if (needsField && !turnChoices.some((choice) => choice.id === "choice-workshop-say")) {
      turnChoices.unshift({ id: "choice-workshop-say", label: "Decir" });
    }
    for (const choice of turnChoices) {
      addChoice(choice.id, choice.label, () => {
        if (choice.id === "choice-workshop-back") {
          leaveDesk();
          return;
        }
        if (choice.id === "choice-workshop-correct") {
          workshopCorrecting = true;
          render();
          return;
        }
        if (choice.id === "choice-workshop-say") {
          say();
          return;
        }
        if (!workshopSession) {
          leaveDesk(WORKSHOP_UI.closed);
          return;
        }
        if (choice.id === "choice-workshop-accept") beginModelTurn({ op: "turn", sessionId: workshopSession, decision: "accept" });
        else if (choice.id === "choice-workshop-reject") beginModelTurn({ op: "turn", sessionId: workshopSession, decision: "reject" });
        else if (choice.id === "choice-workshop-stop") beginModelTurn({ op: "turn", sessionId: workshopSession, decision: "stop" });
      });
    }
    focusWorkshop(utterance ?? options.root.querySelector("button"));
  }

  function focusWorkshop(target: Element | null) {
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    options.root.scrollTop = 0;
  }

  function workshopCard(testId: string, title: string, lines: string[]): HTMLElement {
    const box = document.createElement("section");
    box.className = "workshop-card";
    box.dataset.testid = testId;
    const heading = document.createElement("h3");
    heading.textContent = title;
    box.append(heading);
    for (const line of lines) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      box.append(paragraph);
    }
    return box;
  }

  function showChoices(my: number) {
    if (my !== token) return;
    for (const choice of choices()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dialogue-choice";
      button.dataset.testid = choice.id;
      button.textContent = choice.label;
      button.addEventListener("click", choice.run);
      options.root.append(button);
    }
    const first = options.root.querySelector("button");
    if (first instanceof HTMLButtonElement) first.focus();
  }

  function showInput(my: number) {
    if (my !== token || (phase.name !== "title" && phase.name !== "body")) return;
    const multiline = phase.name === "body";
    const field = document.createElement(multiline ? "textarea" : "input");
    if (field instanceof HTMLInputElement) field.type = "text";
    if (field instanceof HTMLTextAreaElement) field.rows = 3;
    field.className = "dialogue-input";
    field.dataset.testid = "dialogue-input";
    field.maxLength = phase.name === "title" ? LIMITS.titleMax : LIMITS.descriptionMax;
    field.autocomplete = "off";
    field.spellcheck = true;
    field.placeholder = phase.name === "title" ? "Un nombre corto" : "Cuéntaselo al Inventor";
    field.setAttribute("aria-label", phase.name === "title" ? "Título" : "Descripción");
    field.enterKeyHint = "send";
    field.value = phase.name === "title" ? draft.title : draft.description;

    const say = document.createElement("button");
    say.type = "button";
    say.className = "dialogue-choice";
    say.dataset.testid = "dialogue-send";
    say.textContent = "Decir";

    const accept = () => {
      const value = field.value;
      const min = phase.name === "title" ? LIMITS.titleMin : LIMITS.descriptionMin;
      const cleaned = value.trim();
      if (cleaned.length < min) {
        render("Un poco más, que si no no sé qué apuntar.");
        return;
      }
      if (phase.name === "title") {
        draft.title = cleaned.replace(/\s+/g, " ");
        phase = { name: "body", mode: phase.mode };
      } else if (phase.name === "body") {
        draft.description = cleaned;
        phase = { name: "confirm" };
      }
      render();
    };

    say.addEventListener("click", accept);
    field.addEventListener("keydown", (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === "Enter" && !event.shiftKey && !(field instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        accept();
      }
    });
    options.root.append(field, say);
    field.focus();
  }

  async function send() {
    phase = { name: "sending" };
    render();
    const result = await options.submit({ ...draft });
    if (!open) return;
    if (result.ok) {
      phase = { name: "done", text: RESULT.ok, outcome: "ok" };
    } else if (result.error === "validation" && result.message) {
      phase = { name: "done", text: result.message, outcome: "validation" };
    } else {
      phase = { name: "done", text: RESULT[result.error] ?? RESULT.github, outcome: result.error };
    }
    render();
  }

  function close() {
    if (!open) return;
    const away = atDesk || traveling;
    open = false;
    atDesk = false;
    traveling = false;
    token += 1;
    stopTyping();
    window.clearTimeout(emphTimer);
    if (away) options.onInventorReset?.();
    document.body.classList.remove("dialogue-open");
    options.root.hidden = true;
    options.root.replaceChildren();
    options.root.classList.remove("dialogue-arrive");
    delete options.root.dataset.speaker;
    delete options.root.dataset.cue;
    delete options.root.dataset.emph;
    delete options.root.dataset.outcome;
    delete options.root.dataset.workshop;
    options.root.classList.remove("is-workshop");
    options.root.style.removeProperty("--workshop-kb");
    abandonSession();
    workshopScreen = null;
    workshopCorrecting = false;
    originalNote = null;
    options.onWorkshopBeat?.("off");
    phase = { name: "greet" };
    session = { kind: "inventor" };
    options.onFocus?.(null);
    options.onClose();
  }

  function show() {
    if (open) return;
    open = true;
    atDesk = false;
    traveling = false;
    session = { kind: "inventor" };
    phase = { name: "greet" };
    draft = { kind: "propuesta", title: "", description: "" };
    document.body.classList.add("dialogue-open");
    options.root.hidden = false;
    options.onOpen();
    bumpBubble();
    render();
  }

  function openIteration(slug: string) {
    const entry = options.prototypes.find((item) => item.slug === slug);
    if (!entry) return;
    open = true;
    atDesk = false;
    traveling = false;
    session = { kind: "inventor" };
    resetDraft("iteracion", slug);
    phase = { name: "title", mode: "iteracion" };
    document.body.classList.add("dialogue-open");
    options.root.hidden = false;
    options.onOpen();
    bumpBubble();
    render();
  }

  function openScript(script: DialogueScript) {
    if (open) return;
    open = true;
    atDesk = false;
    traveling = false;
    session = { kind: "script", cursor: startScript(script) };
    phase = { name: "greet" };
    document.body.classList.add("dialogue-open");
    options.root.hidden = false;
    options.onOpen();
    bumpBubble();
    render();
  }

  return {
    open: show,
    openScript,
    openIteration,
    close,
    isOpen: () => open,
  };
}
