import { ejesDe, proyectarCon, rayoSuelo, seguir, type Camara } from "./camara";
import { ARENA, FICHAS, type Enemigo, type Estado, type FichaId } from "./mundo";
import { pintar, type Caja, type Color } from "./pintor";

const HIERBA: Color = [64, 112, 52];
const HIERBA_B: Color = [56, 100, 46];
const TIERRA: Color = [158, 120, 70];
const LOSA: Color = [124, 118, 108];
const PIEDRA: Color = [148, 144, 136];
const GRIS: Color = [96, 92, 86];
const TEJA: Color = [138, 52, 44];
const MADERA: Color = [124, 78, 44];
const ORO: Color = [214, 176, 78];
const ACERO: Color = [198, 206, 214];
const PIEL: Color = [214, 176, 146];
const SOMBRA: Color = [28, 40, 24];

const OFICIO: Record<Estado["clase"], { cuerpo: Color; capa: Color; arma: "espada" | "arco" | "cayado" | "maza" }> = {
  caballero: { cuerpo: ACERO, capa: [142, 36, 48], arma: "espada" },
  ballestero: { cuerpo: [52, 96, 62], capa: [92, 64, 36], arma: "arco" },
  fraile: { cuerpo: [214, 206, 188], capa: [110, 32, 32], arma: "maza" },
  astrologo: { cuerpo: [36, 48, 92], capa: [214, 176, 78], arma: "cayado" },
};

const HUESTE: Record<FichaId, Color> = {
  infante: [112, 74, 52],
  arquero: [58, 92, 70],
  jinete: [78, 64, 96],
  ariete: [92, 78, 64],
  verde: [36, 130, 72],
  espectro: [150, 186, 198],
  dragon: [148, 48, 36],
};

function caja(lista: Caja[], x: number, y: number, z: number, sx: number, sy: number, sz: number, color: Color, rotY = 0): void {
  lista.push({ x, y, z, sx, sy, sz, rotY, color });
}

function mundo(x: number, z: number, ox: number, oz: number, rot: number): { x: number; z: number } {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: x + c * ox + s * oz, z: z - s * ox + c * oz };
}

function persona(
  lista: Caja[],
  x: number,
  z: number,
  rot: number,
  tiempo: number,
  cuerpo: Color,
  capa: Color,
  arma: "espada" | "arco" | "cayado" | "maza",
  quieto: boolean,
  escala = 1,
): void {
  const bob = quieto ? 0 : Math.sin(tiempo * 3.2 + x * 2) * 0.045 * escala;
  const y = bob;
  caja(lista, x, y + 0.36 * escala, z, 0.36 * escala, 0.48 * escala, 0.28 * escala, [72, 52, 36], rot);
  caja(lista, x, y + 0.9 * escala, z, 0.5 * escala, 0.62 * escala, 0.34 * escala, cuerpo, rot);
  caja(lista, x, y + 1.38 * escala, z, 0.28 * escala, 0.28 * escala, 0.28 * escala, PIEL, rot);
  const espalda = mundo(x, z, 0, -0.22 * escala, rot);
  caja(lista, espalda.x, y + 0.95 * escala, espalda.z, 0.42 * escala, 0.7 * escala, 0.08 * escala, capa, rot);
  const mano = mundo(x, z, 0.34 * escala, 0.12 * escala, rot);
  if (arma === "espada") caja(lista, mano.x, y + 1.05 * escala, mano.z, 0.08 * escala, 0.78 * escala, 0.08 * escala, ACERO, rot);
  else if (arma === "arco") caja(lista, mano.x, y + 1.05 * escala, mano.z, 0.08 * escala, 0.9 * escala, 0.16 * escala, MADERA, rot);
  else if (arma === "cayado") caja(lista, mano.x, y + 1.15 * escala, mano.z, 0.08 * escala, 1.3 * escala, 0.08 * escala, [92, 70, 120], rot);
  else caja(lista, mano.x, y + 0.95 * escala, mano.z, 0.16 * escala, 0.55 * escala, 0.16 * escala, GRIS, rot);
}

