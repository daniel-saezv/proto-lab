export const ARENA = 16.2;
export const CASTILLO = 3.15;
export const NIVEL_MAX = 12;
const HORA_S = 16;

export const PLANETAS = ["sol", "luna", "marte", "mercurio", "jupiter", "venus", "saturno"] as const;
export type PlanetaId = (typeof PLANETAS)[number];

export const CLASE_IDS = ["caballero", "ballestero", "fraile", "astrologo"] as const;
export type ClaseId = (typeof CLASE_IDS)[number];

export const OBRA_IDS = ["muralla", "torre", "granero", "capilla", "observatorio"] as const;
export type ObraId = (typeof OBRA_IDS)[number];

export const FICHA_IDS = ["infante", "arquero", "jinete", "ariete", "verde", "espectro", "dragon"] as const;
export type FichaId = (typeof FICHA_IDS)[number];

export type Coste = { oro: number; madera: number; piedra: number };

export type Clase = {
  id: ClaseId;
  nombre: string;
  oficio: string;
  vida: number;
  mana: number;
  dano: number;
  alcance: number;
  velocidad: number;
  cadencia: number;
  planeta: PlanetaId;
};

export const CLASES: Record<ClaseId, Clase> = {
  caballero: {
    id: "caballero",
    nombre: "Caballero",
    oficio: "Hombre de armas del siglo XII",
    vida: 128,
    mana: 46,
    dano: 16,
    alcance: 1.75,
    velocidad: 5.2,
    cadencia: 0.48,
    planeta: "marte",
  },
  ballestero: {
    id: "ballestero",
    nombre: "Ballestero",
    oficio: "Ballestero de las compañías",
    vida: 86,
    mana: 58,
    dano: 13,
    alcance: 8.2,
    velocidad: 5.4,
    cadencia: 0.62,
    planeta: "mercurio",
  },
  fraile: {
    id: "fraile",
    nombre: "Fraile",
    oficio: "Hermano del hospital",
    vida: 108,
    mana: 92,
    dano: 11,
    alcance: 1.85,
    velocidad: 5,
    cadencia: 0.55,
    planeta: "luna",
  },
  astrologo: {
    id: "astrologo",
    nombre: "Astrólogo",
    oficio: "Maestro de las esferas",
    vida: 74,
    mana: 120,
    dano: 12,
    alcance: 6.2,
    velocidad: 5.1,
    cadencia: 0.58,
    planeta: "sol",
  },
};

type Ficha = {
  vida: number;
  dano: number;
  alcance: number;
  velocidad: number;
  cadencia: number;
  oro: number;
  xp: number;
  radio: number;
  madera: number;
  piedra: number;
};

export const FICHAS: Record<FichaId, Ficha> = {
  infante: { vida: 34, dano: 7, alcance: 1.35, velocidad: 2.45, cadencia: 1.05, oro: 3, xp: 8, radio: 0.46, madera: 0, piedra: 0 },
  arquero: { vida: 24, dano: 6, alcance: 7.5, velocidad: 2.25, cadencia: 1.3, oro: 4, xp: 9, radio: 0.42, madera: 1, piedra: 0 },
  jinete: { vida: 64, dano: 12, alcance: 1.7, velocidad: 3.7, cadencia: 0.95, oro: 6, xp: 14, radio: 0.72, madera: 0, piedra: 1 },
  ariete: { vida: 150, dano: 11, alcance: 1.9, velocidad: 1.3, cadencia: 1.45, oro: 12, xp: 22, radio: 1.05, madera: 2, piedra: 2 },
  verde: { vida: 100, dano: 13, alcance: 1.8, velocidad: 3.15, cadencia: 0.8, oro: 16, xp: 20, radio: 0.55, madera: 0, piedra: 1 },
  espectro: { vida: 18, dano: 5, alcance: 1.4, velocidad: 5.2, cadencia: 0.7, oro: 2, xp: 6, radio: 0.4, madera: 0, piedra: 0 },
  dragon: { vida: 220, dano: 16, alcance: 2.35, velocidad: 2.3, cadencia: 1.15, oro: 30, xp: 40, radio: 1.25, madera: 3, piedra: 3 },
};

export type Hechizo = {
  nombre: string;
  mana: number;
  cd: number;
  radio: number;
};

export const HECHIZOS: Record<PlanetaId, Hechizo> = {
  sol: { nombre: "Rayo solar", mana: 26, cd: 8, radio: 4.4 },
  luna: { nombre: "Luz de luna", mana: 22, cd: 9, radio: 0 },
  marte: { nombre: "Hierro de Marte", mana: 18, cd: 6, radio: 2.35 },
  mercurio: { nombre: "Paso de Mercurio", mana: 14, cd: 8, radio: 0 },
  jupiter: { nombre: "Fortuna de Júpiter", mana: 20, cd: 12, radio: 0 },
  venus: { nombre: "Paz de Venus", mana: 22, cd: 11, radio: 6.2 },
  saturno: { nombre: "Plomo de Saturno", mana: 24, cd: 9, radio: 5.4 },
};

export type Obra = {
  nombre: string;
  nota: string;
  max: number;
};

