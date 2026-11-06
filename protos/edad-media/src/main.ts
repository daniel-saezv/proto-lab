import { crearSonido } from "./audio";
import { crearEscena } from "./escena";
import { crearBolsa } from "./guardar";
import {
  aplicarGuardado,
  avanzar,
  cambiarClase,
  CLASES,
  construir,
  costeDe,
  crearAzar,
  crearPartida,
  fijarObjetivo,
  HECHIZOS,
  moverHacia,
  nivelDePlaneta,
  OBRA_IDS,
  OBRAS,
  PLANETAS,
  planetasDe,
  planetaHora,
  posarRetrato,
  revivir,
  tituloGuerra,
  volcar,
  lanzar,
  type ClaseId,
  type Estado,
  type ObraId,
  type PlanetaId,
} from "./mundo";

declare global {
  interface Window {
    __protoLabApp?: { stop(): void };
    __protoLabPreview?: () => void | Promise<void>;
    __protoLabData?: {
      get(clave: string): Promise<string | null>;
      set(clave: string, valor: string): Promise<void>;
      remove(clave: string): Promise<void>;
      revoke(): void;
    };
  }
}

const CLAVE = "partida";

function senal(tipo: "alive" | "ready"): void {
  window.parent.postMessage({ source: "proto-lab", type: tipo }, "*");
}

function debe(id: string): HTMLElement {
  const nodo = document.querySelector(id);
  if (!(nodo instanceof HTMLElement)) throw new Error(`falta ${id}`);
  return nodo;
}

function esClase(valor: string): valor is ClaseId {
  return valor === "caballero" || valor === "ballestero" || valor === "fraile" || valor === "astrologo";
}

const vista = document.querySelector("#vista");
if (!(vista instanceof HTMLCanvasElement)) throw new Error("falta el campo");
const canvas = vista;
const oficioEl = debe("#oficio");
const guerraEl = debe("#guerra");
const bienesEl = debe("#bienes");
const avisoEl = debe("#aviso");
const falloEl = debe("#fallo");
const vidaTexto = debe("#vidaTexto");
const vidaBar = debe("#vidaBar");
const manaTexto = debe("#manaTexto");
const manaBar = debe("#manaBar");
const esferasEl = debe("#esferas");
const oficiosEl = debe("#oficios");
const panelObra = debe("#panelObra");
const listaObra = debe("#listaObra");
const castilloBtn = debe("#castillo");
const caidaEl = debe("#caida");
const alzarBtn = debe("#alzar");
if (!(castilloBtn instanceof HTMLButtonElement) || !(alzarBtn instanceof HTMLButtonElement)) {
  throw new Error("faltan los botones");
}

const ctx = canvas.getContext("2d", { alpha: false });
const sonido = crearSonido();
const bolsa = crearBolsa(window);
window.__protoLabData = {
  get: (clave) => bolsa.get(clave),
  set: (clave, valor) => bolsa.set(clave, valor),
  remove: (clave) => bolsa.remove(clave),
  revoke: () => bolsa.revoke(),
};

const estado = crearPartida((Math.floor(Math.random() * 0x7fffffff) || 1) >>> 0);
const azar = crearAzar(estado.semilla);
const escena = ctx ? crearEscena(ctx) : null;
const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const enLaboratorio = window.parent !== window;
const controller = new AbortController();
const { signal } = controller;

let raf = 0;
let parado = false;
let listo = false;
let entrada = false;
let ancho = 1;
let alto = 1;
let pulsoGuardado = 0;
let obraAbierta = false;
let falloT = 0;
const teclas = new Set<string>();

const NOMBRE_ESFERA: Record<PlanetaId, string> = {
  sol: "Sol",
  luna: "Luna",
  marte: "Marte",
  mercurio: "Mercurio",
  jupiter: "Júpiter",
  venus: "Venus",
  saturno: "Saturno",
};

const botonesEsfera = new Map<PlanetaId, HTMLButtonElement>();
for (const planeta of PLANETAS) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    sonar();
  }, { signal });
  boton.addEventListener("click", () => {
    const resultado = lanzar(estado, planeta);
    if (!resultado.ok) decir(resultado.motivo);
    else sonido.nota(520 + PLANETAS.indexOf(planeta) * 30, 0.12, "sine", 0.05);
    pintarHud(0);
  }, { signal });
  esferasEl.append(boton);
  botonesEsfera.set(planeta, boton);
}

