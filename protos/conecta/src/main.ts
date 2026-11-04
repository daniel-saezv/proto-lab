import { installLabData } from "./datos";
import {
  PERFIL_EJEMPLO,
  conAsistencia,
  conMensaje,
  conOpcion,
  conPlan,
  conRecuerdo,
  conVoto,
  LIMITES,
  bolsaJson,
  crearId,
  crearPerfil,
  datosEjemplo,
  datosVacios,
  diaClave,
  horasValidas,
  leerBolsa,
  marcarVisto,
  mezclarGrupo,
  moverMes,
  parseInstante,
  perfilDesde,
  textoFallo,
  validarPlan,
  validarTexto,
  type Asistencia,
  type Datos,
  type Perfil,
  type Plan,
} from "./logic";
import { comprimirFoto } from "./photo";
import { montar, type Borrador, type EstadoVista, type Pestana } from "./view";

declare global {
  interface Window {
    __protoLabApp?: { stop(): void };
    __protoLabPreview?: () => void | Promise<void>;
  }
}

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("falta #app");

const embebida = window.parent !== window;
const data = installLabData(window, { timeoutMs: 2500 });
const CLAVE_GRUPO = "bolsa";
const ahora = new Date();
const state: EstadoVista = {
  modo: embebida ? "cargando" : "ejemplo",
  perfil: embebida ? null : { ...PERFIL_EJEMPLO },
  datos: embebida ? datosVacios() : datosEjemplo(ahora),
  pestana: "agenda",
  pantalla: { tipo: "principal" },
  mes: { year: ahora.getFullYear(), month: ahora.getMonth() },
  dia: diaClave(ahora),
  ahora: ahora.getTime(),
  aviso: "",
  ocupado: false,
};

const vista = montar(root, {
  ui: (accion, id) => {
    void actuar(accion, id);
  },
  proponer: (borrador) => {
    void proponer(borrador);
  },
  perfil: (nombre) => {
    void guardarNombre(nombre);
  },
  opcion: (texto) => {
    void nuevaOpcion(texto);
  },
  mensaje: (texto) => {
    void nuevoMensaje(texto);
  },
  recuerdo: (planId, texto, file) => {
    void nuevoRecuerdo(planId, texto, file);
  },
});

let timer = 0;
const controller = new AbortController();

function senal(tipo: "alive" | "ready"): void {
  window.parent.postMessage({ source: "proto-lab", type: tipo }, "*");
}