export const OBRAS: Record<ObraId, Obra> = {
  muralla: { nombre: "Muralla", nota: "Cada lienzo resta daño.", max: 3 },
  torre: { nombre: "Torre", nota: "Dispara a quien se acerca.", max: 3 },
  granero: { nombre: "Granero", nota: "El grano cierra las heridas.", max: 3 },
  capilla: { nombre: "Capilla", nota: "Devuelve el aliento.", max: 3 },
  observatorio: { nombre: "Observatorio", nota: "Afina las esferas.", max: 3 },
};

type Grupo = { tipo: FichaId; n: number };

type Guerra = {
  anio: number;
  nombre: string;
  nota: string;
  oleadas: Grupo[][];
};

export const GUERRAS: readonly Guerra[] = [
  {
    anio: 1066,
    nombre: "Hastings",
    nota: "La hueste normanda baja la colina.",
    oleadas: [
      [{ tipo: "infante", n: 3 }],
      [{ tipo: "infante", n: 3 }, { tipo: "arquero", n: 2 }],
      [{ tipo: "arquero", n: 3 }, { tipo: "infante", n: 2 }],
    ],
  },
  {
    anio: 1212,
    nombre: "Las Navas",
    nota: "La caballería pesada cruza el llano.",
    oleadas: [
      [{ tipo: "jinete", n: 2 }, { tipo: "infante", n: 2 }],
      [{ tipo: "jinete", n: 3 }, { tipo: "arquero", n: 2 }],
    ],
  },
  {
    anio: 1346,
    nombre: "Crécy",
    nota: "Una lluvia de virotes cubre el campo.",
    oleadas: [
      [{ tipo: "arquero", n: 5 }],
      [{ tipo: "arquero", n: 4 }, { tipo: "infante", n: 3 }],
    ],
  },
  {
    anio: 1453,
    nombre: "Constantinopla",
    nota: "El ariete llega a la puerta.",
    oleadas: [
      [{ tipo: "infante", n: 4 }, { tipo: "arquero", n: 2 }],
      [{ tipo: "ariete", n: 1 }, { tipo: "infante", n: 3 }],
    ],
  },
];

const MITOS = ["dama", "melusina", "fatuo", "perro", "verde", "caceria", "dragon"] as const;
type MitoId = (typeof MITOS)[number];

export type Enemigo = {
  id: number;
  tipo: FichaId;
  origen: "oleada" | "mito";
  x: number;
  z: number;
  vida: number;
  vidaMax: number;
  cd: number;
  freno: number;
  sangrado: number;
  sangradoPoder: number;
};

export type Botin = {
  id: number;
  x: number;
  z: number;
  oro: number;
  madera: number;
  piedra: number;
  cura: number;
};

export type Pulso = {
  x: number;
  z: number;
  radio: number;
  vida: number;
  tono: "dano" | "cura" | "freno";
};

export type Estado = {
  fase: "juego" | "caido";
  clase: ClaseId;
  oficioAbierto: boolean;
  nivel: number;
  xp: number;
  vida: number;
  vidaMax: number;
  mana: number;
  manaMax: number;
  dano: number;
  alcance: number;
  velocidad: number;
  cadencia: number;
  cdGolpe: number;
  x: number;
  z: number;
  dir: number;
  destino: { x: number; z: number } | null;
  objetivo: number | null;
  oro: number;
  madera: number;
  piedra: number;
  obras: Record<ObraId, number>;
  cds: Record<PlanetaId, number>;
  hora: number;
  horaT: number;
  buffVel: number;
  buffOro: number;
  guerra: number;
  ciclo: number;
  oleada: number;
  pausa: number;
  anio: number;
  enemigos: Enemigo[];
  botin: Botin[];
  aviso: string;
  avisoT: number;
  siguienteId: number;
  bajas: number;
  torreCd: number;
  pulso: Pulso | null;
  semilla: number;
};

export type Resultado = { ok: true } | { ok: false; motivo: string };

export type Azar = () => number;