function dragon(lista: Caja[], enemigo: Enemigo, heroeX: number, heroeZ: number, tiempo: number, quieto: boolean): void {
  const rot = Math.atan2(heroeX - enemigo.x, heroeZ - enemigo.z);
  const ala = quieto ? 0.4 : 0.55 + Math.sin(tiempo * 5 + enemigo.id) * 0.25;
  const color = HUESTE.dragon;
  caja(lista, enemigo.x, 0.7, enemigo.z, 1.5, 0.7, 2.2, color, rot);
  caja(lista, enemigo.x, 1.15, enemigo.z, 0.7, 0.45, 0.9, [186, 78, 48], rot);
  const izq = mundo(enemigo.x, enemigo.z, -1.15, 0.1, rot);
  const der = mundo(enemigo.x, enemigo.z, 1.15, 0.1, rot);
  caja(lista, izq.x, 1.05, izq.z, 1.5, 0.08, 0.8, [120, 40, 32], rot + ala);
  caja(lista, der.x, 1.05, der.z, 1.5, 0.08, 0.8, [120, 40, 32], rot - ala);
  const cabeza = mundo(enemigo.x, enemigo.z, 0, 1.35, rot);
  caja(lista, cabeza.x, 1.15, cabeza.z, 0.55, 0.4, 0.7, color, rot);
}

function ariete(lista: Caja[], enemigo: Enemigo, heroeX: number, heroeZ: number): void {
  const rot = Math.atan2(heroeX - enemigo.x, heroeZ - enemigo.z);
  caja(lista, enemigo.x, 0.85, enemigo.z, 1.3, 1.1, 2.4, MADERA, rot);
  caja(lista, enemigo.x, 1.5, enemigo.z, 1.5, 0.28, 2.6, TEJA, rot);
  const tronco = mundo(enemigo.x, enemigo.z, 0, 1.15, rot);
  caja(lista, tronco.x, 0.7, tronco.z, 0.35, 0.35, 1.4, [86, 64, 40], rot);
}

function jinete(lista: Caja[], enemigo: Enemigo, heroeX: number, heroeZ: number, tiempo: number, quieto: boolean): void {
  const rot = Math.atan2(heroeX - enemigo.x, heroeZ - enemigo.z);
  caja(lista, enemigo.x, 0.55, enemigo.z, 0.55, 0.7, 1.5, [96, 72, 48], rot);
  const cabeza = mundo(enemigo.x, enemigo.z, 0, 0.85, rot);
  caja(lista, cabeza.x, 0.95, cabeza.z, 0.28, 0.35, 0.45, [96, 72, 48], rot);
  persona(lista, enemigo.x, enemigo.z, rot, tiempo, HUESTE.jinete, [70, 48, 40], "espada", quieto, 0.72);
}

function huesped(lista: Caja[], enemigo: Enemigo, heroeX: number, heroeZ: number, tiempo: number, quieto: boolean): void {
  if (enemigo.tipo === "dragon") {
    dragon(lista, enemigo, heroeX, heroeZ, tiempo, quieto);
    return;
  }
  if (enemigo.tipo === "ariete") {
    ariete(lista, enemigo, heroeX, heroeZ);
    return;
  }
  if (enemigo.tipo === "jinete") {
    jinete(lista, enemigo, heroeX, heroeZ, tiempo, quieto);
    return;
  }
  const rot = Math.atan2(heroeX - enemigo.x, heroeZ - enemigo.z);
  const arma = enemigo.tipo === "arquero" ? "arco" : "espada";
  persona(lista, enemigo.x, enemigo.z, rot, tiempo + enemigo.id, HUESTE[enemigo.tipo], [70, 48, 36], arma, quieto, enemigo.tipo === "espectro" ? 0.85 : 1);
}

