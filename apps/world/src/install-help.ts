import { createDialogCloseButton } from "./dialog-dismiss";
import {
  ANDROID_MANUAL_STEPS,
  IOS_STEPS,
  detectInstallPlatform,
  installHelpKeyAction,
  isStandalonePwa,
  type InstallPlatform,
} from "./install-help-logic";

export type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export function createInstallHelp(options: {
  root: HTMLElement;
  onOpen: () => void;
  onClose: () => void;
  getDeferredPrompt: () => DeferredInstallPrompt | null;
  clearDeferredPrompt: () => void;
}) {
  let open = false;
  let activeTab: InstallPlatform = detectInstallPlatform(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );

  function standalone(): boolean {
    return isStandalonePwa(
      window.matchMedia("(display-mode: standalone)").matches,
      (navigator as Navigator & { standalone?: boolean }).standalone,
    );
  }

  function setTab(tab: InstallPlatform) {
    activeTab = tab;
    renderBody();
  }

  function renderSteps(list: readonly string[], testId: string) {
    const ol = document.createElement("ol");
    ol.className = "install-steps";
    ol.dataset.testid = testId;
    for (const step of list) {
      const li = document.createElement("li");
      li.textContent = step;
      ol.append(li);
    }
    return ol;
  }

  function renderBody() {
    const body = options.root.querySelector<HTMLElement>("[data-testid='install-body']");
    if (!body) return;
    body.replaceChildren();

    if (standalone()) {
      const note = document.createElement("p");
      note.className = "install-note";
      note.dataset.testid = "install-standalone";
      note.textContent =
        "Ya lo tienes en la pantalla de inicio. Ábrelo desde el icono de Proto Lab como cualquier app.";
      body.append(note);
      return;
    }

    const tabs = document.createElement("div");
    tabs.className = "install-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Sistema");

    const iosTab = document.createElement("button");
    iosTab.type = "button";
    iosTab.className = "install-tab";
    iosTab.dataset.testid = "install-tab-ios";
    iosTab.setAttribute("role", "tab");
    iosTab.setAttribute("aria-selected", activeTab === "ios" ? "true" : "false");
    iosTab.setAttribute("aria-controls", "install-panel-ios");
    iosTab.id = "install-tab-ios";
    iosTab.textContent = "iPhone / iPad";
    iosTab.addEventListener("click", () => setTab("ios"));

    const androidTab = document.createElement("button");
    androidTab.type = "button";
    androidTab.className = "install-tab";
    androidTab.dataset.testid = "install-tab-android";
    androidTab.setAttribute("role", "tab");
    androidTab.setAttribute("aria-selected", activeTab === "android" ? "true" : "false");
    androidTab.setAttribute("aria-controls", "install-panel-android");
    androidTab.id = "install-tab-android";
    androidTab.textContent = "Android";
    androidTab.addEventListener("click", () => setTab("android"));

    tabs.append(iosTab, androidTab);

    const iosPanel = document.createElement("div");
    iosPanel.className = "install-panel";
    iosPanel.id = "install-panel-ios";
    iosPanel.dataset.testid = "install-panel-ios";
    iosPanel.setAttribute("role", "tabpanel");
    iosPanel.setAttribute("aria-labelledby", "install-tab-ios");
    iosPanel.hidden = activeTab !== "ios";
    const iosNote = document.createElement("p");
    iosNote.className = "install-footnote";
    iosNote.textContent = "Hace falta iOS 16.4 o posterior para instalar esta web como app.";
    iosPanel.append(renderSteps(IOS_STEPS, "install-steps-ios"), iosNote);

    const androidPanel = document.createElement("div");
    androidPanel.className = "install-panel";
    androidPanel.id = "install-panel-android";
    androidPanel.dataset.testid = "install-panel-android";
    androidPanel.setAttribute("role", "tabpanel");
    androidPanel.setAttribute("aria-labelledby", "install-tab-android");
    androidPanel.hidden = activeTab !== "android";

    const deferred = options.getDeferredPrompt();
    if (deferred) {
      const lead = document.createElement("p");
      lead.className = "install-lead";
      lead.textContent = "Chrome puede instalar Proto Lab directamente:";
      const installBtn = document.createElement("button");
      installBtn.type = "button";
      installBtn.className = "solid-button install-prompt-button";
      installBtn.dataset.testid = "install-prompt";
      installBtn.textContent = "Instalar";
      installBtn.addEventListener("click", () => {
        void deferred.prompt().then(() => options.clearDeferredPrompt());
        renderBody();
      });
      androidPanel.append(lead, installBtn);
    } else {
      androidPanel.append(renderSteps(ANDROID_MANUAL_STEPS, "install-steps-android"));
    }

    body.append(tabs, iosPanel, androidPanel);
  }

  function buildUi() {
    options.root.replaceChildren();
    options.root.dataset.testid = "install-help";
    options.root.setAttribute("role", "dialog");
    options.root.setAttribute("aria-modal", "true");
    options.root.setAttribute("aria-labelledby", "install-heading");

    const panel = document.createElement("div");
    panel.className = "selector-panel install-panel-shell";

    const heading = document.createElement("h2");
    heading.id = "install-heading";
    heading.textContent = "Instalar Proto Lab";

    const intro = document.createElement("p");
    intro.className = "install-intro";
    intro.textContent =
      "Así lo fijas en la pantalla de inicio y entras sin volver a buscar el enlace del grupo.";

    const body = document.createElement("div");
    body.dataset.testid = "install-body";

    const actions = document.createElement("div");
    actions.className = "selector-actions";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "text-button";
    back.dataset.testid = "install-close";
    back.textContent = "Volver al laboratorio";
    back.addEventListener("click", () => close());
    actions.append(back);

    panel.append(createDialogCloseButton(() => close()), heading, intro, body, actions);
    options.root.append(panel);
    renderBody();
  }

  function handleKey(event: KeyboardEvent) {
    if (!open) return false;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return false;
    }
    const action = installHelpKeyAction(event.key, true);
    if (action === "none") return false;
    event.preventDefault();
    if (action === "close") close();
    return true;
  }

  function show() {
    if (open) return;
    open = true;
    activeTab = detectInstallPlatform(
      navigator.userAgent,
      navigator.platform,
      navigator.maxTouchPoints,
    );
    buildUi();
    options.root.hidden = false;
    document.body.classList.add("install-open");
    options.onOpen();
    const focus =
      options.root.querySelector<HTMLButtonElement>("[data-testid='install-prompt']") ??
      options.root.querySelector<HTMLButtonElement>(".install-tab[aria-selected='true']") ??
      options.root.querySelector<HTMLButtonElement>("[data-testid='install-close']");
    focus?.focus();
  }

  function close() {
    if (!open) return;
    open = false;
    options.root.hidden = true;
    options.root.replaceChildren();
    document.body.classList.remove("install-open");
    options.onClose();
  }

  return {
    open: show,
    close,
    isOpen: () => open,
    handleKey,
  };
}