export function crearAzar(semilla: number): Azar {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cdsVacios(): Record<PlanetaId, number> {
  return { sol: 0, luna: 0, marte: 0, mercurio: 0, jupiter: 0, venus: 0, saturno: 0 };
}

function obrasVacias(): Record<ObraId, number> {
  return { muralla: 0, torre: 0, granero: 0, capilla: 0, observatorio: 0 };
}

export function xpPara(nivel: number): number {
  return 18 + (Math.max(1, nivel) - 1) * 10;
}

export function atributos(clase: ClaseId, nivel: number): Pick<Estado, "vidaMax" | "manaMax" | "dano" | "alcance" | "velocidad" | "cadencia"> {
  const base = CLASES[clase];
  const extra = Math.max(0, nivel - 1);
  return {
    vidaMax: base.vida + extra * 10,
    manaMax: base.mana + extra * 6,
    dano: base.dano + extra * 2,
    alcance: base.alcance,
    velocidad: base.velocidad,
    cadencia: Math.max(0.28, base.cadencia - extra * 0.012),
  };
}

export function planetasDe(clase: ClaseId, nivel: number): PlanetaId[] {
  const afin = CLASES[clase].planeta;
  const orden = [afin, ...PLANETAS.filter((planeta) => planeta !== afin)];
  const n = Math.max(0, Math.min(orden.length, Math.floor(nivel)));
  return orden.slice(0, n);
}

export function nivelDePlaneta(clase: ClaseId, planeta: PlanetaId): number {
  const afin = CLASES[clase].planeta;
  const orden = [afin, ...PLANETAS.filter((item) => item !== afin)];
  return orden.indexOf(planeta) + 1;
}

export function poderDe(estado: Estado, planeta: PlanetaId): number {
  const afin = CLASES[estado.clase].planeta === planeta ? 1.35 : 1;
  const hora = PLANETAS[estado.hora] === planeta ? 1.28 : 1;
  const ojo = 1 + estado.obras.observatorio * 0.15;
  return afin * hora * ojo;
}

export function danoTrasMuralla(base: number, lienzos: number): number {
  const reduccion = Math.min(0.48, Math.max(0, lienzos) * 0.12);
  return Math.max(1, Math.round(base * (1 - reduccion)));
}

export function costeDe(obra: ObraId, nivel: number): Coste {
  const n = Math.max(0, nivel);
  if (obra === "muralla") return { oro: 0, madera: 0, piedra: 4 + n * 4 };
  if (obra === "torre") return { oro: 0, madera: 4 + n * 2, piedra: 4 + n * 3 };
  if (obra === "granero") return { oro: 1 + n, madera: 6 + n * 3, piedra: 0 };
  if (obra === "capilla") return { oro: 4 + n * 3, madera: 2, piedra: 4 + n * 2 };
  return { oro: 5 + n * 4, madera: 3 + n * 2, piedra: 3 + n * 2 };
}

export function guerraDe(estado: Estado): Guerra {
  const index = ((estado.guerra % GUERRAS.length) + GUERRAS.length) % GUERRAS.length;
  return GUERRAS[index] ?? GUERRAS[0];
}

export function tituloGuerra(estado: Estado): string {
  const guerra = guerraDe(estado);
  const vuelta = estado.ciclo > 0 ? ` · ${estado.ciclo + 1}` : "";
  return `${guerra.anio} · ${guerra.nombre}${vuelta}`;
}

export function planetaHora(estado: Estado): PlanetaId {
  return PLANETAS[estado.hora] ?? "sol";
}

function avisar(estado: Estado, texto: string, segundos = 3.4): void {
  estado.aviso = texto;
  estado.avisoT = segundos;
}

function aplicarClase(estado: Estado, llenar: boolean): void {
  const siguiente = atributos(estado.clase, estado.nivel);
  estado.vidaMax = siguiente.vidaMax;
  estado.manaMax = siguiente.manaMax;
  estado.dano = siguiente.dano;
  estado.alcance = siguiente.alcance;
  estado.velocidad = siguiente.velocidad;
  estado.cadencia = siguiente.cadencia;
  if (llenar) {
    estado.vida = siguiente.vidaMax;
    estado.mana = siguiente.manaMax;
  } else {
    estado.vida = Math.min(estado.vidaMax, estado.vida);
    estado.mana = Math.min(estado.manaMax, estado.mana);
  }
}

export function crearPartida(semilla = 1): Estado {
  const guerra = GUERRAS[0];
  const estado: Estado = {
    fase: "juego",
    clase: "caballero",
    oficioAbierto: true,
    nivel: 1,
    xp: 0,
    vida: 1,
    vidaMax: 1,
    mana: 1,
    manaMax: 1,
    dano: 1,
    alcance: 1,
    velocidad: 1,
    cadencia: 1,
    cdGolpe: 0,
    x: 0,
    z: 6.4,
    dir: Math.atan2(0, -1),
    destino: null,
    objetivo: null,
    oro: 6,
    madera: 5,
    piedra: 5,
    obras: obrasVacias(),
    cds: cdsVacios(),
    hora: PLANETAS.indexOf(CLASES.caballero.planeta),
    horaT: 0,
    buffVel: 0,
    buffOro: 0,
    guerra: 0,
    ciclo: 0,
    oleada: 0,
    pausa: 0.35,
    anio: guerra.anio,
    enemigos: [],
    botin: [],
    aviso: "1066 · Hastings. El oficio se cierra con el primer golpe.",
    avisoT: 5,
    siguienteId: 1,
    bajas: 0,
    torreCd: 0.4,
    pulso: null,
    semilla,
  };
  aplicarClase(estado, true);
  return estado;
}

/** Rodea la muralla en vez de atravesarla o quedarse clavado en el radio. */
export function deslizar(x0: number, z0: number, x1: number, z1: number): { x: number; z: number } {
  if (Math.hypot(x1, z1) >= CASTILLO) return limitar(x1, z1);
  const enX = Math.hypot(x1, z0) >= CASTILLO ? limitar(x1, z0) : null;
  const enZ = Math.hypot(x0, z1) >= CASTILLO ? limitar(x0, z1) : null;
  if (enX && enZ) {
    const avX = Math.hypot(enX.x - x0, enX.z - z0);
    const avZ = Math.hypot(enZ.x - x0, enZ.z - z0);
    return avX >= avZ ? enX : enZ;
  }
  if (enX) return enX;
  if (enZ) return enZ;
  const d = Math.hypot(x0, z0) || 1;
  const tangX = -z0 / d;
  const tangZ = x0 / d;
  const deseoX = x1 - x0;
  const deseoZ = z1 - z0;
  const sentido = deseoX * tangX + deseoZ * tangZ >= 0 ? 1 : -1;
  const paso = Math.hypot(deseoX, deseoZ) || 0.04;
  return limitar(x0 + tangX * sentido * paso, z0 + tangZ * sentido * paso);
}

export function limitar(x: number, z: number): { x: number; z: number } {
  let px = x;
  let pz = z;
  const dentro = Math.hypot(px, pz);
  if (dentro < CASTILLO && dentro > 1e-4) {
    px = (px / dentro) * CASTILLO;
    pz = (pz / dentro) * CASTILLO;
  }
  const fuera = Math.hypot(px, pz);
  if (fuera > ARENA) {
    px = (px / fuera) * ARENA;
    pz = (pz / fuera) * ARENA;
  }
  return { x: px, z: pz };
}

export function cambiarClase(estado: Estado, clase: ClaseId): boolean {
  if (!estado.oficioAbierto || estado.fase !== "juego") return false;
  if (estado.clase === clase) return true;
  estado.clase = clase;
  aplicarClase(estado, true);
  estado.hora = PLANETAS.indexOf(CLASES[clase].planeta);
  estado.horaT = 0;
  estado.enemigos = [];
  estado.botin = [];
  estado.objetivo = null;
  estado.destino = null;
  estado.pausa = 0.8;
  estado.cdGolpe = 0;
  const puerta = limitar(0, 6.4);
  estado.x = puerta.x;
  estado.z = puerta.z;
  estado.dir = Math.atan2(0, -1);
  avisar(estado, `${CLASES[clase].nombre}. ${CLASES[clase].oficio}.`, 2.8);
  return true;
}

export function moverHacia(estado: Estado, x: number, z: number): void {
  if (estado.fase !== "juego") return;
  estado.destino = limitar(x, z);
  estado.objetivo = null;
}

export function fijarObjetivo(estado: Estado, id: number): void {
  if (estado.fase !== "juego") return;
  if (!estado.enemigos.some((enemigo) => enemigo.id === id && enemigo.vida > 0)) return;
  estado.objetivo = id;
  estado.destino = null;
}

export function invocar(estado: Estado, tipo: FichaId, x: number, z: number, origen: Enemigo["origen"] = "oleada"): Enemigo {
  const ficha = FICHAS[tipo];
  const puesto = limitar(x, z);
  const vida = Math.max(1, Math.round(ficha.vida * (1 + estado.ciclo * 0.22)));
  const enemigo: Enemigo = {
    id: estado.siguienteId,
    tipo,
    origen,
    x: puesto.x,
    z: puesto.z,
    vida,
    vidaMax: vida,
    cd: 0.35,
    freno: 0,
    sangrado: 0,
    sangradoPoder: 0,
  };
  estado.siguienteId += 1;
  estado.enemigos.push(enemigo);
  return enemigo;
}

function pulso(estado: Estado, x: number, z: number, radio: number, tono: Pulso["tono"]): void {
  estado.pulso = { x, z, radio, vida: 0.45, tono };
}

function radioDe(enemigo: Enemigo): number {
  return FICHAS[enemigo.tipo].radio;
}

function danarEnRadio(estado: Estado, radio: number, dano: number): number {
  let golpes = 0;
  for (const enemigo of estado.enemigos) {
    if (enemigo.vida <= 0) continue;
    const d = Math.hypot(enemigo.x - estado.x, enemigo.z - estado.z);
    if (d <= radio + radioDe(enemigo)) {
      enemigo.vida -= dano;
      golpes += 1;
    }
  }
  if (golpes > 0) estado.oficioAbierto = false;
  return golpes;
}

export function lanzar(estado: Estado, planeta: PlanetaId): Resultado {
  if (estado.fase !== "juego") return { ok: false, motivo: "Ahora no." };
  if (!planetasDe(estado.clase, estado.nivel).includes(planeta)) {
    return { ok: false, motivo: `Esa esfera se abre en el nivel ${nivelDePlaneta(estado.clase, planeta)}.` };
  }
  if (estado.cds[planeta] > 0) return { ok: false, motivo: "La esfera aún gira." };
  const hechizo = HECHIZOS[planeta];
  if (estado.mana < hechizo.mana) return { ok: false, motivo: "Falta aliento." };
  estado.mana -= hechizo.mana;
  const prisa = Math.max(0.55, 1 - estado.obras.observatorio * 0.12);
  estado.cds[planeta] = hechizo.cd * prisa;
  const poder = poderDe(estado, planeta);
  if (planeta === "sol") {
    const dano = Math.round(20 * poder);
    danarEnRadio(estado, hechizo.radio, dano);
    pulso(estado, estado.x, estado.z, hechizo.radio, "dano");
  } else if (planeta === "luna") {
    estado.vida = Math.min(estado.vidaMax, estado.vida + Math.round(26 * poder));
    pulso(estado, estado.x, estado.z, 2.2, "cura");
  } else if (planeta === "marte") {
    danarEnRadio(estado, hechizo.radio, Math.round(24 * poder));
    pulso(estado, estado.x, estado.z, hechizo.radio, "dano");
  } else if (planeta === "mercurio") {
    estado.buffVel = 4.2;
    pulso(estado, estado.x, estado.z, 1.6, "cura");
  } else if (planeta === "jupiter") {
    estado.buffOro = 8;
    estado.vida = Math.min(estado.vidaMax, estado.vida + Math.round(10 * poder));
    pulso(estado, estado.x, estado.z, 2.4, "cura");
  } else if (planeta === "venus") {
    for (const enemigo of estado.enemigos) {
      if (Math.hypot(enemigo.x - estado.x, enemigo.z - estado.z) <= hechizo.radio) enemigo.freno = 3.4;
    }
    pulso(estado, estado.x, estado.z, hechizo.radio, "freno");
    estado.oficioAbierto = false;
  } else {
    const dps = 5.5 * poder;
    for (const enemigo of estado.enemigos) {
      if (enemigo.vida <= 0) continue;
      if (Math.hypot(enemigo.x - estado.x, enemigo.z - estado.z) <= hechizo.radio + radioDe(enemigo)) {
        enemigo.sangrado = 4;
        enemigo.sangradoPoder = dps;
      }
    }
    pulso(estado, estado.x, estado.z, hechizo.radio, "dano");
    estado.oficioAbierto = false;
  }
  return { ok: true };
}

export function construir(estado: Estado, obra: ObraId): Resultado {
  const nivel = estado.obras[obra];
  const def = OBRAS[obra];
  if (nivel >= def.max) return { ok: false, motivo: "No cabe más." };
  const coste = costeDe(obra, nivel);
  if (estado.oro < coste.oro || estado.madera < coste.madera || estado.piedra < coste.piedra) {
    return { ok: false, motivo: "Faltan materiales." };
  }
  estado.oro -= coste.oro;
  estado.madera -= coste.madera;
  estado.piedra -= coste.piedra;
  estado.obras[obra] = nivel + 1;
  avisar(estado, `${def.nombre} sube a ${nivel + 1}.`, 2.2);
  return { ok: true };
}

export function revivir(estado: Estado): void {
  if (estado.fase !== "caido") return;
  estado.fase = "juego";
  estado.vida = Math.max(1, Math.round(estado.vidaMax * 0.55));
  estado.mana = Math.round(estado.manaMax * 0.45);
  const puerta = limitar(0, 6.4);
  estado.x = puerta.x;
  estado.z = puerta.z;
  estado.dir = Math.atan2(0, -1);
  estado.destino = null;
  estado.objetivo = null;
  estado.enemigos = [];
  estado.botin = [];
  estado.pausa = 1.3;
  avisar(estado, "Te alzas junto a la puerta.", 2.4);
}

function herir(estado: Estado, bruto: number): void {
  if (estado.fase !== "juego" || bruto <= 0) return;
  estado.oficioAbierto = false;
  estado.vida -= danoTrasMuralla(bruto, estado.obras.muralla);
  if (estado.vida <= 0) {
    estado.vida = 0;
    estado.fase = "caido";
    estado.destino = null;
    estado.objetivo = null;
    estado.oro = Math.floor(estado.oro * 0.8);
    estado.enemigos = [];
    estado.botin = [];
    avisar(estado, "Has caído. El castillo sigue en pie.", 6);
  }
}

function ganarXp(estado: Estado, cantidad: number): void {
  estado.xp += cantidad;
  let subio = false;
  let nuevo: PlanetaId | null = null;
  while (estado.nivel < NIVEL_MAX && estado.xp >= xpPara(estado.nivel)) {
    const antes = planetasDe(estado.clase, estado.nivel);
    estado.xp -= xpPara(estado.nivel);
    estado.nivel += 1;
    subio = true;
    const despues = planetasDe(estado.clase, estado.nivel);
    nuevo = despues.find((planeta) => !antes.includes(planeta)) ?? nuevo;
  }
  if (!subio) return;
  aplicarClase(estado, false);
  estado.vida = Math.min(estado.vidaMax, estado.vida + 14);
  estado.mana = Math.min(estado.manaMax, estado.mana + 10);
  const esfera = nuevo ? ` Se abre ${HECHIZOS[nuevo].nombre}.` : "";
  avisar(estado, `Nivel ${estado.nivel}.${esfera}`, 3.2);
}

function soltarBotin(estado: Estado, enemigo: Enemigo): void {
  const ficha = FICHAS[enemigo.tipo];
  const doble = estado.buffOro > 0 ? 2 : 1;
  const id = enemigo.id;
  estado.botin.push({
    id: estado.siguienteId,
    x: enemigo.x,
    z: enemigo.z,
    oro: ficha.oro * doble,
    madera: ficha.madera + (id % 3 === 0 ? 1 : 0),
    piedra: ficha.piedra + (id % 5 === 0 ? 1 : 0),
    cura: id % 7 === 0 ? 24 : 0,
  });
  estado.siguienteId += 1;
  if (estado.botin.length > 18) estado.botin.splice(0, estado.botin.length - 18);
}

function visitarMito(estado: Estado, azar: Azar): void {
  if (azar() > 0.55) return;
  const indice = Math.min(MITOS.length - 1, Math.floor(azar() * MITOS.length));
  const mito: MitoId = MITOS[indice] ?? "dama";
  if (mito === "dama") {
    estado.vida = estado.vidaMax;
    estado.mana = estado.manaMax;
    avisar(estado, "La Dama del Lago devuelve la vida y el aliento.");
  } else if (mito === "melusina") {
    estado.madera += 5;
    estado.mana = Math.min(estado.manaMax, estado.mana + 30);
    avisar(estado, "Melusina deja madera y un soplo de agua.");
  } else if (mito === "fatuo") {
    estado.piedra += 5;
    avisar(estado, "Un fuego fatuo descubre un montón de piedra.");
  } else if (mito === "perro") {
    estado.oro += 8;
    estado.vida = Math.max(1, estado.vida - 8);
    avisar(estado, "El perro negro cruza y deja oro en la senda.");
  } else if (mito === "verde") {
    invocar(estado, "verde", 2.2, -7, "mito");
    avisar(estado, "El Caballero Verde reta a un duelo.");
  } else if (mito === "caceria") {
    invocar(estado, "espectro", -6, -6, "mito");
    invocar(estado, "espectro", 0, -9, "mito");
    invocar(estado, "espectro", 6, -6, "mito");
    avisar(estado, "La cacería salvaje cruza el campo.");
  } else {
    invocar(estado, "dragon", 0, -8, "mito");
    avisar(estado, "El dragón de la montaña pide tributo.");
  }
}

function cerrarOleada(estado: Estado, azar: Azar): void {
  const guerra = guerraDe(estado);
  if (estado.oleada + 1 < guerra.oleadas.length) {
    estado.oleada += 1;
    estado.pausa = 1.5;
    avisar(estado, guerra.nota, 2.6);
  } else {
    estado.oro += 8;
    estado.madera += 6;
    estado.piedra += 6;
    estado.guerra += 1;
    if (estado.guerra % GUERRAS.length === 0) estado.ciclo += 1;
    estado.oleada = 0;
    const siguiente = guerraDe(estado);
    estado.anio = siguiente.anio;
    estado.pausa = 2.2;
    avisar(estado, `${siguiente.anio} · ${siguiente.nombre}. ${siguiente.nota}`, 4);
  }
  visitarMito(estado, azar);
}

function soltarOleada(estado: Estado, azar: Azar): void {
  const guerra = guerraDe(estado);
  estado.anio = guerra.anio;
  const grupos = guerra.oleadas[estado.oleada] ?? guerra.oleadas[0] ?? [];
  let total = 0;
  const cupo = 12;
  for (const grupo of grupos) {
    const extra = estado.ciclo > 0 && total === 0 ? 1 : 0;
    const n = Math.max(0, Math.min(grupo.n + extra, cupo - total));
    for (let i = 0; i < n; i += 1) {
      const angulo = -Math.PI / 2 + (azar() - 0.5) * 1.7;
      const radio = 7.4 + azar() * 1.6;
      invocar(estado, grupo.tipo, Math.cos(angulo) * radio, Math.sin(angulo) * radio, "oleada");
      total += 1;
    }
  }
  avisar(estado, tituloGuerra(estado), 2.4);
}

function acercar(estado: Estado, tx: number, tz: number, paso: number): void {
  const dx = tx - estado.x;
  const dz = tz - estado.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.08) {
    estado.destino = null;
    return;
  }
  estado.dir = Math.atan2(dx, dz);
  const av = Math.min(paso, d);
  const puesto = deslizar(estado.x, estado.z, estado.x + (dx / d) * av, estado.z + (dz / d) * av);
  estado.x = puesto.x;
  estado.z = puesto.z;
}

