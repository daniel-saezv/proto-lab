// El e2e usa el cliente de la plantilla. Una aplicación nueva copia la plantilla, no la importa.
import { installLabData } from "../../../templates/aplicacion/src/datos";
import { installAssetBridge } from "./bridge";

type AssetApi = {
  getBlobUrl(path: string): Promise<string>;
  getArrayBuffer(path: string): Promise<ArrayBuffer>;
  getMime(path: string): Promise<string>;
  revokeAll(): void;
};

declare global {
  interface Window {
    __protoLabApp?: { stop(): void };
    __protoLabAssets?: AssetApi;
    __assetLab?: {
      runMediaChecks(): Promise<Record<string, boolean>>;
      probeExternalFetch(): Promise<string>;
      probeBadAsset(path: string): Promise<string>;
      cspPresent(): boolean;
      loadNote(): Promise<unknown>;
      jsonMime(): Promise<string>;
      roundtripSave(key: string, value: string): Promise<string | null>;
      readSave(key: string): Promise<string | null>;
      probeRelative(path: string): Promise<string>;
    };
  }
}

function setStatus(text: string) {
  const node = document.querySelector<HTMLElement>("[data-testid='lab-status']");
  if (node) node.textContent = text;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img-load"));
    img.src = url;
  });
}

async function canvas2dUntainted(url: string): Promise<boolean> {
  const img = await loadImage(url);
  const canvas = document.getElementById("canvas2d") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);
  try {
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

async function webglTexture(imageUrl: string): Promise<boolean> {
  const img = await loadImage(imageUrl);
  const canvas2d = document.getElementById("canvas2d") as HTMLCanvasElement;
  const ctx2d = canvas2d.getContext("2d");
  if (!ctx2d) return false;
  ctx2d.drawImage(img, 0, 0);
  try {
    ctx2d.getImageData(0, 0, 1, 1);
  } catch {
    return false;
  }
  const canvas = document.getElementById("canvas-gl") as HTMLCanvasElement;
  const gl = canvas.getContext("webgl");
  if (!gl) return false;
  const texture = gl.createTexture();
  if (!texture) return false;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d);
    return gl.getError() === gl.NO_ERROR;
  } catch {
    return false;
  }
}

async function decodeAudio(assets: AssetApi): Promise<boolean> {
  const buffer = await assets.getArrayBuffer("media/beep.wav");
  const ctx = new AudioContext();
  try {
    await ctx.decodeAudioData(buffer.slice(0));
    await ctx.close();
    return true;
  } catch {
    await ctx.close();
    return false;
  }
}

async function runMediaChecks(): Promise<Record<string, boolean>> {
  const assets = window.__protoLabAssets;
  if (!assets) throw new Error("sin-puente");
  const imageUrl = await assets.getBlobUrl("media/pixel.png");
  const results = {
    canvas2d: await canvas2dUntainted(imageUrl),
    webgl: await webglTexture(imageUrl),
    audio: await decodeAudio(assets),
  };
  return results;
}

async function probeExternalFetch(): Promise<string> {
  try {
    await fetch("https://example.com/");
    return "allowed";
  } catch (error) {
    return error instanceof Error ? error.message : "blocked";
  }
}

async function probeBadAsset(path: string): Promise<string> {
  const assets = window.__protoLabAssets;
  if (!assets) return "sin-puente";
  try {
    await assets.getBlobUrl(path);
    return "unexpected-ok";
  } catch (error) {
    return error instanceof Error ? error.message : "error";
  }
}

function cspPresent(): boolean {
  return Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]')) || location.pathname.startsWith("/protos/");
}

function postLab(type: "alive" | "ready") {
  if (window.parent === window) return;
  window.parent.postMessage({ source: "proto-lab", type }, "*");
}

function loseGl() {
  const canvas = document.getElementById("canvas-gl");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
}

const bridge = installAssetBridge();
const data = installLabData(window);

window.__assetLab = {
  runMediaChecks,
  probeExternalFetch,
  probeBadAsset,
  cspPresent,
  loadNote: () => data.json("media/nota.json"),
  jsonMime: () => window.__protoLabAssets?.getMime("media/nota.json") ?? Promise.resolve(""),
  roundtripSave: async (key, value) => {
    await data.set(key, value);
    return data.get(key);
  },
  readSave: (key) => data.get(key),
  probeRelative: async (path) => {
    try {
      await data.load(path);
      return "ok";
    } catch (error) {
      return error instanceof Error ? error.message : "error";
    }
  },
};

let stopped = false;
window.__protoLabApp = {
  stop() {
    if (stopped) return;
    stopped = true;
    data.revoke();
    bridge.revokeAll();
    loseGl();
  },
};
window.addEventListener("pagehide", () => window.__protoLabApp?.stop());
postLab("alive");

void (async () => {
  try {
    const results = await runMediaChecks();
    const ok = results.canvas2d && results.webgl && results.audio;
    setStatus(ok ? "OK" : `Fallo: ${JSON.stringify(results)}`);
    document.body.dataset.mediaOk = ok ? "1" : "0";
    for (const [key, value] of Object.entries(results)) {
      document.body.dataset[`test_${key}`] = value ? "1" : "0";
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "error");
    document.body.dataset.mediaOk = "0";
  } finally {
    postLab("ready");
  }
})();

export {};
