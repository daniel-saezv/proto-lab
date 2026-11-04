import { createDialogCloseButton } from "./dialog-dismiss";
import type { DialogueCue } from "./dialogue-cues";
import { inventorChoices, phaseAfterWorkshopTrip, type ChoiceAction } from "./dialogue-flow";
import { lineRuns, type EmphasisKind, type LineRun } from "./dialogue-emphasis";
import { INVENTOR_RESULT_OK, inventorSpeech, type DialoguePhase } from "./dialogue-speech";
import { chooseScript, scriptNode, startScript, type DialogueScript, type ScriptCursor } from "./dialogue-script";
import { typeDelayMs } from "./dialogue-type";
import { LIMITS } from "./limits";
import { createLongText, keyboardOverlap, longTextHasMore, SCROLL_CUE, type LongTextHandle } from "./long-field";
import type { CatalogEntry, ProposalDraft, SubmitOutcome } from "./types";
import { postWorkshop } from "./workshop-api";
import {
  WORKSHOP_BEGIN_ID,
  WORKSHOP_UI,
  rememberWorkshopPick,
  workshopCounter,
  workshopDiffLine,
  workshopFailedChoices,
  workshopIntroChoices,
  workshopKindLabel,
  workshopPickChoices,
  workshopSpeech,
  workshopSummaryChoices,
  workshopSummaryError,
  workshopTrailBefore,
  workshopTrailLine,
  type WorkshopDraftView,
  type WorkshopRequest,
  type WorkshopResult,
  type WorkshopScreen,
  type WorkshopTrailMark,
} from "./workshop-view";
import { workshopIdeaMeshes, type WorkshopIdeaMesh } from "./workshop-letters";

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
  /** Ideas de la ronda en la escena. `null` las quita. */
  onWorkshopIdeas?: (ideas: WorkshopIdeaMesh[] | null) => void;
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
  let workshopClosing = false;
  let workshopTrail: WorkshopTrailMark[] = [];
  let pendingPick: WorkshopTrailMark | null = null;
  let longText: LongTextHandle | null = null;
  let nextNotice: string | undefined;
  let sheet: HTMLDivElement | null = null;
  let sheetCue: HTMLElement | null = null;
  let sheetObserver: ResizeObserver | null = null;
  let refreshSheetCue = () => {};
  const askWorkshopRemote = options.workshop ?? postWorkshop;

  const viewport = window.visualViewport;
  const liftKeyboard = () => {
    const overlap =
      !viewport || options.root.hidden
        ? 0
        : keyboardOverlap(window.innerHeight, viewport.height, viewport.offsetTop);
    if (overlap <= 0) {
      options.root.style.removeProperty("--dialogue-kb");
      options.root.style.removeProperty("--workshop-kb");
      options.root.classList.remove("is-keyboard");
    } else {
      const px = `${overlap}px`;
      options.root.style.setProperty("--dialogue-kb", px);
      options.root.style.setProperty("--workshop-kb", px);
      options.root.classList.add("is-keyboard");
    }
    longText?.refresh();
    refreshSheetCue();
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

  function releaseLongText() {
    longText?.destroy();
    longText = null;
  }

  function releaseSheet() {
    sheetObserver?.disconnect();
    sheetObserver = null;
    sheet = null;
    sheetCue = null;
    refreshSheetCue = () => {};
  }

  function mountSheet(): HTMLDivElement {
    releaseSheet();
    const node = document.createElement("div");
    node.className = "dialogue-sheet";
    const cue = document.createElement("p");
    cue.className = "dialogue-more";
    cue.dataset.testid = "scroll-cue";
    cue.textContent = SCROLL_CUE;
    cue.hidden = true;
    const refresh = () => {
      const more = longTextHasMore(node.scrollHeight, node.clientHeight, node.scrollTop);
      cue.hidden = !more;
      node.classList.toggle("is-overflowing", more);
    };
    refreshSheetCue = refresh;
    node.addEventListener("scroll", refresh, { passive: true });
    sheetObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh);
    sheetObserver?.observe(node);
    queueMicrotask(refresh);
    requestAnimationFrame(refresh);
    sheet = node;
    sheetCue = cue;
    return node;
  }

  function content(): HTMLElement {
    return sheet ?? options.root;
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

  function clearWorkshopMemory() {
    workshopTrail = [];
    pendingPick = null;
  }

  function leaveDesk(message?: string) {
    restoreOriginalNote();
    abandonSession();
    workshopScreen = null;
    workshopClosing = false;
    clearWorkshopMemory();
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

  function turnIsClosing(body: WorkshopRequest): boolean {
    if (body.op !== "turn") return false;
    if (body.decision === "stop") return true;
    if (body.decision === "retry") return workshopClosing;
    return (
      body.decision === "next" &&
      workshopScreen?.kind === "pick" &&
      workshopScreen.round >= workshopScreen.maxRounds
    );
  }

  function beginModelTurn(body: WorkshopRequest) {
    workshopClosing = turnIsClosing(body);
    workshopScreen = { kind: "loading", purpose: workshopClosing ? "summary" : "model" };
    options.onWorkshopBeat?.(workshopClosing ? "talk" : "work");
    render();
    askWorkshop(body);
  }

  function commitPendingPick() {
    if (!pendingPick) return;
    workshopTrail = rememberWorkshopPick(workshopTrail, pendingPick.round, pendingPick.ideas);
    pendingPick = null;
  }

  function applyWorkshop(result: WorkshopResult) {
    if (!result.ok) {
      pendingPick = null;
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
    commitPendingPick();
    if (result.phase === "summary") {
      workshopSession = null;
      workshopClosing = false;
      workshopScreen = { kind: "summary", speech: result.speech, round: result.round, maxRounds: result.maxRounds };
      options.onWorkshopBeat?.("talk");
      render();
      return;
    }
    workshopSession = result.sessionId ?? workshopSession;
    workshopClosing = false;
    workshopScreen = {
      kind: "pick",
      speech: result.speech,
      options: result.options,
      round: result.round,
      maxRounds: result.maxRounds,
      trail: workshopTrailBefore(workshopTrail, result.round),
    };
    options.onWorkshopBeat?.("work");
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
        workshopClosing = false;
        clearWorkshopMemory();
        workshopScreen = { kind: "intro" };
        options.onWorkshopBeat?.("talk");
      } else {
        workshopScreen = null;
        workshopClosing = false;
        clearWorkshopMemory();
      }
      options.root.hidden = false;
      bumpBubble();
      render();
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
    releaseLongText();
    options.root.replaceChildren();
    options.root.dataset.phase = phase.name;
    options.root.dataset.outcome = phase.name === "done" ? phase.outcome : "";
    options.root.classList.toggle("is-workshop", phase.name === "workshop");
    if (!(phase.name === "workshop" && workshopScreen?.kind === "pick")) options.onWorkshopIdeas?.(null);
    releaseSheet();
    options.root.append(createDialogCloseButton(() => close()));
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
    const body = mountSheet();
    body.append(text);
    options.root.append(head, body);
    if (sheetCue) options.root.append(sheetCue);

    const cue = activeCue();
    if (cue) options.root.dataset.cue = cue;
    else delete options.root.dataset.cue;
    options.onFocus?.({ speakerId: speaker.id, cue });

    const finish = () => {
      if (my !== token) return;
      text.dataset.typing = "0";
      line.caret.remove();
      if (phase.name === "confirm") showConfirmNote(my);
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

  function addChoice(parent: HTMLElement, id: string, label: string, run: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dialogue-choice";
    button.dataset.testid = id;
    button.textContent = label;
    button.addEventListener("click", run);
    parent.append(button);
  }

  function actionRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "workshop-actions";
    options.root.append(row);
    return row;
  }

  function pinActions(): HTMLElement {
    const row = document.createElement("div");
    row.className = "dialogue-actions";
    options.root.append(row);
    return row;
  }

  function showTrail(trail: WorkshopTrailMark[]) {
    if (trail.length === 0) return;
    const list = document.createElement("ol");
    list.className = "sr-only";
    list.dataset.testid = "workshop-trail";
    list.setAttribute("aria-label", "Ideas elegidas");
    for (const mark of trail) {
      const item = document.createElement("li");
      item.className = "workshop-trail-mark";
      item.dataset.testid = "workshop-trail-mark";
      item.dataset.round = String(mark.round);
      const label = document.createElement("strong");
      label.textContent = `Ronda ${mark.round}`;
      const picks = document.createElement("span");
      picks.textContent = workshopTrailLine(mark.ideas);
      item.append(label, picks);
      list.append(item);
    }
    content().append(list);
  }

  function showWorkshop(my: number) {
    if (my !== token || phase.name !== "workshop" || !workshopScreen) return;
    const screen = workshopScreen;
    if (screen.kind === "intro") {
      const actions = actionRow();
      for (const choice of workshopIntroChoices()) {
        addChoice(actions, choice.id, choice.label, () => {
          if (choice.id !== WORKSHOP_BEGIN_ID) {
            leaveDesk();
            return;
          }
          if (!originalNote) {
            leaveDesk(WORKSHOP_UI.closed);
            return;
          }
          beginModelTurn({ op: "start", draft: draftPayload(originalNote) });
        });
      }
      focusWorkshop(options.root.querySelector(`[data-testid='${WORKSHOP_BEGIN_ID}']`));
      return;
    }
    if (screen.kind === "loading") {
      addChoice(actionRow(), "choice-workshop-back", "Volver a mi nota", () => leaveDesk());
      focusWorkshop(options.root.querySelector(".dialogue-choice"));
      return;
    }
    if (screen.kind === "failed") {
      const actions = actionRow();
      for (const choice of workshopFailedChoices()) {
        addChoice(actions, choice.id, choice.label, () => {
          if (choice.id === "choice-workshop-back") {
            leaveDesk();
            return;
          }
          if (workshopSession) beginModelTurn({ op: "turn", sessionId: workshopSession, decision: "retry" });
          else if (originalNote) beginModelTurn({ op: "start", draft: draftPayload(originalNote) });
          else leaveDesk(WORKSHOP_UI.closed);
        });
      }
      focusWorkshop(options.root.querySelector(".dialogue-choice"));
      return;
    }
    if (screen.kind === "summary") {
      const counter = document.createElement("p");
      counter.className = "workshop-counter";
      counter.dataset.testid = "workshop-counter";
      counter.textContent = workshopCounter(screen.round, screen.maxRounds);
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
      const titleLabel = document.createElement("label");
      titleLabel.className = "field-label";
      const titleCaption = document.createElement("span");
      titleCaption.textContent = "Título";
      titleLabel.append(titleCaption, title);
      const descriptionField = createLongText({
        mode: "edit",
        value: draft.description,
        label: "Descripción",
        testId: "workshop-description",
        maxLength: LIMITS.descriptionMax,
        placeholder: "El texto de la nota",
        onLayout: () => refreshSheetCue(),
      });
      longText = descriptionField;
      const description = descriptionField.body;
      if (!(description instanceof HTMLTextAreaElement)) return;
      const diff = document.createElement("p");
      diff.className = "workshop-diff";
      diff.dataset.testid = "workshop-diff";
      const paintDiff = () => {
        diff.textContent = workshopDiffLine(originalNote ?? draft, { title: title.value, description: description.value });
      };
      paintDiff();
      title.addEventListener("input", paintDiff);
      description.addEventListener("input", paintDiff);
      content().append(counter, kind, titleLabel, descriptionField.root, diff);
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
      const actions = actionRow();
      for (const choice of workshopSummaryChoices()) {
        addChoice(actions, choice.id, choice.label, () => {
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
    counter.textContent = workshopCounter(screen.round, screen.maxRounds);
    content().append(counter);
    showTrail(screen.trail);
    const picked = new Set<string>();
    const list = document.createElement("div");
    list.className = "workshop-cloud-hits";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Ideas de esta ronda");
    const publish = () => {
      options.onWorkshopIdeas?.(workshopIdeaMeshes(screen.options, picked, screen.trail));
    };
    for (const [index, option] of screen.options.entries()) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "workshop-cloud-hit";
      chip.dataset.testid = "workshop-option";
      chip.dataset.cloudId = `now-${index}`;
      chip.setAttribute("aria-pressed", "false");
      const label = document.createElement("span");
      label.className = "sr-only";
      label.textContent = option;
      chip.append(label);
      chip.addEventListener("click", () => {
        if (picked.has(option)) picked.delete(option);
        else picked.add(option);
        chip.setAttribute("aria-pressed", picked.has(option) ? "true" : "false");
        publish();
      });
      list.append(chip);
    }
    options.root.append(list);
    publish();
    const actions = actionRow();
    for (const choice of workshopPickChoices()) {
      addChoice(actions, choice.id, choice.label, () => {
        if (choice.id === "choice-workshop-back") {
          leaveDesk();
          return;
        }
        if (!workshopSession) {
          leaveDesk(WORKSHOP_UI.closed);
          return;
        }
        const decision = choice.id === "choice-workshop-stop" ? "stop" : "next";
        pendingPick = { round: screen.round, ideas: [...picked] };
        beginModelTurn({ op: "turn", sessionId: workshopSession, decision, picked: [...picked] });
      });
    }
    focusWorkshop(list.querySelector("button"));
  }

  function focusWorkshop(target: Element | null) {
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    if (sheet) sheet.scrollTop = 0;
    refreshSheetCue();
  }

  function showChoices(my: number) {
    if (my !== token) return;
    const actions = pinActions();
    for (const choice of choices()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dialogue-choice";
      button.dataset.testid = choice.id;
      button.textContent = choice.label;
      button.addEventListener("click", choice.run);
      actions.append(button);
    }
    refreshSheetCue();
    const first = actions.querySelector(".dialogue-choice");
    if (first instanceof HTMLButtonElement) first.focus();
  }

  function showConfirmNote(my: number) {
    if (my !== token || phase.name !== "confirm" || !draft.description.trim()) return;
    const note = createLongText({
      mode: "read",
      value: draft.description,
      label: "Descripción",
      testId: "dialogue-note",
      onLayout: () => refreshSheetCue(),
    });
    longText = note;
    content().append(note.root);
    requestAnimationFrame(() => {
      if (my !== token || !sheet) return;
      const read = note.root.querySelector(".long-read");
      if (!(read instanceof HTMLElement) || read.getBoundingClientRect().height > 96) return;
      if (sheet.scrollHeight <= sheet.clientHeight + 4) return;
      const slot = document.createElement("div");
      slot.className = "dialogue-note-pin";
      slot.append(note.root);
      const actions = options.root.querySelector(".dialogue-actions");
      if (actions) options.root.insertBefore(slot, actions);
      else options.root.append(slot);
      refreshSheetCue();
    });
    refreshSheetCue();
  }

  function showInput(my: number) {
    if (my !== token || (phase.name !== "title" && phase.name !== "body")) return;
    const say = document.createElement("button");
    say.type = "button";
    say.className = "dialogue-choice";
    say.dataset.testid = "dialogue-send";
    say.textContent = "Decir";

    if (phase.name === "body") {
      const note = createLongText({
        mode: "edit",
        value: draft.description,
        label: "Descripción",
        testId: "dialogue-input",
        maxLength: LIMITS.descriptionMax,
        placeholder: "Cuéntaselo al Inventor",
        onLayout: () => refreshSheetCue(),
      });
      longText = note;
      const field = note.body;
      if (!(field instanceof HTMLTextAreaElement)) return;
      const accept = () => acceptField(field);
      say.addEventListener("click", accept);
      content().append(note.root);
      pinActions().append(say);
      field.focus({ preventScroll: true });
      refreshSheetCue();
      return;
    }

    const field = document.createElement("input");
    field.type = "text";
    field.className = "dialogue-input";
    field.dataset.testid = "dialogue-input";
    field.maxLength = LIMITS.titleMax;
    field.autocomplete = "off";
    field.spellcheck = true;
    field.placeholder = "Un nombre corto";
    field.setAttribute("aria-label", "Título");
    field.enterKeyHint = "send";
    field.value = draft.title;

    const accept = () => acceptField(field);
    say.addEventListener("click", accept);
    field.addEventListener("keydown", (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        accept();
      }
    });
    content().append(field);
    pinActions().append(say);
    field.focus({ preventScroll: true });
    refreshSheetCue();
  }

  function acceptField(field: HTMLInputElement | HTMLTextAreaElement) {
    if (phase.name !== "title" && phase.name !== "body") return;
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
    } else {
      draft.description = cleaned;
      phase = { name: "confirm" };
    }
    render();
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
    releaseLongText();
    releaseSheet();
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
    delete options.root.dataset.phase;
    options.root.classList.remove("is-workshop", "is-keyboard");
    options.root.style.removeProperty("--workshop-kb");
    options.root.style.removeProperty("--dialogue-kb");
    abandonSession();
    workshopScreen = null;
    workshopClosing = false;
    clearWorkshopMemory();
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
