import { bindPage, browserHost, startApp } from "./app";

declare global {
  interface Window {
    __protoLabApp?: { stop(): void };
    __protoLabAssets?: {
      getBlobUrl(path: string): Promise<string>;
      getArrayBuffer(path: string): Promise<ArrayBuffer>;
      getMime(path: string): Promise<string>;
      revokeAll(): void;
    };
    __protoLabPreview?: () => void | Promise<void>;
  }
}

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("falta #app");
}

const running = startApp((canvas) => {
  if (canvas instanceof HTMLCanvasElement) root.append(canvas);
}, browserHost());
const estado = document.querySelector("#estado");
window.__protoLabApp = bindPage(
  {
    stop() {
      running.stop();
      if (estado) estado.textContent = "Detenida";
    },
  },
  {
    assets: () => window.__protoLabAssets,
    target: window,
  },
);