function pasoHeroe(estado: Estado, dt: number): void {
  const vel = estado.velocidad * (estado.buffVel > 0 ? 1.62 : 1);
  const paso = vel * dt;
  const blanco = estado.enemigos.find((enemigo) => enemigo.id === estado.objetivo && enemigo.vida > 0) ?? null;
  if (estado.objetivo != null && !blanco) estado.objetivo = null;
  if (blanco) {
    const dx = blanco.x - estado.x;
    const dz = blanco.z - estado.z;
    const d = Math.hypot(dx, dz) || 0.0001;
    const enRango = d <= estado.alcance + radioDe(blanco) * 0.35;
    if (enRango && estado.cdGolpe <= 0) {
      blanco.vida -= estado.dano;
      estado.cdGolpe = estado.cadencia;
      estado.oficioAbierto = false;
      estado.dir = Math.atan2(dx, dz);
    }
    if (!enRango) {
      acercar(estado, blanco.x, blanco.z, paso);
    } else if (estado.alcance > 3 && d < 2.6) {
      acercar(estado, estado.x - (dx / d) * 1.4, estado.z - (dz / d) * 1.4, paso);
    } else {
      estado.dir = Math.atan2(dx, dz);
    }
    return;
  }
  if (!estado.destino) return;
  acercar(estado, estado.destino.x, estado.destino.z, paso);
}

