type SaveResult = {
  source?: string;
  type?: string;
  id?: number;
  ok?: boolean;
  value?: string | null;
  error?: string;
};

export type Bolsa = {
  get(clave: string): Promise<string | null>;
  set(clave: string, valor: string): Promise<void>;
  remove(clave: string): Promise<void>;
  revoke(): void;
};

/** El laboratorio responde al mensaje `save` si el manifiesto declara esa capacidad. */
export function crearBolsa(target: Window, timeoutMs = 2500): Bolsa {
  const pending = new Map<number, { resolve: (valor: string | null) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let next = 1;
  let cerrado = false;

  const onMessage = (event: MessageEvent) => {
    if (event.source !== target.parent) return;
    const data = event.data as SaveResult | null;
    if (!data || data.source !== "proto-lab" || data.type !== "save-result" || typeof data.id !== "number") return;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.value ?? null);
    else entry.reject(new Error(data.error || "invalid"));
  };
  target.addEventListener("message", onMessage);

  function request(op: "get" | "set" | "delete", clave: string, valor?: string): Promise<string | null> {
    if (cerrado) return Promise.reject(new Error("closed"));
    const id = next;
    next += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error("timeout"));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      const message: { source: "proto-lab"; type: "save"; id: number; op: string; key: string; value?: string } = {
        source: "proto-lab",
        type: "save",
        id,
        op,
        key: clave,
      };
      if (op === "set") message.value = valor;
      target.parent.postMessage(message, "*");
    });
  }

  return {
    get: (clave) => request("get", clave),
    set: async (clave, valor) => {
      await request("set", clave, valor);
    },
    remove: async (clave) => {
      await request("delete", clave);
    },
    revoke() {
      if (cerrado) return;
      cerrado = true;
      target.removeEventListener("message", onMessage);
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
    },
  };
}