function castillo(resto: Caja[], estado: Estado, tiempo: number, quieto: boolean): void {
  const alto = 0.75 + estado.obras.muralla * 0.48;
  caja(resto, 0, alto / 2, -3.2, 6.7, alto, 0.45, PIEDRA);
  caja(resto, -2.2, alto / 2, 3.2, 2.2, alto, 0.45, PIEDRA);
  caja(resto, 2.2, alto / 2, 3.2, 2.2, alto, 0.45, PIEDRA);
  caja(resto, -3.2, alto / 2, 0, 0.45, alto, 5.5, PIEDRA);
  caja(resto, 3.2, alto / 2, 0, 0.45, alto, 5.5, PIEDRA);
  caja(resto, 0, 1.7, -0.15, 2.25, 3.4, 2.25, GRIS);
  caja(resto, 0, 3.55, -0.15, 2.6, 0.4, 2.6, TEJA);
  caja(resto, 0, 3.95, -0.15, 1.4, 0.35, 1.4, TEJA);
  caja(resto, 0.05, 4.4, -0.15, 0.08, 0.75, 0.08, MADERA);
  const ondear = quieto ? 0.15 : Math.sin(tiempo * 2.4) * 0.7;
  caja(resto, 0.4, 4.62, -0.15, 0.62, 0.28, 0.06, [150, 36, 48], ondear);
  if (estado.obras.torre > 0) {
    const h = 2.1 + estado.obras.torre * 0.65;
    for (const [tx, tz] of [
      [-3.2, -3.2],
      [3.2, -3.2],
      [-3.2, 3.2],
      [3.2, 3.2],
    ] as const) {
      caja(resto, tx, h / 2, tz, 1.15, h, 1.15, PIEDRA);
      caja(resto, tx, h + 0.18, tz, 1.4, 0.28, 1.4, TEJA);
    }
  }
  if (estado.obras.granero > 0) {
    caja(resto, -1.65, 0.55, 1.25, 1.25, 1.05, 1.15, MADERA);
    caja(resto, -1.65, 1.2, 1.25, 1.5, 0.26, 1.4, TEJA);
  }
  if (estado.obras.capilla > 0) {
    caja(resto, 1.6, 0.75, 1.15, 1.05, 1.45, 1.25, [220, 210, 190]);
    caja(resto, 1.6, 1.65, 1.15, 0.22, 0.7, 0.22, TEJA);
  }
  if (estado.obras.observatorio > 0) {
    const h = 1.15 + estado.obras.observatorio * 0.4;
    caja(resto, 0, h / 2, 2.05, 0.75, h, 0.75, [42, 52, 92]);
    caja(resto, 0, h + 0.28, 2.05, 0.7, 0.45, 0.7, ORO);
  }
}

function sueloDe(): Caja[] {
  const suelo: Caja[] = [];
  for (let ix = -4; ix <= 4; ix += 1) {
    for (let iz = -4; iz <= 4; iz += 1) {
      caja(suelo, ix * 4, -0.28, iz * 4, 4, 0.36, 4, (ix + iz) % 2 === 0 ? HIERBA : HIERBA_B);
    }
  }
  caja(suelo, 0, -0.05, 0.2, 7.4, 0.2, 7.4, LOSA);
  caja(suelo, 0, -0.02, 8.2, 2.3, 0.2, 12, TIERRA);
  return suelo;
}

const SUELO = sueloDe();

const ARBOLES: ReadonlyArray<readonly [number, number]> = [
  [-12.5, -5],
  [-13.2, 5],
  [-8.5, 13],
  [12.4, -6],
  [13.2, 4.5],
  [8.8, 13],
  [-4.5, -13.2],
  [6.2, -13.4],
  [0.4, -14.6],
  [14.2, -0.5],
];

export type Escena = {
  dibujar(estado: Estado, ancho: number, alto: number, tiempo: number, quieto: boolean): void;
  enemigoCerca(estado: Estado, ndcX: number, ndcY: number, ancho: number, alto: number): number | null;
  suelo(ndcX: number, ndcY: number): { x: number; z: number } | null;
  soltar(): void;
};

