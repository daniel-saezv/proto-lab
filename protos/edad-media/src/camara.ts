export type Vec3 = [number, number, number];

export type Camara = {
  ojo: Vec3;
  mira: Vec3;
  fov: number;
  aspecto: number;
  cerca: number;
  lejos: number;
};

export type Ejes = {
  derecha: Vec3;
  arriba: Vec3;
  adelante: Vec3;
  ojo: Vec3;
  fov: number;
  aspecto: number;
  cerca: number;
};

export type Proyeccion = {
  x: number;
  y: number;
  z: number;
};

function largo(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalizar(v: Vec3): Vec3 {
  const l = largo(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function cruz(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function punto(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Cámara detrás del héroe, un poco alta, mirando al campo. */
export function seguir(x: number, z: number, aspecto: number, tiempo: number, quieto: boolean): Camara {
  const vaiven = quieto ? 0 : Math.sin(tiempo * 0.35) * 0.2;
  return {
    ojo: [x + 7.2 + vaiven, 17.2, z + 14.2],
    mira: [x, 0.4, z - 4.2],
    fov: 0.66,
    aspecto: Math.max(0.3, aspecto),
    cerca: 0.15,
    lejos: 80,
  };
}

export function ejesDe(cam: Camara): Ejes {
  const adelante = normalizar([cam.mira[0] - cam.ojo[0], cam.mira[1] - cam.ojo[1], cam.mira[2] - cam.ojo[2]]);
  const mundoArriba: Vec3 = [0, 1, 0];
  let derecha = cruz(adelante, mundoArriba);
  if (largo(derecha) < 1e-5) derecha = [1, 0, 0];
  derecha = normalizar(derecha);
  const arriba = normalizar(cruz(derecha, adelante));
  return { derecha, arriba, adelante, ojo: cam.ojo, fov: cam.fov, aspecto: cam.aspecto, cerca: cam.cerca };
}

export function proyectarCon(ejes: Ejes, p: Vec3, ancho: number, alto: number): Proyeccion | null {
  const rel: Vec3 = [p[0] - ejes.ojo[0], p[1] - ejes.ojo[1], p[2] - ejes.ojo[2]];
  const camX = punto(rel, ejes.derecha);
  const camY = punto(rel, ejes.arriba);
  const camZ = punto(rel, ejes.adelante);
  if (camZ <= ejes.cerca) return null;
  const f = 1 / Math.tan(ejes.fov / 2);
  const ndcX = (camX / camZ) * (f / ejes.aspecto);
  const ndcY = (camY / camZ) * f;
  return {
    x: (ndcX * 0.5 + 0.5) * ancho,
    y: (1 - (ndcY * 0.5 + 0.5)) * alto,
    z: camZ,
  };
}

export function proyectar(cam: Camara, p: Vec3, ancho: number, alto: number): Proyeccion | null {
  return proyectarCon(ejesDe(cam), p, ancho, alto);
}

/** Rayo de la pantalla (NDC, y hacia arriba) contra el suelo y = 0. */
export function rayoSuelo(cam: Camara, ndcX: number, ndcY: number): { x: number; z: number } | null {
  const ejes = ejesDe(cam);
  const f = 1 / Math.tan(ejes.fov / 2);
  const camX = (ndcX * ejes.aspecto) / f;
  const camY = ndcY / f;
  const dir = normalizar([
    ejes.adelante[0] + ejes.derecha[0] * camX + ejes.arriba[0] * camY,
    ejes.adelante[1] + ejes.derecha[1] * camX + ejes.arriba[1] * camY,
    ejes.adelante[2] + ejes.derecha[2] * camX + ejes.arriba[2] * camY,
  ]);
  if (Math.abs(dir[1]) < 1e-6) return null;
  const t = -ejes.ojo[1] / dir[1];
  if (t <= 0) return null;
  return { x: ejes.ojo[0] + dir[0] * t, z: ejes.ojo[2] + dir[2] * t };
}