const botonesObra = new Map<ObraId, HTMLButtonElement>();
for (const obra of OBRA_IDS) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.addEventListener("click", () => {
    sonar();
    const resultado = construir(estado, obra);
    if (!resultado.ok) decir(resultado.motivo);
    else sonido.nota(180, 0.1, "triangle", 0.05);
    pintarHud(0);
    void guardar();
  }, { signal });
  listaObra.append(boton);
  botonesObra.set(obra, boton);
}

function decir(texto: string): void {
  falloEl.textContent = texto;
  falloEl.hidden = false;
  falloT = 1.6;
}

function sonar(): void {
  entrada = true;
  sonido.abrir();
}

function medir(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  ancho = Math.max(1, canvas.clientWidth);
  alto = Math.max(1, canvas.clientHeight);
  const bw = Math.floor(ancho * dpr);
  const bh = Math.floor(alto * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function ndcDe(event: PointerEvent): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: 1 - ((event.clientY - rect.top) / rect.height) * 2,
  };
}

function ordenar(event: PointerEvent): void {
  if (!escena || estado.fase !== "juego") return;
  const ndc = ndcDe(event);
  if (!ndc) return;
  const id = escena.enemigoCerca(estado, ndc.x, ndc.y, ancho, alto);
  if (id != null) {
    fijarObjetivo(estado, id);
    return;
  }
  const suelo = escena.suelo(ndc.x, ndc.y);
  if (suelo) moverHacia(estado, suelo.x, suelo.z);
}

function pintarHud(dt: number): void {
  const clase = CLASES[estado.clase];
  oficioEl.textContent = `${clase.nombre} · nivel ${estado.nivel}`;
  guerraEl.textContent = tituloGuerra(estado);
  bienesEl.textContent = `${estado.oro} oro · ${estado.madera} madera · ${estado.piedra} piedra`;
  avisoEl.textContent = estado.aviso;
  avisoEl.hidden = estado.avisoT <= 0 || estado.aviso.length === 0;
  if (falloT > 0) {
    falloT = Math.max(0, falloT - dt);
    if (falloT === 0) falloEl.hidden = true;
  }
  const vida = Math.max(0, Math.round(estado.vida));
  const mana = Math.max(0, Math.round(estado.mana));
  vidaTexto.textContent = `Vida ${vida}`;
  manaTexto.textContent = `Aliento ${mana}`;
  vidaBar.style.width = `${Math.max(0, Math.min(100, (estado.vida / estado.vidaMax) * 100))}%`;
  manaBar.style.width = `${Math.max(0, Math.min(100, (estado.mana / estado.manaMax) * 100))}%`;
  const abiertas = planetasDe(estado.clase, estado.nivel);
  const hora = planetaHora(estado);
  for (const planeta of PLANETAS) {
    const boton = botonesEsfera.get(planeta);
    if (!boton) continue;
    const hechizo = HECHIZOS[planeta];
    const cd = estado.cds[planeta];
    const abierta = abiertas.includes(planeta);
    boton.disabled = !abierta || cd > 0.05 || estado.fase !== "juego" || estado.mana < hechizo.mana;
    boton.classList.toggle("hora", planeta === hora);
    const corto = NOMBRE_ESFERA[planeta];
    boton.textContent = cd > 0.05 ? `${corto} ${Math.ceil(cd)}` : corto;
    boton.setAttribute("aria-label", abierta ? hechizo.nombre : `${hechizo.nombre}, nivel ${nivelDePlaneta(estado.clase, planeta)}`);
  }
  oficiosEl.hidden = !estado.oficioAbierto || estado.fase !== "juego";
  for (const boton of oficiosEl.querySelectorAll("button")) {
    if (!(boton instanceof HTMLButtonElement)) continue;
    const id = boton.dataset.clase ?? "";
    boton.setAttribute("aria-pressed", id === estado.clase ? "true" : "false");
  }
  caidaEl.hidden = estado.fase !== "caido";
  castilloBtn.setAttribute("aria-expanded", obraAbierta ? "true" : "false");
  panelObra.hidden = !obraAbierta;
  for (const obra of OBRA_IDS) {
    const boton = botonesObra.get(obra);
    if (!boton) continue;
    const nivel = estado.obras[obra];
    const def = OBRAS[obra];
    if (nivel >= def.max) {
      boton.disabled = true;
      boton.textContent = `${def.nombre} ${nivel}/${def.max}`;
    } else {
      const coste = costeDe(obra, nivel);
      const partes = [
        coste.oro > 0 ? `${coste.oro} oro` : "",
        coste.madera > 0 ? `${coste.madera} madera` : "",
        coste.piedra > 0 ? `${coste.piedra} piedra` : "",
      ].filter(Boolean);
      boton.disabled = false;
      boton.textContent = `${def.nombre} ${nivel}/${def.max} · ${partes.join(", ")}`;
    }
  }
}