export function crearEscena(ctx: CanvasRenderingContext2D): Escena {
  let camara: Camara | null = null;

  return {
    dibujar(estado, ancho, alto, tiempo, quieto) {
      const aspecto = ancho / Math.max(1, alto);
      camara = seguir(estado.x, estado.z, aspecto, tiempo, quieto);
      const suelo = SUELO.slice();
      const resto: Caja[] = [];
      caja(suelo, estado.x, 0.05, estado.z, 0.7, 0.06, 0.5, SOMBRA);
      for (const enemigo of estado.enemigos) {
        if (enemigo.vida <= 0) continue;
        const radio = FICHAS[enemigo.tipo].radio;
        caja(suelo, enemigo.x, 0.05, enemigo.z, radio * 1.6, 0.06, radio * 1.3, SOMBRA);
      }
      if (estado.destino && estado.fase === "juego") {
        caja(suelo, estado.destino.x, 0.08, estado.destino.z, 0.55, 0.05, 0.55, ORO);
      }
      castillo(resto, estado, tiempo, quieto);
      for (const [x, z] of ARBOLES) {
        if (Math.hypot(x, z) < ARENA - 1) continue;
        caja(resto, x, 0.5, z, 0.28, 1, 0.28, MADERA);
        caja(resto, x, 1.4, z, 1.25, 1, 1.25, [40, 86, 44]);
        caja(resto, x, 2.1, z, 0.8, 0.7, 0.8, [52, 104, 54]);
      }
      const oficio = OFICIO[estado.clase];
      if (estado.fase === "juego") persona(resto, estado.x, estado.z, estado.dir, tiempo, oficio.cuerpo, oficio.capa, oficio.arma, quieto);
      for (const enemigo of estado.enemigos) {
        if (enemigo.vida <= 0) continue;
        huesped(resto, enemigo, estado.x, estado.z, tiempo, quieto);
      }
      for (const pieza of estado.botin) {
        const y = 0.28 + Math.sin(tiempo * 4 + pieza.id) * (quieto ? 0 : 0.06);
        const color: Color = pieza.cura > 0 ? [86, 170, 96] : pieza.piedra > 0 ? GRIS : pieza.madera > 0 ? MADERA : ORO;
        caja(resto, pieza.x, y, pieza.z, 0.28, 0.28, 0.28, color, tiempo);
      }
      if (estado.pulso && estado.pulso.vida > 0) {
        const tono: Color = estado.pulso.tono === "cura" ? [120, 190, 140] : estado.pulso.tono === "freno" ? [150, 120, 186] : [214, 150, 70];
        const n = 8;
        for (let i = 0; i < n; i += 1) {
          const ang = (i / n) * Math.PI * 2;
          caja(resto, estado.pulso.x + Math.cos(ang) * estado.pulso.radio, 0.15, estado.pulso.z + Math.sin(ang) * estado.pulso.radio, 0.28, 0.08, 0.28, tono);
        }
      }
      pintar(ctx, camara, ancho, alto, suelo, resto);
    },
    enemigoCerca(estado, ndcX, ndcY, ancho, alto) {
      if (!camara) return null;
      const ejes = ejesDe(camara);
      const px = (ndcX * 0.5 + 0.5) * ancho;
      const py = (1 - (ndcY * 0.5 + 0.5)) * alto;
      let mejor: number | null = null;
      let mejorD = 46;
      for (const enemigo of estado.enemigos) {
        if (enemigo.vida <= 0) continue;
        const proy = proyectarCon(ejes, [enemigo.x, 1, enemigo.z], ancho, alto);
        if (!proy) continue;
        const d = Math.hypot(proy.x - px, proy.y - py);
        const radio = 30 + FICHAS[enemigo.tipo].radio * 16;
        if (d <= radio && d < mejorD) {
          mejor = enemigo.id;
          mejorD = d;
        }
      }
      return mejor;
    },
    suelo(ndcX, ndcY) {
      if (!camara) return null;
      return rayoSuelo(camara, ndcX, ndcY);
    },
    soltar() {
      camara = null;
    },
  };
}
