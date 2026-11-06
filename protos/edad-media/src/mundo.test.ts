import { describe, expect, it } from "vitest";
import {
  aplicarGuardado,
  avanzar,
  deslizar,
  cambiarClase,
  construir,
  costeDe,
  crearPartida,
  danoTrasMuralla,
  fijarObjetivo,
  FICHAS,
  invocar,
  lanzar,
  moverHacia,
  planetasDe,
  posarRetrato,
  revivir,
  volcar,
  xpPara,
  type Azar,
  type Estado,
} from "./mundo";

function guion(...valores: number[]): Azar {
  let i = 0;
  return () => {
    const valor = valores[Math.min(i, valores.length - 1)] ?? 0;
    i += 1;
    return valor;
  };
}

function quieto(): Estado {
  const estado = crearPartida(4);
  estado.pausa = 999;
  estado.avisoT = 0;
  return estado;
}

describe("oficio, marcha y golpe", () => {
  it("cambia de oficio mientras no hay golpe y cierra la elección al recibir daño", () => {
    const estado = quieto();
    estado.vida = 10;
    expect(cambiarClase(estado, "fraile")).toBe(true);
    expect(estado.clase).toBe("fraile");
    expect(estado.vida).toBe(estado.vidaMax);
    expect(planetasDe(estado.clase, 1)).toEqual(["luna"]);
    estado.vida = 80;
    const enemigo = invocar(estado, "infante", estado.x + 1, estado.z, "oleada");
    enemigo.cd = 0;
    avanzar(estado, 0.05, () => 0);
    expect(estado.fase).toBe("juego");
    expect(estado.oficioAbierto).toBe(false);
    expect(cambiarClase(estado, "caballero")).toBe(false);
  });

  it("rodea la muralla en vez de clavarse en el radio", () => {
    const antes = { x: 0, z: -5 };
    let x = antes.x;
    let z = antes.z;
    for (let i = 0; i < 40; i += 1) {
      const paso = deslizar(x, z, x, z + 0.2);
      x = paso.x;
      z = paso.z;
    }
    expect(Math.hypot(x, z)).toBeGreaterThan(3);
    expect(Math.abs(x) + z).toBeGreaterThan(Math.abs(antes.x) + antes.z);
  });

  it("camina hacia el destino y solo hiere dentro del alcance", () => {
    const marcha = quieto();
    const z = marcha.z;
    moverHacia(marcha, 0, 12);
    avanzar(marcha, 0.3, () => 0);
    expect(marcha.z).toBeGreaterThan(z + 0.5);

    const lejos = quieto();
    const enemigo = invocar(lejos, "infante", lejos.x, lejos.z - 10, "oleada");
    const vida = enemigo.vida;
    fijarObjetivo(lejos, enemigo.id);
    lejos.cdGolpe = 0;
    avanzar(lejos, 0.05, () => 0);
    expect(enemigo.vida).toBe(vida);

    const cerca = quieto();
    const blanco = invocar(cerca, "infante", cerca.x, cerca.z + 1.1, "oleada");
    const antes = blanco.vida;
    fijarObjetivo(cerca, blanco.id);
    cerca.cdGolpe = 0;
    avanzar(cerca, 0.05, () => 0);
    expect(blanco.vida).toBeLessThan(antes);
  });
});