function pasoEnemigo(estado: Estado, enemigo: Enemigo, dt: number): void {
  if (enemigo.vida <= 0 || estado.fase !== "juego") return;
  const ficha = FICHAS[enemigo.tipo];
  if (enemigo.sangrado > 0) {
    enemigo.vida -= enemigo.sangradoPoder * dt;
    enemigo.sangrado -= dt;
  }
  if (enemigo.vida <= 0) return;
  enemigo.cd = Math.max(0, enemigo.cd - dt);
  enemigo.freno = Math.max(0, enemigo.freno - dt);
  const dx = estado.x - enemigo.x;
  const dz = estado.z - enemigo.z;
  const d = Math.hypot(dx, dz) || 0.0001;
  const vel = ficha.velocidad * (enemigo.freno > 0 ? 0.35 : 1);
  const aDistancia = d <= ficha.alcance * (ficha.alcance > 3 ? 0.82 : 0.92);
  let mx = 0;
  let mz = 0;
  if (!aDistancia) {
    mx = (dx / d) * vel * dt;
    mz = (dz / d) * vel * dt;
  } else if (ficha.alcance > 3 && d < ficha.alcance * 0.5) {
    mx = -(dx / d) * vel * dt;
    mz = -(dz / d) * vel * dt;
  }
  if (mx !== 0 || mz !== 0) {
    const puesto = deslizar(enemigo.x, enemigo.z, enemigo.x + mx, enemigo.z + mz);
    enemigo.x = puesto.x;
    enemigo.z = puesto.z;
  }
  const despues = Math.hypot(estado.x - enemigo.x, estado.z - enemigo.z);
  if (despues <= ficha.alcance + 0.15 && enemigo.cd <= 0 && enemigo.freno <= 0) {
    herir(estado, ficha.dano);
    enemigo.cd = ficha.cadencia;
  }
}

