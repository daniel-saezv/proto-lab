import { cruz, ejesDe, normalizar, proyectarCon, punto, type Camara, type Ejes, type Vec3 } from "./camara";

export type Color = readonly [number, number, number];

export type Caja = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  color: Color;
};

/** Cubo unidad centrado. Las caras van en sentido antihorario vistas desde fuera. */
export const ESQUINAS: readonly Vec3[] = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
];

export const CARAS: readonly [number, number, number, number][] = [
  [4, 5, 6, 7],
  [0, 3, 2, 1],
  [1, 2, 6, 5],
  [0, 4, 7, 3],
  [3, 7, 6, 2],
  [0, 1, 5, 4],
];

const LUZ = normalizar([0.28, 0.88, 0.38]);
const NIEBLA: Color = [214, 168, 112];

function girar(x: number, y: number, z: number, rot: number, ox: number, oy: number, oz: number): Vec3 {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [ox + c * x + s * z, oy + y, oz - s * x + c * z];
}

export function normalDeCara(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return cruz([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
}

export function carasHaciaFuera(): boolean {
  for (const cara of CARAS) {
    const a = ESQUINAS[cara[0]];
    const b = ESQUINAS[cara[1]];
    const c = ESQUINAS[cara[2]];
    const d = ESQUINAS[cara[3]];
    if (!a || !b || !c || !d) return false;
    const normal = normalDeCara(a, b, c);
    const centro: Vec3 = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
    if (punto(normal, centro) <= 0) return false;
  }
  return true;
}

/**
 * Una cara hacia la cámara se ve en pantalla con el eje Y hacia abajo,
 * así que el producto del triángulo proyectado sale negativo.
 */
export function esFrente(cam: Camara, a: Vec3, b: Vec3, c: Vec3, ancho: number, alto: number): boolean {
  const ejes = ejesDe(cam);
  const pa = proyectarCon(ejes, a, ancho, alto);
  const pb = proyectarCon(ejes, b, ancho, alto);
  const pc = proyectarCon(ejes, c, ancho, alto);
  if (!pa || !pb || !pc) return false;
  const cruzP = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
  return cruzP < 0;
}

function sombrear(color: Color, normal: Vec3, profundidad: number): string {
  const n = normalizar(normal);
  const lambert = 0.32 + 0.62 * Math.max(0, punto(n, LUZ)) + 0.06 * n[1];
  const niebla = Math.min(1, Math.max(0, (profundidad - 10) / 32));
  const mezcla = niebla * niebla;
  const r = color[0] * lambert;
  const g = color[1] * lambert;
  const b = color[2] * lambert;
  const rr = Math.round(r + (NIEBLA[0] - r) * mezcla);
  const gg = Math.round(g + (NIEBLA[1] - g) * mezcla);
  const bb = Math.round(b + (NIEBLA[2] - b) * mezcla);
  return `rgb(${rr},${gg},${bb})`;
}

type Trazo = { profundidad: number; color: string; puntos: Array<{ x: number; y: number }> };

function trazosDe(caja: Caja, ejes: Ejes, ancho: number, alto: number, destino: Trazo[]): void {
  const mundo: Vec3[] = [];
  const plano: Array<{ x: number; y: number } | null> = [];
  for (const esquina of ESQUINAS) {
    const p = girar(esquina[0] * caja.sx, esquina[1] * caja.sy, esquina[2] * caja.sz, caja.rotY, caja.x, caja.y, caja.z);
    mundo.push(p);
    const proy = proyectarCon(ejes, p, ancho, alto);
    plano.push(proy ? { x: proy.x, y: proy.y } : null);
  }
  for (const cara of CARAS) {
    const ia = cara[0];
    const ib = cara[1];
    const ic = cara[2];
    const id = cara[3];
    const a = plano[ia];
    const b = plano[ib];
    const c = plano[ic];
    const d = plano[id];
    const va = mundo[ia];
    const vb = mundo[ib];
    const vc = mundo[ic];
    const vd = mundo[id];
    if (!a || !b || !c || !d || !va || !vb || !vc || !vd) continue;
    const cruzP = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (cruzP >= 0) continue;
    const centro: Vec3 = [
      (va[0] + vb[0] + vc[0] + vd[0]) / 4,
      (va[1] + vb[1] + vc[1] + vd[1]) / 4,
      (va[2] + vb[2] + vc[2] + vd[2]) / 4,
    ];
    const camZ = punto([centro[0] - ejes.ojo[0], centro[1] - ejes.ojo[1], centro[2] - ejes.ojo[2]], ejes.adelante);
    destino.push({
      profundidad: camZ,
      color: sombrear(caja.color, normalDeCara(va, vb, vc), camZ),
      puntos: [a, b, c, d],
    });
  }
}

function trazar(ctx: CanvasRenderingContext2D, trazo: Trazo): void {
  const primero = trazo.puntos[0];
  if (!primero) return;
  ctx.beginPath();
  ctx.moveTo(primero.x, primero.y);
  for (let i = 1; i < trazo.puntos.length; i += 1) {
    const puntoPlano = trazo.puntos[i];
    if (puntoPlano) ctx.lineTo(puntoPlano.x, puntoPlano.y);
  }
  ctx.closePath();
  ctx.fillStyle = trazo.color;
  ctx.fill();
}

export function pintar(ctx: CanvasRenderingContext2D, cam: Camara, ancho: number, alto: number, suelo: readonly Caja[], resto: readonly Caja[]): void {
  const cielo = ctx.createLinearGradient(0, 0, 0, alto * 0.72);
  cielo.addColorStop(0, "#141a26");
  cielo.addColorStop(0.55, "#6d7c96");
  cielo.addColorStop(1, "#e2b07a");
  ctx.fillStyle = cielo;
  ctx.fillRect(0, 0, ancho, alto);
  const luna = Math.min(ancho, alto) * 0.04;
  ctx.fillStyle = "#f4e4b4";
  ctx.beginPath();
  ctx.arc(ancho * 0.78, alto * 0.11, Math.max(6, luna), 0, Math.PI * 2);
  ctx.fill();

  const ejes = ejesDe(cam);
  const base: Trazo[] = [];
  for (const caja of suelo) trazosDe(caja, ejes, ancho, alto, base);
  base.sort((a, b) => b.profundidad - a.profundidad);
  for (const trazo of base) trazar(ctx, trazo);

  const cuerpo: Trazo[] = [];
  for (const caja of resto) trazosDe(caja, ejes, ancho, alto, cuerpo);
  cuerpo.sort((a, b) => b.profundidad - a.profundidad);
  for (const trazo of cuerpo) trazar(ctx, trazo);
}
