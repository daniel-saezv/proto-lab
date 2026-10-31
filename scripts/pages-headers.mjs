/**
 * El mismo formato que `_headers` de Cloudflare Pages: un splat por regla,
 * placeholders `:nombre`, herencia y `! Nombre` para soltar una cabecera.
 */

export function parsePagesHeaders(source) {
  const rules = [];
  let current = null;
  for (const raw of source.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    if (raw.startsWith(" ") || raw.startsWith("\t")) {
      if (!current) continue;
      const body = raw.trim();
      if (body.startsWith("! ")) {
        current.unset.push(body.slice(2).trim().toLowerCase());
        continue;
      }
      const sep = body.indexOf(":");
      if (sep === -1) continue;
      current.set.push([body.slice(0, sep).trim(), body.slice(sep + 1).trim()]);
      continue;
    }
    current = { pattern: raw.trim(), unset: [], set: [] };
    rules.push(current);
  }
  return rules;
}

function patternToRegExp(pattern) {
  let re = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") {
      re += "(.*)";
      continue;
    }
    if (ch === ":") {
      const match = /^:([A-Za-z][A-Za-z0-9_]*)/.exec(pattern.slice(i));
      if (match) {
        re += "([^/]+)";
        i += match[0].length - 1;
        continue;
      }
    }
    re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${re}$`);
}

/**
 * Aplica las cabeceras y no deja que un `writeHead` posterior las sustituya.
 * sirv (el estático de `vite preview`) manda `Cache-Control: no-cache` dentro
 * del objeto de cabeceras, y Node da prioridad a ese objeto sobre `setHeader`.
 * La compresión de Vite solo envuelve la respuesta si el cliente pide gzip:
 * curl sin `Accept-Encoding`, y HEAD, veían `no-cache` en archivos que el
 * navegador recibía como immutable.
 */
export function sealPagesHeaders(res, headerMap) {
  if (!headerMap || headerMap.size === 0) return;
  const wanted = new Map();
  for (const { name, value } of headerMap.values()) {
    wanted.set(name.toLowerCase(), { name, value });
  }
  const origSetHeader = res.setHeader.bind(res);
  const origRemoveHeader = res.removeHeader.bind(res);
  const origWriteHead = res.writeHead.bind(res);
  const apply = () => {
    for (const { name, value } of wanted.values()) origSetHeader(name, value);
  };
  res.setHeader = (name, value) => {
    const forced = wanted.get(String(name).toLowerCase());
    if (forced) return origSetHeader(forced.name, forced.value);
    return origSetHeader(name, value);
  };
  res.removeHeader = (name) => {
    if (wanted.has(String(name).toLowerCase())) return;
    return origRemoveHeader(name);
  };
  res.writeHead = (status, reason, maybeHeaders) => {
    let message;
    let bag;
    if (typeof reason === "string") {
      message = reason;
      if (maybeHeaders && typeof maybeHeaders === "object") bag = { ...maybeHeaders };
    } else if (reason && typeof reason === "object") {
      bag = { ...reason };
    }
    if (bag) {
      for (const key of Object.keys(bag)) {
        if (wanted.has(key.toLowerCase())) delete bag[key];
      }
      for (const { name, value } of wanted.values()) bag[name] = value;
    }
    apply();
    if (message !== undefined) return origWriteHead(status, message, bag);
    if (bag) return origWriteHead(status, bag);
    return origWriteHead(status);
  };
}

/** Cabeceras efectivas, en el orden de las reglas. Valores repetidos se unen con coma. */
export function headersForPath(rules, pathname) {
  const out = new Map();
  for (const rule of rules) {
    if (!patternToRegExp(rule.pattern).test(pathname)) continue;
    for (const name of rule.unset) out.delete(name);
    for (const [name, value] of rule.set) {
      const key = name.toLowerCase();
      const prev = out.get(key);
      if (prev) out.set(key, { name: prev.name, value: `${prev.value}, ${value}` });
      else out.set(key, { name, value });
    }
  }
  return out;
}