function separar(estado: Estado): void {
  const lista = estado.enemigos;
  for (let i = 0; i < lista.length; i += 1) {
    for (let j = i + 1; j < lista.length; j += 1) {
      const a = lista[i];
      const b = lista[j];
      if (!a || !b || a.vida <= 0 || b.vida <= 0) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz) || 0.0001;
      const minimo = a.tipo === b.tipo ? FICHAS[a.tipo].radio * 1.7 : FICHAS[a.tipo].radio + FICHAS[b.tipo].radio;
      if (d >= minimo) continue;
      const empuje = (minimo - d) * 0.5;
      const ux = dx / d;
      const uz = dz / d;
      const pa = deslizar(a.x, a.z, a.x - ux * empuje, a.z - uz * empuje);
      const pb = deslizar(b.x, b.z, b.x + ux * empuje, b.z + uz * empuje);
      a.x = pa.x;
      a.z = pa.z;
      b.x = pb.x;
      b.z = pb.z;
    }
  }
}

function recoger(estado: Estado): void {
  const quedan: Botin[] = [];
  for (const pieza of estado.botin) {
    if (Math.hypot(pieza.x - estado.x, pieza.z - estado.z) > 1.7) {
      quedan.push(pieza);
      continue;
    }
    estado.oro += pieza.oro;
    estado.madera += pieza.madera;
    estado.piedra += pieza.piedra;
    if (pieza.cura > 0) estado.vida = Math.min(estado.vidaMax, estado.vida + pieza.cura);
  }
  estado.botin = quedan;
}

