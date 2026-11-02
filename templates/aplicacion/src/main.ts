import { bindPage, browserHost, postLabSignal, startApp } from "./app";
import { installLabData } from "./datos";

declare global {
  interface Window {
    __protoLabApp?: { stop(): void };
    __protoLabPreview?: () => void | Promise<void>;
  }
}

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("falta #app");
}

const data = installLabData(window);
const running = startApp((canvas) => {
  if (canvas instanceof HTMLCanvasElement) root.append(canvas);
}, browserHost());
const estado = document.querySelector("#estado");
postLabSignal("alive", window.parent);
requestAnimationFrame(() => {
  requestAnimationFrame(() => postLabSignal("ready", window.parent));
});
window.__protoLabApp = bindPage(
  {
    stop() {
      data.revoke();
      running.stop();
      if (estado) estado.textContent = "Detenida";
    },
  },
  window,
);
