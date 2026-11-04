export const LIMITES = {
  titulo: 60,
  motivo: 180,
  lugar: 60,
  opcion: 60,
  mensaje: 200,
  recuerdo: 180,
  nombre: 24,
  fotoBytes: 1800,
  vistos: 32,
} as const;

export const TOPE_BOLSA = 28_000;
export const AVISO_HORAS = [6, 24, 48] as const;

export type TipoPlan = "plan" | "actividad";
export type EstadoAsistencia = "voy" | "no";
export type ModoGrupo = "remoto" | "local" | "ejemplo";

export type Plan = {
  id: string;
  titulo: string;
  motivo: string;
  cuando: string;
  lugar: string;
  tipo: TipoPlan;
  autorId: string;
  autor: string;
  creado: string;
};

export type Asistencia = {
  planId: string;
  personaId: string;
  persona: string;
  estado: EstadoAsistencia;
  actualizado: string;
};

export type Opcion = {
  id: string;
  planId: string;
  texto: string;
  autorId: string;
  creado: string;
};

export type Voto = {
  planId: string;
  personaId: string;
  opcionId: string;
  persona: string;
  creado: string;
};

export type Mensaje = {
  id: string;
  planId: string;
  personaId: string;
  persona: string;
  texto: string;
  creado: string;
};

export type Recuerdo = {
  id: string;
  planId: string;
  personaId: string;
  persona: string;
  texto: string;
  foto: string;
  tieneFoto: boolean;
  creado: string;
};

export type Datos = {
  planes: Plan[];
  asistencia: Asistencia[];
  opciones: Opcion[];
  votos: Voto[];
  mensajes: Mensaje[];
  recuerdos: Recuerdo[];
};

export type Perfil = {
  id: string;
  nombre: string;
  avisoHoras: number;
  vistos: string[];
};

export type Fallo = { ok: false; error: string };
export type Bien<T> = { ok: true; valor: T };
export type Resultado<T> = Bien<T> | Fallo;

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export const FOTO_EJEMPLO =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="#f3d2a4"/><rect x="18" y="40" width="60" height="36" rx="8" fill="#f7f1e6"/><rect x="18" y="34" width="60" height="14" rx="7" fill="#d85a32"/><circle cx="48" cy="30" r="6" fill="#f0c14d"/></svg>',
  );

export const PERFIL_EJEMPLO: Perfil = {
  id: "ejana",
  nombre: "Ana",
  avisoHoras: 24,
  vistos: [],
};

export function datosVacios(): Datos {
  return { planes: [], asistencia: [], opciones: [], votos: [], mensajes: [], recuerdos: [] };
}

export function utf8(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function crearId(prefijo: string, aleatorio: () => number = Math.random): string {
  const tiempo = Date.now().toString(36);
  const ruido = Math.floor(aleatorio() * 1_679_616)
    .toString(36)
    .padStart(4, "0");
  return `${prefijo}${tiempo}${ruido}`.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32);
}

export function horasValidas(valor: number): number {
  return valor === 6 || valor === 48 ? valor : 24;
}