function dispararTorre(estado: Estado, dt: number): void {
  const nivel = estado.obras.torre;
  if (nivel <= 0 || estado.fase !== "juego") return;
  estado.torreCd -= dt;
  if (estado.torreCd > 0) return;
  const alcance = 8 + nivel;
  let mejor: Enemigo | null = null;
  let mejorD = alcance;
  for (const enemigo of estado.enemigos) {
    if (enemigo.vida <= 0) continue;
    const d = Math.hypot(enemigo.x, enemigo.z);
    if (d < mejorD) {
      mejor = enemigo;
      mejorD = d;
    }
  }
  if (!mejor) return;
  mejor.vida -= 8 * nivel;
  estado.torreCd = 1.25;
}

function tick(estado: Estado, dt: number, azar: Azar): void {
  estado.horaT += dt;
  if (estado.horaT >= HORA_S) {
    estado.horaT -= HORA_S;
    estado.hora = (estado.hora + 1) % PLANETAS.length;
  }
  estado.avisoT = Math.max(0, estado.avisoT - dt);
  estado.buffVel = Math.max(0, estado.buffVel - dt);
  estado.buffOro = Math.max(0, estado.buffOro - dt);
  estado.cdGolpe = Math.max(0, estado.cdGolpe - dt);
  if (estado.pulso) {
    estado.pulso.vida -= dt;
    if (estado.pulso.vida <= 0) estado.pulso = null;
  }
  for (const planeta of PLANETAS) estado.cds[planeta] = Math.max(0, estado.cds[planeta] - dt);

  if (estado.fase === "juego") {
    const cura = estado.obras.granero * 2.2 * dt;
    const aliento = (1.8 + estado.obras.capilla * 3) * dt;
    estado.vida = Math.min(estado.vidaMax, estado.vida + cura);
    estado.mana = Math.min(estado.manaMax, estado.mana + aliento);
    dispararTorre(estado, dt);
    if (estado.fase === "juego") pasoHeroe(estado, dt);
    if (estado.fase === "juego") {
      for (const enemigo of estado.enemigos) {
        if (estado.fase !== "juego") break;
        pasoEnemigo(estado, enemigo, dt);
      }
      if (estado.fase === "juego") {
        separar(estado);
        recoger(estado);
      }
    }
  }

  if (estado.fase !== "juego") return;
  let murioOleada = false;
  const vivos: Enemigo[] = [];
  for (const enemigo of estado.enemigos) {
    if (enemigo.vida > 0) {
      vivos.push(enemigo);
      continue;
    }
    if (enemigo.origen === "oleada") murioOleada = true;
    estado.bajas += 1;
    ganarXp(estado, FICHAS[enemigo.tipo].xp);
    soltarBotin(estado, enemigo);
  }
  estado.enemigos = vivos;
  const quedanOleada = vivos.some((enemigo) => enemigo.origen === "oleada");
  if (murioOleada && !quedanOleada) {
    cerrarOleada(estado, azar);
    return;
  }
  if (estado.enemigos.length === 0) {
    estado.pausa -= dt;
    if (estado.pausa <= 0) {
      estado.pausa = 0;
      soltarOleada(estado, azar);
    }
  }
}