describe("castillo", () => {
  it("gasta materiales, rechaza lo que no alcanza y no pasa del máximo", () => {
    const estado = quieto();
    estado.piedra = costeDe("muralla", 0).piedra - 1;
    expect(construir(estado, "muralla").ok).toBe(false);
    estado.piedra = 100;
    estado.madera = 100;
    estado.oro = 100;
    expect(construir(estado, "muralla").ok).toBe(true);
    expect(estado.obras.muralla).toBe(1);
    estado.obras.muralla = 3;
    expect(construir(estado, "muralla").ok).toBe(false);
  });

  it("la muralla resta el golpe y la torre alcanza al que está cerca", () => {
    const golpe = (lienzos: number) => {
      const estado = quieto();
      estado.obras.muralla = lienzos;
      estado.vida = 100;
      const enemigo = invocar(estado, "infante", estado.x + 1, estado.z, "oleada");
      enemigo.cd = 0;
      avanzar(estado, 0.05, () => 0);
      return 100 - estado.vida;
    };
    expect(golpe(0)).toBe(danoTrasMuralla(7, 0));
    expect(golpe(3)).toBe(danoTrasMuralla(7, 3));
    expect(golpe(3)).toBeLessThan(golpe(0));

    const estado = quieto();
    estado.obras.torre = 1;
    estado.torreCd = 0;
    const enemigo = invocar(estado, "infante", 6, 0, "oleada");
    const vida = enemigo.vida;
    avanzar(estado, 0.05, () => 0);
    expect(enemigo.vida).toBe(vida - 8);
  });

  it("el granero cierra heridas", () => {
    const estado = quieto();
    estado.vida = 40;
    estado.obras.granero = 2;
    avanzar(estado, 1, () => 0);
    expect(estado.vida).toBeGreaterThan(44);
    expect(estado.vida).toBeLessThan(50);
  });
});

describe("esferas", () => {
  it("no lanza una esfera cerrada ni gasta aliento si no hay", () => {
    const estado = quieto();
    const mana = estado.mana;
    expect(lanzar(estado, "sol").ok).toBe(false);
    expect(estado.mana).toBe(mana);
    estado.mana = 0;
    expect(lanzar(estado, "marte").ok).toBe(false);
  });

  it("el sol de su hora hiere más, y la segunda vez espera", () => {
    const herir = (hora: number) => {
      const estado = quieto();
      cambiarClase(estado, "astrologo");
      estado.pausa = 999;
      estado.hora = hora;
      estado.mana = 200;
      const enemigo = invocar(estado, "infante", estado.x, estado.z - 2, "oleada");
      enemigo.vida = 400;
      lanzar(estado, "sol");
      return enemigo.vida;
    };
    expect(herir(0)).toBeLessThan(herir(1));
    const estado = quieto();
    cambiarClase(estado, "astrologo");
    estado.mana = 200;
    expect(lanzar(estado, "sol").ok).toBe(true);
    expect(lanzar(estado, "sol").ok).toBe(false);
  });

  it("Mercurio alarga el paso y Venus impide el golpe", () => {
    const sin = (() => {
      const estado = quieto();
      cambiarClase(estado, "ballestero");
      estado.pausa = 999;
      moverHacia(estado, 0, 14);
      const z = estado.z;
      avanzar(estado, 0.5, () => 0);
      return estado.z - z;
    })();
    const estado = quieto();
    cambiarClase(estado, "ballestero");
    estado.pausa = 999;
    estado.mana = 80;
    expect(lanzar(estado, "mercurio").ok).toBe(true);
    moverHacia(estado, 0, 14);
    const z = estado.z;
    avanzar(estado, 0.5, () => 0);
    expect(estado.z - z).toBeGreaterThan(sin + 0.4);

    const paz = quieto();
    paz.nivel = 7;
    paz.mana = 100;
    const enemigo = invocar(paz, "infante", paz.x, paz.z + 1, "oleada");
    enemigo.cd = 0;
    const vida = paz.vida;
    expect(lanzar(paz, "venus").ok).toBe(true);
    avanzar(paz, 0.4, () => 0);
    expect(paz.vida).toBe(vida);
    expect(enemigo.freno).toBeGreaterThan(0);
  });

  it("sube de nivel al cobrar experiencia y abre la esfera siguiente", () => {
    const estado = quieto();
    estado.xp = xpPara(1) - 1;
    const enemigo = invocar(estado, "infante", estado.x, estado.z + 1.1, "oleada");
    enemigo.vida = 1;
    fijarObjetivo(estado, enemigo.id);
    estado.cdGolpe = 0;
    avanzar(estado, 0.05, () => 0);
    expect(estado.nivel).toBe(2);
    expect(planetasDe(estado.clase, estado.nivel)).toHaveLength(2);
  });
});