function frame(ahora: number): void {
  if (parado) return;
  const dt = Math.min(0.05, Math.max(0, (ahora - previo) / 1000));
  previo = ahora;
  if (estado.fase === "juego") {
    let dx = 0;
    let dz = 0;
    if (teclas.has("a") || teclas.has("arrowleft")) dx -= 1;
    if (teclas.has("d") || teclas.has("arrowright")) dx += 1;
    if (teclas.has("w") || teclas.has("arrowup")) dz -= 1;
    if (teclas.has("s") || teclas.has("arrowdown")) dz += 1;
    if (dx !== 0 || dz !== 0) {
      const l = Math.hypot(dx, dz) || 1;
      moverHacia(estado, estado.x + (dx / l) * 2.4, estado.z + (dz / l) * 2.4);
    }
  }
  avanzar(estado, dt, azar);
  medir();
  escena?.dibujar(estado, ancho, alto, ahora / 1000, quieto);
  pintarHud(dt);
  pulsoGuardado += dt;
  if (pulsoGuardado > 2.5) {
    pulsoGuardado = 0;
    void guardar();
  }
  if (!listo) {
    listo = true;
    senal("ready");
  }
  raf = requestAnimationFrame(frame);
}

async function guardar(): Promise<void> {
  if (!enLaboratorio || parado) return;
  try {
    await bolsa.set(CLAVE, volcar(estado));
  } catch {
    // Sin bolsa del laboratorio la partida sigue en memoria.
  }
}

async function hidratar(): Promise<void> {
  if (!enLaboratorio) return;
  try {
    const crudo = await bolsa.get(CLAVE);
    if (!crudo || entrada || parado) return;
    if (aplicarGuardado(estado, crudo)) pintarHud(0);
  } catch {
    // La primera vez no hay partida guardada.
  }
}

let previo = performance.now();
let pulsado = false;

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  sonar();
  pulsado = true;
  canvas.setPointerCapture?.(event.pointerId);
  ordenar(event);
}, { signal });
canvas.addEventListener("pointermove", (event) => {
  if (!pulsado) return;
  ordenar(event);
}, { signal });
const soltarPuntero = () => {
  pulsado = false;
};
canvas.addEventListener("pointerup", soltarPuntero, { signal });
canvas.addEventListener("pointercancel", soltarPuntero, { signal });

window.addEventListener("keydown", (event) => {
  teclas.add(event.key.toLowerCase());
}, { signal });
window.addEventListener("keyup", (event) => {
  teclas.delete(event.key.toLowerCase());
}, { signal });
window.addEventListener("resize", () => medir(), { signal });

oficiosEl.addEventListener("click", (event) => {
  const nodo = event.target;
  if (!(nodo instanceof HTMLButtonElement)) return;
  const id = nodo.dataset.clase ?? "";
  if (!esClase(id)) return;
  sonar();
  cambiarClase(estado, id);
  pintarHud(0);
}, { signal });

castilloBtn.addEventListener("click", () => {
  sonar();
  obraAbierta = !obraAbierta;
  pintarHud(0);
}, { signal });

alzarBtn.addEventListener("click", () => {
  sonar();
  revivir(estado);
  sonido.nota(220, 0.16, "triangle", 0.05);
  pintarHud(0);
  void guardar();
}, { signal });

function stop(): void {
  if (parado) return;
  parado = true;
  controller.abort();
  cancelAnimationFrame(raf);
  sonido.cerrar();
  escena?.soltar();
  const pendiente = enLaboratorio ? bolsa.set(CLAVE, volcar(estado)).catch(() => undefined) : Promise.resolve();
  void pendiente.finally(() => bolsa.revoke());
}

window.addEventListener("pagehide", () => stop(), { signal });
window.__protoLabApp = { stop };
window.__protoLabPreview = () => {
  posarRetrato(estado);
  medir();
  escena?.dibujar(estado, ancho, alto, 1.2, true);
  pintarHud(0);
};

senal("alive");
if (!ctx || !escena) {
  oficioEl.textContent = "Este aparato no puede pintar el campo.";
  senal("ready");
} else {
  medir();
  escena.dibujar(estado, ancho, alto, 0, quieto);
  pintarHud(0);
  previo = performance.now();
  raf = requestAnimationFrame(frame);
}
void hidratar();