export function normalizarNombre(raw: string): string | null {
  const nombre = raw.trim().replace(/\s+/g, " ");
  if (nombre.length < 1 || nombre.length > LIMITES.nombre) return null;
  if (!/^[\p{L}\p{N} .'-]+$/u.test(nombre)) return null;
  return nombre;
}

export function crearPerfil(raw: string, aleatorio: () => number = Math.random): Perfil | null {
  const nombre = normalizarNombre(raw);
  if (!nombre) return null;
  return { id: crearId("p", aleatorio), nombre, avisoHoras: 24, vistos: [] };
}

function fallo(error: string): Fallo {
  return { ok: false, error };
}

function limpio(raw: string, max: number): string | null {
  const texto = raw.trim().replace(/\s+/g, " ");
  if (texto.length < 1 || texto.length > max) return null;
  if (utf8(texto) > 2000) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(texto)) return null;
  return texto;
}

export function validarPlan(
  input: { titulo: string; motivo: string; cuandoLocal: string; lugar: string; tipo: string },
  ahora = Date.now(),
): Resultado<{ titulo: string; motivo: string; cuando: string; lugar: string; tipo: TipoPlan }> {
  const titulo = limpio(input.titulo, LIMITES.titulo);
  if (!titulo || titulo.length < 2) return fallo("Pon un título de al menos dos letras.");
  const motivo = input.motivo.trim();
  if (motivo.length < 4 || motivo.length > LIMITES.motivo) return fallo("Cuenta el motivo en una frase.");
  if (utf8(motivo) > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(motivo)) return fallo("El motivo no se puede guardar así.");
  const lugar = input.lugar.trim().replace(/\s+/g, " ");
  if (lugar.length > LIMITES.lugar) return fallo("El lugar es demasiado largo.");
  if (input.tipo !== "plan" && input.tipo !== "actividad") return fallo("Elige plan o actividad.");
  const fecha = new Date(input.cuandoLocal);
  if (Number.isNaN(fecha.getTime())) return fallo("La fecha no vale.");
  if (fecha.getTime() < ahora - 366 * 86_400_000) return fallo("Esa fecha queda muy atrás.");
  if (fecha.getTime() > ahora + 732 * 86_400_000) return fallo("Esa fecha queda muy lejos.");
  return {
    ok: true,
    valor: { titulo, motivo, cuando: fecha.toISOString(), lugar, tipo: input.tipo },
  };
}

export function validarTexto(raw: string, max: number, vacio: string): Resultado<string> {
  const texto = raw.trim();
  if (texto.length < 1) return fallo(vacio);
  if (texto.length > max) return fallo("Se pasa del tamaño.");
  if (utf8(texto) > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(texto)) return fallo("Ese texto no se puede guardar.");
  return { ok: true, valor: texto };
}

export function fotoSegura(url: string): string {
  if (typeof url !== "string") return "";
  if (utf8(url) > LIMITES.fotoBytes) return "";
  if (
    url.startsWith("data:image/jpeg") ||
    url.startsWith("data:image/png") ||
    url.startsWith("data:image/webp") ||
    url.startsWith("data:image/svg+xml")
  ) {
    return url;
  }
  return "";
}

export function parseInstante(value: string): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const normal = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const ms = Date.parse(normal);
  return Number.isFinite(ms) ? ms : null;
}

export function aIso(value: string): string {
  const ms = parseInstante(value);
  return ms == null ? value : new Date(ms).toISOString();
}