function perfilDe(raw: string | null): Perfil | null {
  if (!raw) return null;
  try {
    return perfilDesde(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function esPestana(id: string): id is Pestana {
  return id === "agenda" || id === "mes" || id === "recuerdos";
}

function fichaId(): string | null {
  return state.pantalla.tipo === "ficha" ? state.pantalla.id : null;
}

function avisar(texto: string, cuerpo = false): void {
  state.aviso = texto;
  vista.pintar(state, cuerpo);
}

async function guardarPerfil(): Promise<void> {
  if (!state.perfil || !embebida || state.modo === "ejemplo") return;
  try {
    await data.set("yo", JSON.stringify(state.perfil));
  } catch (error) {
    avisar(textoFallo(error));
  }
}

async function guardarNombre(nombre: string): Promise<void> {
  const perfil = crearPerfil(nombre);
  if (!perfil) {
    avisar("Ese nombre no vale.");
    return;
  }
  if (state.perfil) perfil.id = state.perfil.id;
  perfil.avisoHoras = state.perfil?.avisoHoras ?? 24;
  perfil.vistos = state.perfil?.vistos ?? [];
  state.perfil = perfil;
  await guardarPerfil();
  state.aviso = "";
  vista.pintar(state);
}

function asegurarPerfil(nombre = ""): Perfil | null {
  if (state.perfil) return state.perfil;
  const perfil = crearPerfil(nombre);
  if (!perfil) {
    avisar("Pon tu nombre para apuntarte.");
    return null;
  }
  state.perfil = perfil;
  void guardarPerfil();
  return perfil;
}

async function leerGrupo(): Promise<Datos | null> {
  const raw = state.modo === "local" ? await data.get(CLAVE_GRUPO) : await data.sharedGet(CLAVE_GRUPO);
  return leerBolsa(raw);
}

async function publicarGrupo(): Promise<void> {
  if (state.modo === "remoto") {
    const remoto = leerBolsa(await data.sharedGet(CLAVE_GRUPO));
    if (remoto) state.datos = mezclarGrupo(remoto, state.datos);
    await data.sharedSet(CLAVE_GRUPO, bolsaJson(state.datos));
    return;
  }
  await data.set(CLAVE_GRUPO, bolsaJson(state.datos));
}

async function refrescar(): Promise<void> {
  if (state.modo !== "remoto" && state.modo !== "local") return;
  try {
    const bolsa = await leerGrupo();
    if (bolsa) state.datos = mezclarGrupo(state.datos, bolsa);
    state.aviso = "";
    vista.pintar(state);
  } catch (error) {
    avisar(textoFallo(error));
  }
}

async function mutar(op: { aviso?: string; limpiar?: string[]; aplicar: () => void }): Promise<void> {
  if (state.modo === "cargando") return;
  const copia = structuredClone(state.datos);
  op.aplicar();
  if (state.modo === "ejemplo") {
    state.aviso = op.aviso ?? "";
    vista.pintar(state, true, op.limpiar ?? []);
    return;
  }
  state.ocupado = true;
  vista.pintar(state);
  try {
    await publicarGrupo();
    state.aviso = op.aviso ?? "";
    vista.pintar(state, true, op.limpiar ?? []);
  } catch (error) {
    state.datos = copia;
    state.aviso = textoFallo(error);
    vista.pintar(state);
  } finally {
    state.ocupado = false;
    vista.pintar(state, false);
  }
}

async function actuar(accion: string, id: string): Promise<void> {
  if (accion === "tab" && esPestana(id)) {
    state.pestana = id;
    state.pantalla = { tipo: "principal" };
    state.aviso = "";
    vista.pintar(state);
    if (id === "recuerdos") await refrescar();
    return;
  }
  if (accion === "mes") {
    const delta = id === "1" ? 1 : -1;
    state.mes = moverMes(state.mes.year, state.mes.month, delta);
    state.dia = diaClave(new Date(state.mes.year, state.mes.month, 1));
    vista.pintar(state);
    return;
  }
  if (accion === "dia" && /^\d{4}-\d{2}-\d{2}$/.test(id)) {
    state.dia = id;
    vista.pintar(state);
    return;
  }
  if (accion === "abrir") {
    state.pantalla = { tipo: "ficha", id };
    state.aviso = "";
    vista.pintar(state);
    await refrescar();
    return;
  }
  if (accion === "cerrar" || accion === "alta") {
    state.pantalla = accion === "alta" ? { tipo: "alta" } : { tipo: "principal" };
    state.aviso = "";
    vista.pintar(state);
    return;
  }
  if (accion === "voy" || accion === "anular") await cambiarAsistencia(id, accion === "voy" ? "voy" : "no");
  else if (accion === "votar") await votar(id);
  else if (accion === "visto") await ocultarAviso(id);
  else if (accion === "horas") await cambiarHoras(Number(id));
  else if (accion === "actualizar" || accion === "charla" || accion === "foto") await refrescar();
}

async function cambiarAsistencia(planId: string, estado: "voy" | "no"): Promise<void> {
  const perfil = asegurarPerfil();
  if (!perfil || !state.datos.planes.some((plan) => plan.id === planId)) return;
  const fila: Asistencia = {
    planId,
    personaId: perfil.id,
    persona: perfil.nombre,
    estado,
    actualizado: new Date().toISOString(),
  };
  await mutar({
    aplicar: () => {
      state.datos = conAsistencia(state.datos, fila);
    },
  });
}

async function votar(opcionId: string): Promise<void> {
  const opcion = state.datos.opciones.find((item) => item.id === opcionId);
  const perfil = asegurarPerfil();
  if (!opcion || !perfil) return;
  const voto = {
    planId: opcion.planId,
    personaId: perfil.id,
    opcionId: opcion.id,
    persona: perfil.nombre,
    creado: new Date().toISOString(),
  };
  await mutar({
    aplicar: () => {
      state.datos = conVoto(state.datos, voto);
    },
  });
}

async function ocultarAviso(id: string): Promise<void> {
  const plan = state.datos.planes.find((item) => item.id === id);
  if (!plan || !state.perfil) return;
  state.perfil = marcarVisto(state.perfil, plan);
  await guardarPerfil();
  vista.pulso(state);
}

async function cambiarHoras(horas: number): Promise<void> {
  if (!state.perfil || horasValidas(horas) !== horas) return;
  state.perfil = { ...state.perfil, avisoHoras: horas };
  await guardarPerfil();
  vista.pintar(state);
}

async function proponer(borrador: Borrador): Promise<void> {
  const perfil = asegurarPerfil(borrador.nombre);
  if (!perfil) return;
  const validado = validarPlan(borrador, state.ahora);
  if (!validado.ok) {
    avisar(validado.error);
    return;
  }
  const creado = new Date().toISOString();
  const plan: Plan = {
    id: crearId("k"),
    ...validado.valor,
    autorId: perfil.id,
    autor: perfil.nombre,
    creado,
  };
  const asistencia: Asistencia = {
    planId: plan.id,
    personaId: perfil.id,
    persona: perfil.nombre,
    estado: "voy",
    actualizado: creado,
  };
  await mutar({
    aviso: "Plan propuesto.",
    aplicar: () => {
      state.datos = conAsistencia(conPlan(state.datos, plan), asistencia);
      state.pantalla = { tipo: "ficha", id: plan.id };
      const ms = parseInstante(plan.cuando);
      if (ms != null) {
        const fecha = new Date(ms);
        state.mes = { year: fecha.getFullYear(), month: fecha.getMonth() };
        state.dia = diaClave(fecha);
      }
    },
  });
}

async function nuevaOpcion(texto: string): Promise<void> {
  const planId = fichaId();
  const perfil = asegurarPerfil();
  if (!planId || !perfil) return;
  const validado = validarTexto(texto, LIMITES.opcion, "Escribe la opción.");
  if (!validado.ok) {
    avisar(validado.error);
    return;
  }
  if (state.datos.opciones.some((opcion) => opcion.planId === planId && opcion.texto.toLocaleLowerCase("es") === validado.valor.toLocaleLowerCase("es"))) {
    avisar("Esa opción ya está.");
    return;
  }
  const opcion = { id: crearId("o"), planId, texto: validado.valor, autorId: perfil.id, creado: new Date().toISOString() };
  await mutar({
    limpiar: ["opcion-texto"],
    aplicar: () => {
      state.datos = conOpcion(state.datos, opcion);
    },
  });
}

async function nuevoMensaje(texto: string): Promise<void> {
  const planId = fichaId();
  const perfil = asegurarPerfil();
  if (!planId || !perfil) return;
  const validado = validarTexto(texto, LIMITES.mensaje, "Escribe un mensaje.");
  if (!validado.ok) {
    avisar(validado.error);
    return;
  }
  const mensaje = {
    id: crearId("m"),
    planId,
    personaId: perfil.id,
    persona: perfil.nombre,
    texto: validado.valor,
    creado: new Date().toISOString(),
  };
  await mutar({
    limpiar: ["chat-texto"],
    aplicar: () => {
      state.datos = conMensaje(state.datos, mensaje);
    },
  });
}

async function nuevoRecuerdo(planId: string, texto: string, file: File | null): Promise<void> {
  const perfil = asegurarPerfil();
  if (!perfil || !state.datos.planes.some((plan) => plan.id === planId)) {
    avisar("Elige un plan para el recuerdo.");
    return;
  }
  const validado = validarTexto(texto, LIMITES.recuerdo, "Escribe el recuerdo.");
  if (!validado.ok) {
    avisar(validado.error);
    return;
  }
  if (file && !file.type.startsWith("image/")) {
    avisar("Eso no es una imagen.");
    return;
  }
  let foto = "";
  if (file) {
    state.ocupado = true;
    vista.pintar(state, false);
    try {
      foto = await comprimirFoto(file);
    } catch (error) {
      state.ocupado = false;
      avisar(error instanceof Error && error.message === "grande" ? "La foto no cabe en una estampa." : "No he podido leer esa foto.");
      return;
    }
    state.ocupado = false;
  }
  const recuerdo = {
    id: crearId("r"),
    planId,
    personaId: perfil.id,
    persona: perfil.nombre,
    texto: validado.valor,
    foto,
    tieneFoto: foto !== "",
    creado: new Date().toISOString(),
  };
  await mutar({
    aviso: "Recuerdo guardado.",
    limpiar: ["recuerdo-texto"],
    aplicar: () => {
      state.datos = conRecuerdo(state.datos, recuerdo);
    },
  });
}

async function hidratar(): Promise<void> {
  if (!embebida) return;
  try {
    const guardado = perfilDe(await data.get("yo"));
    if (guardado) state.perfil = guardado;
  } catch {
    /* Sin la bolsa del laboratorio se puede seguir con un nombre nuevo. */
  }
  try {
    const remoto = leerBolsa(await data.sharedGet(CLAVE_GRUPO));
    let local: Datos | null = null;
    try {
      local = leerBolsa(await data.get(CLAVE_GRUPO));
    } catch {
      local = null;
    }
    state.datos = remoto && local ? mezclarGrupo(remoto, local) : (remoto ?? local ?? datosVacios());
    state.modo = "remoto";
    if (local) {
      await data.sharedSet(CLAVE_GRUPO, bolsaJson(state.datos));
      try {
        await data.remove(CLAVE_GRUPO);
      } catch {
        /* La copia local puede quedarse si el laboratorio no la borra. */
      }
    }
    state.aviso = "";
    vista.pintar(state);
  } catch (error) {
    state.modo = "local";
    try {
      state.datos = leerBolsa(await data.get(CLAVE_GRUPO)) ?? datosVacios();
    } catch {
      state.datos = datosVacios();
    }
    state.aviso = textoFallo(error);
    vista.pintar(state);
  }
}

function stop(): void {
  if (timer === -1) return;
  window.clearInterval(timer);
  timer = -1;
  controller.abort();
  data.revoke();
}

vista.pintar(state);
senal("alive");
requestAnimationFrame(() => {
  requestAnimationFrame(() => senal("ready"));
});
void hidratar();

timer = window.setInterval(() => {
  state.ahora = Date.now();
  vista.pulso(state);
}, 1000);

document.addEventListener(
  "visibilitychange",
  () => {
    if (document.visibilityState !== "visible") return;
    state.ahora = Date.now();
    vista.pulso(state);
  },
  { signal: controller.signal },
);
window.addEventListener("pagehide", () => stop(), { signal: controller.signal });
window.__protoLabApp = { stop };
window.__protoLabPreview = async () => {
  const cena = state.datos.planes.find((plan) => plan.id === "ejcena") ?? state.datos.planes[0];
  if (!cena) return;
  const ms = parseInstante(cena.cuando);
  if (ms != null) {
    const fecha = new Date(ms);
    state.mes = { year: fecha.getFullYear(), month: fecha.getMonth() };
    state.dia = diaClave(fecha);
  }
  state.pestana = "mes";
  state.pantalla = { tipo: "principal" };
  vista.pintar(state);
};
