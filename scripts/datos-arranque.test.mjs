import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "templates/export-estatico/arranque.js"), "utf8");

function boot(fetchImpl, onParent) {
  const listeners = { message: [], pagehide: [] };
  const sent = [];
  let revoked = 0;
  const parent = {
    postMessage(message) {
      sent.push(message);
      if (message?.type === "save" && onParent) onParent(message, deliver);
    },
  };
  function deliver(data) {
    for (const listener of listeners.message) listener({ source: parent, data });
  }
  const window = {
    location: { href: "http://127.0.0.1:4173/protos/demo/" },
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn);
    },
    parent,
  };
  window.window = window;
  class AppURL extends URL {
    static createObjectURL() {
      return "blob:arranque";
    }
    static revokeObjectURL() {
      revoked += 1;
    }
  }
  const context = createContext({
    window,
    parent,
    URL: AppURL,
    fetch: fetchImpl,
    TextDecoder,
    TextEncoder,
    Blob,
    Promise,
    setTimeout,
    clearTimeout,
    Object,
    JSON,
    decodeURIComponent,
    parseInt,
    isFinite,
    Error,
    String,
    Uint8Array,
  });
  runInContext(source, context, { filename: "arranque.js" });
  return {
    api: window.__protoLabData,
    app: window.__protoLabApp,
    notify: window.__protoLabNotifyReady,
    sent,
    revoked: () => revoked,
  };
}

function jsonFetch(calls) {
  return async (href) => {
    calls.push(String(href));
    const body = href.endsWith(".html") ? "<html>cloudflare access</html>" : '{"nota":"laboratorio"}';
    const mime = href.endsWith(".html") ? "text/html" : "application/json";
    const bytes = new TextEncoder().encode(body);
    return {
      ok: true,
      url: String(href),
      headers: {
        get(name) {
          if (name === "content-type") return mime;
          if (name === "content-length") return String(bytes.byteLength);
          return null;
        },
      },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  };
}

describe("arranque del export", () => {
  it("carga JSON relativo, guarda y avisa alive sin ready", async () => {
    const calls = [];
    const store = new Map();
    const { api, notify, sent, revoked } = boot(jsonFetch(calls), (message, deliver) => {
      if (message.op === "set") store.set(message.key, message.value);
      if (message.op === "delete") store.delete(message.key);
      const value = message.op === "get" ? (store.get(message.key) ?? null) : null;
      deliver({ source: "proto-lab", type: "save-result", id: message.id, ok: true, value });
    });
    expect(sent.some((message) => message.type === "alive")).toBe(true);
    expect(sent.some((message) => message.type === "ready")).toBe(false);
    await expect(api.json("media/nota.json")).resolves.toEqual({ nota: "laboratorio" });
    await expect(api.json("media/nota.json")).resolves.toEqual({ nota: "laboratorio" });
    expect(calls).toHaveLength(1);
    await expect(api.load("../otro/a.json")).rejects.toThrow(/not-allowed/);
    await expect(api.load("login.html")).rejects.toThrow(/blocked/);
    await expect(api.blobUrl("media/nota.json")).resolves.toBe("blob:arranque");
    api.revoke();
    expect(revoked()).toBe(1);
    await api.set("partida", "noche-1");
    await expect(api.get("partida")).resolves.toBe("noche-1");
    const saved = sent.find((message) => message.type === "save" && message.op === "set");
    expect(saved).toMatchObject({ source: "proto-lab", key: "partida", value: "noche-1" });
    notify();
    expect(sent.at(-1)).toMatchObject({ source: "proto-lab", type: "ready" });
  });

  it("pide datos compartidos al slug de la página", async () => {
    const calls = [];
    const { api } = boot(async (href, init) => {
      calls.push({ href: String(href), init });
      return {
        status: 200,
        json: async () => ({ ok: true, value: "norte" }),
      };
    });
    await expect(api.sharedGet("mesa")).resolves.toBe("norte");
    await api.sharedSet("mesa", "sur");
    expect(calls[0].href).toBe("/api/apps/demo/shared");
    expect(calls[0].init.credentials).toBe("same-origin");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body)).toEqual({ op: "get", key: "mesa" });
    expect(JSON.parse(calls[1].init.body)).toEqual({ op: "set", key: "mesa", value: "sur" });
  });
});