export function diaClave(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

export function fechaLocalValor(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}

export function textoCuando(iso: string): string {
  const ms = parseInstante(iso);
  if (ms == null) return "";
  const fecha = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DIAS[fecha.getDay()]} ${fecha.getDate()} ${MESES[fecha.getMonth()]} · ${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}

export function tituloMes(year: number, month: number): string {
  return `${MESES_LARGOS[month] ?? ""} ${year}`.trim();
}

export function textoPlazo(desdeMs: number, hastaIso: string): string {
  const delta = (parseInstante(hastaIso) ?? Number.NaN) - desdeMs;
  if (!Number.isFinite(delta)) return "";
  if (delta < 0) return "ya pasó";
  const min = Math.round(delta / 60_000);
  if (min < 60) return `en ${Math.max(1, min)} min`;
  const horas = Math.round(delta / 3_600_000);
  if (horas < 24) return `en ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "mañana" : `en ${dias} días`;
}

export function rangoMes(year: number, month: number): { desde: string; hasta: string } {
  return {
    desde: new Date(year, month, 1).toISOString(),
    hasta: new Date(year, month + 1, 1).toISOString(),
  };
}

export function rangoAmplio(ahora: Date): { desde: string; hasta: string } {
  return {
    desde: new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString(),
    hasta: new Date(ahora.getFullYear(), ahora.getMonth() + 3, 1).toISOString(),
  };
}

export function moverMes(year: number, month: number, delta: number): { year: number; month: number } {
  const fecha = new Date(year, month + delta, 1);
  return { year: fecha.getFullYear(), month: fecha.getMonth() };
}

export type CeldaMes = { clave: string; numero: number; enMes: boolean };

export function celdasMes(year: number, month: number): CeldaMes[] {
  const primero = new Date(year, month, 1);
  const inicio = new Date(year, month, 1 - ((primero.getDay() + 6) % 7));
  const celdas: CeldaMes[] = [];
  for (let i = 0; i < 42; i += 1) {
    const fecha = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    celdas.push({
      clave: diaClave(fecha),
      numero: fecha.getDate(),
      enMes: fecha.getMonth() === month,
    });
  }
  return celdas;
}

export function modoTrasDatos(ok: boolean, embebida: boolean): ModoGrupo {
  if (ok) return "remoto";
  return embebida ? "local" : "ejemplo";
}

export function conAsistencia(datos: Datos, item: Asistencia): Datos {
  const asistencia = datos.asistencia.filter((fila) => !(fila.planId === item.planId && fila.personaId === item.personaId));
  return { ...datos, asistencia: [...asistencia, item] };
}

export function conVoto(datos: Datos, voto: Voto): Datos {
  const votos = datos.votos.filter((fila) => !(fila.planId === voto.planId && fila.personaId === voto.personaId));
  return { ...datos, votos: [...votos, voto] };
}

export function conPlan(datos: Datos, plan: Plan): Datos {
  return { ...datos, planes: [...datos.planes.filter((fila) => fila.id !== plan.id), plan] };
}

export function conOpcion(datos: Datos, opcion: Opcion): Datos {
  return { ...datos, opciones: [...datos.opciones.filter((fila) => fila.id !== opcion.id), opcion] };
}

export function conMensaje(datos: Datos, mensaje: Mensaje): Datos {
  return { ...datos, mensajes: [...datos.mensajes.filter((fila) => fila.id !== mensaje.id), mensaje] };
}

export function conRecuerdo(datos: Datos, recuerdo: Recuerdo): Datos {
  return { ...datos, recuerdos: [recuerdo, ...datos.recuerdos.filter((fila) => fila.id !== recuerdo.id)] };
}

export type Recuento = { opcion: Opcion; votos: number; mio: boolean };

export function recuento(datos: Datos, planId: string, personaId: string | null): Recuento[] {
  const opciones = datos.opciones.filter((opcion) => opcion.planId === planId);
  return opciones.map((opcion) => ({
    opcion,
    votos: datos.votos.filter((voto) => voto.planId === planId && voto.opcionId === opcion.id).length,
    mio: personaId != null && datos.votos.some((voto) => voto.planId === planId && voto.personaId === personaId && voto.opcionId === opcion.id),
  }));
}

export function miEstado(datos: Datos, planId: string, personaId: string | null): EstadoAsistencia | null {
  if (!personaId) return null;
  return datos.asistencia.find((fila) => fila.planId === planId && fila.personaId === personaId)?.estado ?? null;
}

function unirNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

export function textoGente(datos: Datos, planId: string): string {
  const van = datos.asistencia.filter((fila) => fila.planId === planId && fila.estado === "voy").map((fila) => fila.persona);
  const no = datos.asistencia.filter((fila) => fila.planId === planId && fila.estado === "no").map((fila) => fila.persona);
  const partes: string[] = [];
  if (van.length === 1) partes.push(`${van[0]} va`);
  else if (van.length > 1) partes.push(`${unirNombres(van)} van`);
  if (no.length === 1) partes.push(`${no[0]} no va`);
  else if (no.length > 1) partes.push(`${unirNombres(no)} no van`);
  return partes.join(" · ");
}

function implica(plan: Plan, asistencia: Asistencia[], personaId: string): boolean {
  const fila = asistencia.find((item) => item.planId === plan.id && item.personaId === personaId);
  if (fila?.estado === "no") return false;
  if (fila?.estado === "voy") return true;
  return plan.autorId === personaId;
}

export function claveVisto(plan: Plan): string {
  return `${plan.id}|${plan.cuando}`;
}

export function recordatorios(planes: Plan[], asistencia: Asistencia[], perfil: Perfil, ahora: number): Plan[] {
  const lead = horasValidas(perfil.avisoHoras) * 3_600_000;
  const vistos = new Set(perfil.vistos);
  return planes
    .filter((plan) => {
      const ms = parseInstante(plan.cuando);
      if (ms == null) return false;
      const delta = ms - ahora;
      if (delta < 0 || delta > lead) return false;
      if (vistos.has(claveVisto(plan))) return false;
      return implica(plan, asistencia, perfil.id);
    })
    .sort((a, b) => a.cuando.localeCompare(b.cuando));
}

export function marcarVisto(perfil: Perfil, plan: Plan): Perfil {
  const clave = claveVisto(plan);
  const vistos = [...perfil.vistos.filter((item) => item !== clave), clave].slice(-LIMITES.vistos);
  return { ...perfil, vistos };
}

export function partirAgenda(planes: Plan[], ahora: number): { proximos: Plan[]; pasados: Plan[] } {
  const inicio = new Date(ahora);
  inicio.setHours(0, 0, 0, 0);
  const corte = inicio.getTime();
  const proximos: Plan[] = [];
  const pasados: Plan[] = [];
  for (const plan of planes) {
    const ms = parseInstante(plan.cuando);
    if (ms == null) continue;
    if (ms >= corte) proximos.push(plan);
    else pasados.push(plan);
  }
  proximos.sort((a, b) => a.cuando.localeCompare(b.cuando));
  pasados.sort((a, b) => b.cuando.localeCompare(a.cuando));
  return { proximos, pasados: pasados.slice(0, 8) };
}

export function planesDelDia(planes: Plan[], dia: string): Plan[] {
  return planes
    .filter((plan) => {
      const ms = parseInstante(plan.cuando);
      return ms != null && diaClave(new Date(ms)) === dia;
    })
    .sort((a, b) => a.cuando.localeCompare(b.cuando));
}

export function mezclarRecuerdos(previos: Recuerdo[], nuevos: Recuerdo[]): Recuerdo[] {
  const mapa = new Map(previos.map((recuerdo) => [recuerdo.id, recuerdo]));
  for (const nuevo of nuevos) {
    const previo = mapa.get(nuevo.id);
    mapa.set(nuevo.id, {
      ...nuevo,
      foto: nuevo.foto || previo?.foto || "",
      tieneFoto: nuevo.tieneFoto || Boolean(previo?.foto),
    });
  }
  return [...mapa.values()].sort((a, b) => b.creado.localeCompare(a.creado));
}

export function planesPorSubir(local: Datos, remotos: Plan[]): Plan[] {
  const ids = new Set(remotos.map((plan) => plan.id));
  return local.planes.filter((plan) => !ids.has(plan.id));
}

export function volcadoDe(bolsa: Datos, nuevos: Plan[]): Datos {
  const ids = new Set(nuevos.map((plan) => plan.id));
  const dentro = (planId: string) => ids.has(planId);
  return {
    planes: nuevos,
    asistencia: bolsa.asistencia.filter((fila) => dentro(fila.planId)),
    opciones: bolsa.opciones.filter((fila) => dentro(fila.planId)),
    votos: bolsa.votos.filter((fila) => dentro(fila.planId)),
    mensajes: bolsa.mensajes.filter((fila) => dentro(fila.planId)),
    recuerdos: bolsa.recuerdos.filter((fila) => dentro(fila.planId)),
  };
}

/** Une dos bolsas. En un mismo plan o un mismo voto gana la copia más reciente. */
export function mezclarGrupo(anterior: Datos, reciente: Datos): Datos {
  const planes = new Map(anterior.planes.map((plan) => [plan.id, plan]));
  for (const plan of reciente.planes) planes.set(plan.id, plan);

  const asistencia = new Map(anterior.asistencia.map((fila) => [`${fila.planId}\0${fila.personaId}`, fila]));
  for (const fila of reciente.asistencia) {
    const clave = `${fila.planId}\0${fila.personaId}`;
    const previa = asistencia.get(clave);
    if (!previa || fila.actualizado >= previa.actualizado) asistencia.set(clave, fila);
  }

  const votos = new Map(anterior.votos.map((fila) => [`${fila.planId}\0${fila.personaId}`, fila]));
  for (const fila of reciente.votos) {
    const clave = `${fila.planId}\0${fila.personaId}`;
    const previo = votos.get(clave);
    if (!previo || fila.creado >= previo.creado) votos.set(clave, fila);
  }

  const porId = <T extends { id: string }>(previas: T[], nuevas: T[]): T[] => {
    const mapa = new Map(previas.map((fila) => [fila.id, fila]));
    for (const fila of nuevas) mapa.set(fila.id, fila);
    return [...mapa.values()];
  };

  return {
    planes: [...planes.values()],
    asistencia: [...asistencia.values()],
    opciones: porId(anterior.opciones, reciente.opciones),
    votos: [...votos.values()],
    mensajes: porId(anterior.mensajes, reciente.mensajes),
    recuerdos: mezclarRecuerdos(anterior.recuerdos, reciente.recuerdos),
  };
}

export function fusionarDatos(base: Datos, extra: Datos): Datos {
  const ids = new Set(extra.planes.map((plan) => plan.id));
  const planes = new Map(base.planes.map((plan) => [plan.id, plan]));
  for (const plan of extra.planes) planes.set(plan.id, plan);
  const porId = <T extends { id: string }>(previas: T[], nuevas: T[]): T[] => {
    const mapa = new Map(previas.map((fila) => [fila.id, fila]));
    for (const fila of nuevas) mapa.set(fila.id, fila);
    return [...mapa.values()];
  };
  return {
    planes: [...planes.values()],
    asistencia: [...base.asistencia.filter((fila) => !ids.has(fila.planId)), ...extra.asistencia],
    opciones: [...base.opciones.filter((fila) => !ids.has(fila.planId)), ...extra.opciones],
    votos: [...base.votos.filter((fila) => !ids.has(fila.planId)), ...extra.votos],
    mensajes: porId(base.mensajes, extra.mensajes),
    recuerdos: porId(base.recuerdos, extra.recuerdos),
  };
}

function textoFila(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

export function planDesdeFila(row: Record<string, unknown>): Plan | null {
  const id = textoFila(row, "id");
  const titulo = textoFila(row, "titulo");
  const motivo = textoFila(row, "motivo");
  const cuando = textoFila(row, "cuando");
  const lugar = textoFila(row, "lugar");
  const tipo = textoFila(row, "tipo");
  const autorId = textoFila(row, "autor_id");
  const autor = textoFila(row, "autor");
  const creado = textoFila(row, "creado");
  if (!id || !titulo || motivo == null || !cuando || lugar == null || (tipo !== "plan" && tipo !== "actividad") || !autorId || !autor || !creado) {
    return null;
  }
  if (parseInstante(cuando) == null) return null;
  return { id, titulo, motivo, cuando: aIso(cuando), lugar, tipo, autorId, autor, creado: aIso(creado) };
}

export function asistenciaDesdeFila(row: Record<string, unknown>): Asistencia | null {
  const planId = textoFila(row, "plan_id");
  const personaId = textoFila(row, "persona_id");
  const persona = textoFila(row, "persona");
  const estado = textoFila(row, "estado");
  const actualizado = textoFila(row, "actualizado");
  if (!planId || !personaId || !persona || (estado !== "voy" && estado !== "no") || !actualizado) return null;
  return { planId, personaId, persona, estado, actualizado: aIso(actualizado) };
}

export function opcionDesdeFila(row: Record<string, unknown>): Opcion | null {
  const id = textoFila(row, "id");
  const planId = textoFila(row, "plan_id");
  const texto = textoFila(row, "texto");
  const autorId = textoFila(row, "autor_id");
  const creado = textoFila(row, "creado");
  if (!id || !planId || !texto || !autorId || !creado) return null;
  return { id, planId, texto, autorId, creado: aIso(creado) };
}

export function votoDesdeFila(row: Record<string, unknown>): Voto | null {
  const planId = textoFila(row, "plan_id");
  const personaId = textoFila(row, "persona_id");
  const opcionId = textoFila(row, "opcion_id");
  const persona = textoFila(row, "persona");
  const creado = textoFila(row, "creado");
  if (!planId || !personaId || !opcionId || !persona || !creado) return null;
  return { planId, personaId, opcionId, persona, creado: aIso(creado) };
}

export function mensajeDesdeFila(row: Record<string, unknown>): Mensaje | null {
  const id = textoFila(row, "id");
  const planId = textoFila(row, "plan_id");
  const personaId = textoFila(row, "persona_id");
  const persona = textoFila(row, "persona");
  const texto = textoFila(row, "texto");
  const creado = textoFila(row, "creado");
  if (!id || !planId || !personaId || !persona || !texto || !creado) return null;
  return { id, planId, personaId, persona, texto, creado: aIso(creado) };
}

export function recuerdoDesdeFila(row: Record<string, unknown>): Recuerdo | null {
  const id = textoFila(row, "id");
  const planId = textoFila(row, "plan_id");
  const personaId = textoFila(row, "persona_id");
  const persona = textoFila(row, "persona");
  const texto = textoFila(row, "texto");
  const creado = textoFila(row, "creado");
  if (!id || !planId || !personaId || !persona || !texto || !creado) return null;
  const marca = row.tiene_foto;
  const foto = fotoSegura(typeof row.foto === "string" ? row.foto : "");
  const tieneFoto = foto !== "" || marca === 1 || marca === true || marca === "1";
  return { id, planId, personaId, persona, texto, foto, tieneFoto, creado: aIso(creado) };
}

export function perfilDesde(raw: unknown): Perfil | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const fila = raw as Record<string, unknown>;
  if (typeof fila.id !== "string" || !/^[a-z0-9]{4,32}$/.test(fila.id)) return null;
  if (typeof fila.nombre !== "string") return null;
  const nombre = normalizarNombre(fila.nombre);
  if (!nombre) return null;
  const avisoHoras = horasValidas(typeof fila.avisoHoras === "number" ? fila.avisoHoras : 24);
  const vistos = Array.isArray(fila.vistos)
    ? fila.vistos.filter((item): item is string => typeof item === "string" && item.length <= 80).slice(-LIMITES.vistos)
    : [];
  return { id: fila.id, nombre, avisoHoras, vistos };
}

function planGuardado(row: Record<string, unknown>): Plan | null {
  const id = textoFila(row, "id");
  const titulo = textoFila(row, "titulo");
  const motivo = textoFila(row, "motivo");
  const cuando = textoFila(row, "cuando");
  const lugar = textoFila(row, "lugar");
  const tipo = row.tipo;
  const autorId = textoFila(row, "autorId");
  const autor = textoFila(row, "autor");
  const creado = textoFila(row, "creado");
  if (!id || !titulo || motivo == null || !cuando || lugar == null || (tipo !== "plan" && tipo !== "actividad") || !autorId || !autor || !creado) return null;
  if (parseInstante(cuando) == null) return null;
  return { id, titulo, motivo, cuando: aIso(cuando), lugar, tipo, autorId, autor, creado: aIso(creado) };
}

function asistenciaGuardada(row: Record<string, unknown>): Asistencia | null {
  const planId = textoFila(row, "planId");
  const personaId = textoFila(row, "personaId");
  const persona = textoFila(row, "persona");
  const estado = row.estado;
  const actualizado = textoFila(row, "actualizado");
  if (!planId || !personaId || !persona || (estado !== "voy" && estado !== "no") || !actualizado) return null;
  return { planId, personaId, persona, estado, actualizado: aIso(actualizado) };
}

function opcionGuardada(row: Record<string, unknown>): Opcion | null {
  const id = textoFila(row, "id");
  const planId = textoFila(row, "planId");
  const texto = textoFila(row, "texto");
  const autorId = textoFila(row, "autorId");
  const creado = textoFila(row, "creado");
  if (!id || !planId || !texto || !autorId || !creado) return null;
  return { id, planId, texto, autorId, creado: aIso(creado) };
}

function votoGuardado(row: Record<string, unknown>): Voto | null {
  const planId = textoFila(row, "planId");
  const personaId = textoFila(row, "personaId");
  const opcionId = textoFila(row, "opcionId");
  const persona = textoFila(row, "persona");
  const creado = textoFila(row, "creado");
  if (!planId || !personaId || !opcionId || !persona || !creado) return null;
  return { planId, personaId, opcionId, persona, creado: aIso(creado) };
}

function mensajeGuardado(row: Record<string, unknown>): Mensaje | null {
  const id = textoFila(row, "id");
  const planId = textoFila(row, "planId");
  const personaId = textoFila(row, "personaId");
  const persona = textoFila(row, "persona");
  const texto = textoFila(row, "texto");
  const creado = textoFila(row, "creado");
  if (!id || !planId || !personaId || !persona || !texto || !creado) return null;
  return { id, planId, personaId, persona, texto, creado: aIso(creado) };
}

function recuerdoGuardado(row: Record<string, unknown>): Recuerdo | null {
  const id = textoFila(row, "id");
  const planId = textoFila(row, "planId");
  const personaId = textoFila(row, "personaId");
  const persona = textoFila(row, "persona");
  const texto = textoFila(row, "texto");
  const creado = textoFila(row, "creado");
  if (!id || !planId || !personaId || !persona || !texto || !creado) return null;
  const foto = fotoSegura(typeof row.foto === "string" ? row.foto : "");
  return { id, planId, personaId, persona, texto, foto, tieneFoto: row.tieneFoto === true || foto !== "", creado: aIso(creado) };
}

export function leerBolsa(raw: string | null): Datos | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const fila = parsed as Record<string, unknown>;
  const lista = (key: string): Record<string, unknown>[] =>
    Array.isArray(fila[key]) ? fila[key].filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item)) : [];
  return {
    planes: lista("planes").map(planGuardado).filter((item): item is Plan => item != null),
    asistencia: lista("asistencia").map(asistenciaGuardada).filter((item): item is Asistencia => item != null),
    opciones: lista("opciones").map(opcionGuardada).filter((item): item is Opcion => item != null),
    votos: lista("votos").map(votoGuardado).filter((item): item is Voto => item != null),
    mensajes: lista("mensajes").map(mensajeGuardado).filter((item): item is Mensaje => item != null),
    recuerdos: lista("recuerdos").map(recuerdoGuardado).filter((item): item is Recuerdo => item != null),
  };
}

export function bolsaJson(datos: Datos): string {
  const compacta = (recuerdos: Recuerdo[], mensajes: Mensaje[]): string =>
    JSON.stringify({ ...datos, recuerdos, mensajes });
  let json = compacta(datos.recuerdos, datos.mensajes);
  if (utf8(json) <= TOPE_BOLSA) return json;
  json = compacta(
    datos.recuerdos.map((recuerdo) => ({ ...recuerdo, foto: "", tieneFoto: false })),
    datos.mensajes.slice(-40),
  );
  if (utf8(json) <= TOPE_BOLSA) return json;
  return compacta(
    datos.recuerdos.slice(0, 20).map((recuerdo) => ({ ...recuerdo, foto: "", tieneFoto: false })),
    [],
  );
}

export function textoFallo(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "quota") return "Se ha alcanzado el cupo gratuito. No se ha guardado.";
  if (code === "unauthorized") return "Hace falta la sesión del laboratorio.";
  if (code === "config") return "La base compartida no está en este despliegue.";
  if (code === "timeout") return "El laboratorio no ha respondido.";
  return "No he podido hablar con el grupo.";
}

function dentroDe(horas: number, ahora: Date): string {
  return new Date(ahora.getTime() + horas * 3_600_000).toISOString();
}

export function datosEjemplo(ahora: Date): Datos {
  const creado = ahora.toISOString();
  const planes: Plan[] = [
    {
      id: "ejcena",
      titulo: "Cena en casa de Luis",
      motivo: "Hace un mes que no coincidimos y Luis estrena cocina.",
      cuando: dentroDe(5, ahora),
      lugar: "Casa de Luis",
      tipo: "plan",
      autorId: "ejana",
      autor: "Ana",
      creado,
    },
    {
      id: "ejruta",
      titulo: "Ruta al pantano",
      motivo: "Hay que decidir el camino antes de quedar a las once.",
      cuando: dentroDe(72, ahora),
      lugar: "Aparcamiento del pantano",
      tipo: "actividad",
      autorId: "ejluis",
      autor: "Luis",
      creado,
    },
    {
      id: "ejjuegos",
      titulo: "Noche de juegos",
      motivo: "Probar el juego nuevo sin que se haga eterno.",
      cuando: dentroDe(140, ahora),
      lugar: "Casa de Ana",
      tipo: "plan",
      autorId: "ejana",
      autor: "Ana",
      creado,
    },
    {
      id: "ejtarta",
      titulo: "Tarta de cumpleaños",
      motivo: "El cumpleaños de Nuria fue en casa.",
      cuando: dentroDe(-20, ahora),
      lugar: "Casa de Nuria",
      tipo: "plan",
      autorId: "ejnuria",
      autor: "Nuria",
      creado,
    },
  ];
  const asistencia: Asistencia[] = [
    { planId: "ejcena", personaId: "ejana", persona: "Ana", estado: "voy", actualizado: creado },
    { planId: "ejcena", personaId: "ejluis", persona: "Luis", estado: "voy", actualizado: creado },
    { planId: "ejcena", personaId: "ejnuria", persona: "Nuria", estado: "no", actualizado: creado },
    { planId: "ejruta", personaId: "ejluis", persona: "Luis", estado: "voy", actualizado: creado },
  ];
  const opciones: Opcion[] = [
    { id: "ojnorte", planId: "ejruta", texto: "Orilla norte", autorId: "ejluis", creado },
    { id: "ojpinar", planId: "ejruta", texto: "El pinar", autorId: "ejnuria", creado },
  ];
  const votos: Voto[] = [
    { planId: "ejruta", personaId: "ejluis", opcionId: "ojnorte", persona: "Luis", creado },
    { planId: "ejruta", personaId: "ejnuria", opcionId: "ojnorte", persona: "Nuria", creado },
    { planId: "ejruta", personaId: "ejmateo", opcionId: "ojpinar", persona: "Mateo", creado },
  ];
  const mensajes: Mensaje[] = [
    { id: "mc1", planId: "ejcena", personaId: "ejluis", persona: "Luis", texto: "Yo pongo el postre si alguien lleva pan.", creado },
    { id: "mc2", planId: "ejcena", personaId: "ejnuria", persona: "Nuria", texto: "Llego un poco tarde, sobre las nueve.", creado },
    { id: "mr1", planId: "ejruta", personaId: "ejluis", persona: "Luis", texto: "Si llueve, el pinar resbala.", creado },
  ];
  const recuerdos: Recuerdo[] = [
    {
      id: "rtarta",
      planId: "ejtarta",
      personaId: "ejana",
      persona: "Ana",
      texto: "La tarta de limón y el brindis.",
      foto: FOTO_EJEMPLO,
      tieneFoto: true,
      creado,
    },
  ];
  return { planes, asistencia, opciones, votos, mensajes, recuerdos };
}