describe("guerras, mitos y guardado", () => {
  it("suelta la primera hueste y, al vaciarla, pasa de oleada", () => {
    const estado = crearPartida(1);
    estado.pausa = 0;
    avanzar(estado, 0.05, () => 0.2);
    expect(estado.enemigos).toHaveLength(3);
    expect(estado.enemigos.every((enemigo) => enemigo.tipo === "infante")).toBe(true);
    for (const enemigo of estado.enemigos) enemigo.vida = 0;
    avanzar(estado, 0.05, guion(0.9));
    expect(estado.oleada).toBe(1);
    expect(estado.enemigos).toHaveLength(0);
    expect(estado.pausa).toBeGreaterThan(0);
    expect(estado.botin.length).toBeGreaterThan(0);
  });

  it("la misma semilla de mito trae al dragón, a la Dama o al perro", () => {
    const mito = (azar: Azar) => {
      const estado = crearPartida(1);
      estado.pausa = 0;
      avanzar(estado, 0.05, () => 0.2);
      for (const enemigo of estado.enemigos) enemigo.vida = 0;
      estado.nivel = 12;
      estado.xp = 0;
      estado.vida = 30;
      estado.oro = 0;
      estado.madera = 0;
      avanzar(estado, 0.05, azar);
      return estado;
    };
    const dragon = mito(guion(0.1, 0.99));
    expect(dragon.enemigos.some((enemigo) => enemigo.tipo === "dragon")).toBe(true);
    const dama = mito(guion(0.1, 0));
    expect(dama.vida).toBe(dama.vidaMax);
    expect(dama.enemigos.some((enemigo) => enemigo.tipo === "dragon")).toBe(false);
    const perro = mito(guion(0.1, 3 / 7));
    expect(perro.oro).toBe(8);
    expect(perro.vida).toBe(22);
  });

  it("Júpiter dobla el oro del botín y la caída se guarda y se lee", () => {
    const estado = quieto();
    estado.nivel = 7;
    estado.mana = 100;
    expect(lanzar(estado, "jupiter").ok).toBe(true);
    const enemigo = invocar(estado, "infante", estado.x, estado.z + 1.1, "oleada");
    enemigo.vida = 1;
    fijarObjetivo(estado, enemigo.id);
    estado.cdGolpe = 0;
    avanzar(estado, 0.05, () => 0);
    const pieza = estado.botin[0];
    expect(pieza?.oro).toBe(FICHAS.infante.oro * 2);
    if (!pieza) return;
    estado.x = pieza.x;
    estado.z = pieza.z;
    const oro = estado.oro;
    avanzar(estado, 0.05, () => 0);
    expect(estado.oro).toBe(oro + pieza.oro);

    estado.oro = 10;
    estado.vida = 4;
    estado.obras.muralla = 0;
    const golpe = invocar(estado, "infante", estado.x + 1, estado.z, "oleada");
    golpe.cd = 0;
    avanzar(estado, 0.05, () => 0);
    expect(estado.fase).toBe("caido");
    expect(estado.oro).toBe(8);
    revivir(estado);
    expect(estado.fase).toBe("juego");
    expect(estado.vida).toBeGreaterThan(1);

    estado.clase = "fraile";
    estado.nivel = 4;
    estado.xp = 3;
    estado.oro = 12;
    estado.madera = 7;
    estado.piedra = 9;
    estado.obras.torre = 2;
    estado.guerra = 2;
    estado.ciclo = 1;
    estado.oleada = 1;
    const crudo = volcar(estado);
    const otro = crearPartida(9);
    expect(aplicarGuardado(otro, crudo)).toBe(true);
    expect(otro.clase).toBe("fraile");
    expect(otro.nivel).toBe(4);
    expect(otro.oro).toBe(12);
    expect(otro.obras.torre).toBe(2);
    expect(otro.guerra).toBe(2);
    expect(otro.anio).toBe(1346);
    expect(otro.oficioAbierto).toBe(false);
    expect(aplicarGuardado(otro, "{")).toBe(false);
    expect(otro.oro).toBe(12);
    expect(aplicarGuardado(otro, JSON.stringify({ v: 1, clase: "mago" }))).toBe(false);
  });

  it("posa un retrato con castillo y hueste", () => {
    const estado = crearPartida(1);
    posarRetrato(estado);
    expect(estado.obras.muralla).toBe(2);
    expect(estado.enemigos.length).toBe(3);
    expect(estado.aviso).toContain("Hastings");
    expect(estado.oficioAbierto).toBe(false);
  });
});