export function avanzar(estado: Estado, dt: number, azar: Azar): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  let queda = Math.min(dt, 1);
  while (queda > 0.0001) {
    const paso = Math.min(0.05, queda);
    tick(estado, paso, azar);
    queda -= paso;
  }
}

export type Guardado = {
  v: 1;
  clase: ClaseId;
  nivel: number;
  xp: number;
  oro: number;
  madera: number;
  piedra: number;
  obras: Record<ObraId, number>;
  guerra: number;
  ciclo: number;
  oleada: number;
};

function entero(valor: unknown, min: number, max: number): number | null {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < min || valor > max) return null;
  return valor;
}

function esClase(valor: unknown): valor is ClaseId {
  return typeof valor === "string" && (CLASE_IDS as readonly string[]).includes(valor);
}

export function volcar(estado: Estado): string {
  const bolsa: Guardado = {
    v: 1,
    clase: estado.clase,
    nivel: estado.nivel,
    xp: Math.max(0, Math.floor(estado.xp)),
    oro: Math.max(0, Math.floor(estado.oro)),
    madera: Math.max(0, Math.floor(estado.madera)),
    piedra: Math.max(0, Math.floor(estado.piedra)),
    obras: { ...estado.obras },
    guerra: estado.guerra,
    ciclo: estado.ciclo,
    oleada: estado.oleada,
  };
  return JSON.stringify(bolsa);
}

export function aplicarGuardado(estado: Estado, raw: string): boolean {
  let dato: unknown;
  try {
    dato = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!dato || typeof dato !== "object") return false;
  const bolsa = dato as Partial<Guardado>;
  if (bolsa.v !== 1 || !esClase(bolsa.clase)) return false;
  const nivel = entero(bolsa.nivel, 1, NIVEL_MAX);
  const xp = entero(bolsa.xp, 0, 100000);
  const oro = entero(bolsa.oro, 0, 100000);
  const madera = entero(bolsa.madera, 0, 100000);
  const piedra = entero(bolsa.piedra, 0, 100000);
  const guerra = entero(bolsa.guerra, 0, 999);
  const ciclo = entero(bolsa.ciclo, 0, 99);
  if (nivel == null || xp == null || oro == null || madera == null || piedra == null || guerra == null || ciclo == null) return false;
  if (!bolsa.obras || typeof bolsa.obras !== "object") return false;
  const obras = obrasVacias();
  for (const obra of OBRA_IDS) {
    const nivelObra = entero(bolsa.obras[obra], 0, OBRAS[obra].max);
    if (nivelObra == null) return false;
    obras[obra] = nivelObra;
  }
  const oleadas = GUERRAS[guerra % GUERRAS.length]?.oleadas.length ?? 1;
  const oleada = entero(bolsa.oleada, 0, Math.max(0, oleadas - 1));
  if (oleada == null) return false;
  estado.clase = bolsa.clase;
  estado.nivel = nivel;
  estado.xp = Math.min(xp, xpPara(nivel));
  estado.oro = oro;
  estado.madera = madera;
  estado.piedra = piedra;
  estado.obras = obras;
  estado.guerra = guerra;
  estado.ciclo = ciclo;
  estado.oleada = oleada;
  estado.anio = guerraDe(estado).anio;
  estado.oficioAbierto = false;
  estado.fase = "juego";
  estado.enemigos = [];
  estado.botin = [];
  estado.destino = null;
  estado.objetivo = null;
  estado.pausa = 1.2;
  estado.cds = cdsVacios();
  estado.buffVel = 0;
  estado.buffOro = 0;
  const puerta = limitar(0, 6.4);
  estado.x = puerta.x;
  estado.z = puerta.z;
  aplicarClase(estado, true);
  avisar(estado, `${tituloGuerra(estado)}. El castillo recuerda la obra.`, 3);
  return true;
}

/** Encuadre quieto para la foto del laboratorio: castillo, oficio y una hueste cerca. */
export function posarRetrato(estado: Estado): void {
  estado.fase = "juego";
  estado.oficioAbierto = false;
  estado.clase = "caballero";
  estado.nivel = 2;
  aplicarClase(estado, true);
  estado.vida = Math.round(estado.vidaMax * 0.72);
  estado.mana = Math.round(estado.manaMax * 0.64);
  estado.obras.muralla = 2;
  estado.obras.torre = 1;
  estado.obras.granero = 1;
  estado.obras.capilla = 1;
  estado.x = 0.2;
  estado.z = 5.6;
  estado.dir = Math.atan2(0, -1);
  estado.destino = null;
  estado.objetivo = null;
  estado.enemigos = [];
  estado.botin = [];
  estado.pausa = 99;
  estado.guerra = 0;
  estado.ciclo = 0;
  estado.oleada = 1;
  estado.anio = 1066;
  estado.hora = PLANETAS.indexOf("marte");
  estado.horaT = 2;
  avisar(estado, "1066 · Hastings", 30);
  const infante = invocar(estado, "infante", -3.6, 4.8, "oleada");
  infante.vida = 16;
  invocar(estado, "arquero", 3.6, 4.2, "oleada");
  invocar(estado, "jinete", 0.2, -6.2, "oleada");
  estado.botin.push({ id: estado.siguienteId, x: 1.8, z: 7.2, oro: 4, madera: 0, piedra: 0, cura: 0 });
  estado.siguienteId += 1;
}
