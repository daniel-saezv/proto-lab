import { describe, expect, it } from "vitest";
import {
  FOTO_EJEMPLO,
  LIMITES,
  PERFIL_EJEMPLO,
  TOPE_BOLSA,
  bolsaJson,
  celdasMes,
  claveVisto,
  conAsistencia,
  conVoto,
  crearPerfil,
  datosEjemplo,
  datosVacios,
  diaClave,
  fechaLocalValor,
  fotoSegura,
  fusionarDatos,
  leerBolsa,
  mezclarGrupo,
  planesPorSubir,
  volcadoDe,
  marcarVisto,
  miEstado,
  modoTrasDatos,
  moverMes,
  normalizarNombre,
  partirAgenda,
  planesDelDia,
  rangoMes,
  recuento,
  recordatorios,
  textoCuando,
  textoFallo,
  textoGente,
  textoPlazo,
  utf8,
  validarPlan,
  validarTexto,
  type Plan,
} from "./logic";

const ahora = new Date(2026, 10, 4, 12, 0, 0, 0);
const ahoraMs = ahora.getTime();

function plan(parcial: Partial<Plan> & Pick<Plan, "id" | "cuando">): Plan {
  return {
    titulo: "Cena",
    motivo: "Porque apetece verse.",
    lugar: "Casa",
    tipo: "plan",
    autorId: "ejana",
    autor: "Ana",
    creado: ahora.toISOString(),
    ...parcial,
  };
}

describe("planes y textos", () => {
  it("exige título y motivo", () => {
    const cuandoLocal = fechaLocalValor(new Date(2026, 10, 6, 21, 0));
    expect(validarPlan({ titulo: " ", motivo: "Porque sí", cuandoLocal, lugar: "", tipo: "plan" }, ahoraMs).ok).toBe(false);
    expect(validarPlan({ titulo: "Cena", motivo: "no", cuandoLocal, lugar: "", tipo: "plan" }, ahoraMs).ok).toBe(false);
    const bien = validarPlan(
      { titulo: "  Cena larga  ", motivo: "Porque hace un mes que no coincidimos.", cuandoLocal, lugar: " Casa ", tipo: "actividad" },
      ahoraMs,
    );
    expect(bien.ok).toBe(true);
    if (bien.ok) {
      expect(bien.valor.titulo).toBe("Cena larga");
      expect(bien.valor.lugar).toBe("Casa");
      expect(bien.valor.tipo).toBe("actividad");
      expect(new Date(bien.valor.cuando).getHours()).toBe(21);
    }
    expect(validarTexto("  hola  ", LIMITES.mensaje, "Escribe algo.").ok).toBe(true);
    expect(validarTexto("", LIMITES.mensaje, "Escribe algo.")).toEqual({ ok: false, error: "Escribe algo." });
  });

  it("normaliza el nombre y rechaza un mote raro", () => {
    expect(normalizarNombre("  Ana   López ")).toBe("Ana López");
    expect(normalizarNombre("")).toBeNull();
    expect(normalizarNombre("a".repeat(25))).toBeNull();
    expect(normalizarNombre("Ana<script>")).toBeNull();
    const perfil = crearPerfil("Nuria", () => 0.2);
    expect(perfil?.nombre).toBe("Nuria");
    expect(perfil?.id).toMatch(/^p[a-z0-9]{4,31}$/);
  });

  it("formatea el instante en hora local", () => {
    const fecha = new Date(2026, 10, 4, 20, 30);
    expect(textoCuando(fecha.toISOString())).toBe("mié 4 nov · 20:30");
    expect(diaClave(fecha)).toBe("2026-11-04");
    expect(textoPlazo(fecha.getTime() - 5 * 60_000, fecha.toISOString())).toBe("en 5 min");
    expect(textoPlazo(fecha.getTime() - 3 * 3_600_000, fecha.toISOString())).toBe("en 3 h");
  });
});

describe("calendario", () => {
  it("empieza en lunes y marca el 4 de noviembre", () => {
    const celdas = celdasMes(2026, 10);
    expect(celdas).toHaveLength(42);
    expect(celdas[0]?.clave).toBe("2026-10-26");
    expect(celdas.find((celda) => celda.clave === "2026-11-04")).toMatchObject({ numero: 4, enMes: true });
    expect(celdas.filter((celda) => celda.enMes)).toHaveLength(30);
    expect(moverMes(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it("acota el mes en ISO y separa la agenda", () => {
    const rango = rangoMes(2026, 10);
    const dentro = new Date(2026, 10, 30, 23, 30).toISOString();
    const fuera = new Date(2026, 11, 1, 0, 30).toISOString();
    expect(dentro >= rango.desde && dentro < rango.hasta).toBe(true);
    expect(fuera < rango.hasta).toBe(false);
    const partidos = partirAgenda(
      [plan({ id: "hoy", cuando: new Date(2026, 10, 4, 18, 0).toISOString() }), plan({ id: "ayer", cuando: new Date(2026, 10, 3, 18, 0).toISOString() })],
      ahoraMs,
    );
    expect(partidos.proximos.map((item) => item.id)).toEqual(["hoy"]);
    expect(partidos.pasados.map((item) => item.id)).toEqual(["ayer"]);
    expect(planesDelDia(partidos.proximos, "2026-11-04")).toHaveLength(1);
  });
});

describe("asistencia, votos y avisos", () => {
  it("confirma y anula sin duplicar a la persona", () => {
    const base = datosVacios();
    const voy = { planId: "p", personaId: "ana", persona: "Ana", estado: "voy" as const, actualizado: ahora.toISOString() };
    const conVoy = conAsistencia(base, voy);
    const anulada = conAsistencia(conVoy, { ...voy, estado: "no" });
    expect(anulada.asistencia).toHaveLength(1);
    expect(miEstado(anulada, "p", "ana")).toBe("no");
    expect(textoGente(anulada, "p")).toBe("Ana no va");
    expect(textoGente(datosEjemplo(ahora), "ejcena")).toBe("Ana y Luis van · Nuria no va");
  });

  it("deja un voto por persona y cambia de opción", () => {
    let datos = datosVacios();
    datos = {
      ...datos,
      opciones: [
        { id: "norte", planId: "ruta", texto: "Orilla norte", autorId: "luis", creado: ahora.toISOString() },
        { id: "pinar", planId: "ruta", texto: "El pinar", autorId: "nuria", creado: ahora.toISOString() },
      ],
    };
    datos = conVoto(datos, { planId: "ruta", personaId: "ana", opcionId: "norte", persona: "Ana", creado: ahora.toISOString() });
    datos = conVoto(datos, { planId: "ruta", personaId: "ana", opcionId: "pinar", persona: "Ana", creado: ahora.toISOString() });
    datos = conVoto(datos, { planId: "ruta", personaId: "luis", opcionId: "norte", persona: "Luis", creado: ahora.toISOString() });
    const cuentas = recuento(datos, "ruta", "ana");
    expect(cuentas.find((fila) => fila.opcion.id === "pinar")).toMatchObject({ votos: 1, mio: true });
    expect(cuentas.find((fila) => fila.opcion.id === "norte")).toMatchObject({ votos: 1, mio: false });
    expect(datos.votos.filter((voto) => voto.personaId === "ana")).toHaveLength(1);
  });

  it("avisa a quien va o propone, y calla si anula o ya lo vio", () => {
    const cerca = plan({ id: "cerca", cuando: new Date(ahoraMs + 5 * 3_600_000).toISOString() });
    const lejos = plan({ id: "lejos", cuando: new Date(ahoraMs + 40 * 3_600_000).toISOString(), autorId: "otro" });
    const pasado = plan({ id: "pasado", cuando: new Date(ahoraMs - 3_600_000).toISOString() });
    const ajeno = plan({ id: "ajeno", cuando: cerca.cuando, autorId: "otro" });
    const perfil = { ...PERFIL_EJEMPLO, avisoHoras: 24, vistos: [] };
    const asistencia = [{ planId: "ajeno", personaId: perfil.id, persona: "Ana", estado: "voy" as const, actualizado: ahora.toISOString() }];
    const lista = recordatorios([cerca, lejos, pasado, ajeno], asistencia, perfil, ahoraMs);
    expect(lista.map((item) => item.id)).toEqual(["cerca", "ajeno"]);

    const anulada = recordatorios(
      [cerca],
      [{ planId: "cerca", personaId: perfil.id, persona: "Ana", estado: "no", actualizado: ahora.toISOString() }],
      perfil,
      ahoraMs,
    );
    expect(anulada).toEqual([]);

    const visto = recordatorios([cerca], [], marcarVisto(perfil, cerca), ahoraMs);
    expect(visto).toEqual([]);
    expect(marcarVisto(perfil, cerca).vistos).toEqual([claveVisto(cerca)]);
  });

  it("el ejemplo deja la cena dentro del aviso", () => {
    const datos = datosEjemplo(ahora);
    const avisos = recordatorios(datos.planes, datos.asistencia, PERFIL_EJEMPLO, ahoraMs);
    expect(avisos.map((item) => item.id)).toEqual(["ejcena"]);
    expect(textoGente(datos, "ejcena")).toBe("Ana y Luis van · Nuria no va");
    expect(fotoSegura(FOTO_EJEMPLO)).toBe(FOTO_EJEMPLO);
    expect(utf8(FOTO_EJEMPLO)).toBeLessThanOrEqual(LIMITES.fotoBytes);
    expect(fotoSegura("javascript:alert(1)")).toBe("");
    expect(modoTrasDatos(true, true)).toBe("remoto");
    expect(modoTrasDatos(false, true)).toBe("local");
    expect(modoTrasDatos(false, false)).toBe("ejemplo");
  });
});

describe("bolsa local", () => {
  it("sobrevive a un viaje JSON y cabe en el guardado", () => {
    const datos = datosEjemplo(ahora);
    const json = bolsaJson(datos);
    expect(utf8(json)).toBeLessThanOrEqual(TOPE_BOLSA);
    const leida = leerBolsa(json);
    expect(leida?.planes.map((item) => item.id).sort()).toEqual(datos.planes.map((item) => item.id).sort());
    expect(leida?.asistencia).toHaveLength(datos.asistencia.length);
    expect(leerBolsa("{")).toBeNull();
    expect(leerBolsa(JSON.stringify({ planes: [{ id: 1 }] }))?.planes).toEqual([]);
  });

  it("prepara el volcado de lo que el grupo aún no tiene", () => {
    const local = datosEjemplo(ahora);
    const remotos = local.planes.filter((plan) => plan.id !== "ejcena");
    const nuevos = planesPorSubir(local, remotos);
    expect(nuevos.map((plan) => plan.id)).toEqual(["ejcena"]);
    const volcado = volcadoDe(local, nuevos);
    expect(volcado.asistencia.every((fila) => fila.planId === "ejcena")).toBe(true);
    expect(volcado.mensajes.every((fila) => fila.planId === "ejcena")).toBe(true);
    expect(volcado.opciones).toHaveLength(0);
  });

  it("fusiona un tramo sin pisar otro mes", () => {
    const base = datosEjemplo(ahora);
    const extra = datosVacios();
    const cena = base.planes.find((item) => item.id === "ejcena");
    if (!cena) throw new Error("falta la cena");
    extra.planes = [cena, plan({ id: "nueva", cuando: new Date(2026, 11, 2, 12).toISOString() })];
    extra.asistencia = [{ planId: "ejcena", personaId: "ejana", persona: "Ana", estado: "no", actualizado: ahora.toISOString() }];
    const fusion = fusionarDatos(base, extra);
    expect(fusion.planes.some((item) => item.id === "ejruta")).toBe(true);
    expect(fusion.planes.some((item) => item.id === "nueva")).toBe(true);
    expect(miEstado(fusion, "ejcena", "ejana")).toBe("no");
    expect(fusion.votos.some((voto) => voto.planId === "ejruta")).toBe(true);
  });

  it("traduce los fallos del grupo sin filtrar el detalle", () => {
    expect(textoFallo(new Error("quota"))).toMatch(/cupo/);
    expect(textoFallo(new Error("unauthorized"))).toMatch(/sesión/);
    expect(textoFallo(new Error("SELECT secret"))).toBe("No he podido hablar con el grupo.");
  });
});

describe("bolsa compartida", () => {
  it("conserva el plan del otro y el voto más reciente", () => {
    const remoto = datosEjemplo(ahora);
    const local = datosVacios();
    local.planes = [plan({ id: "picnic", titulo: "Picnic", cuando: new Date(ahora.getTime() + 86_400_000).toISOString() })];
    local.asistencia = [
      { planId: "ejcena", personaId: "ejana", persona: "Ana", estado: "no", actualizado: new Date(ahora.getTime() - 60_000).toISOString() },
    ];
    local.votos = [
      { planId: "ejruta", personaId: "ejana", opcionId: "ojpinar", persona: "Ana", creado: new Date(ahora.getTime() + 1000).toISOString() },
    ];
    local.mensajes = [{ id: "nuevo", planId: "ejcena", personaId: "ejana", persona: "Ana", texto: "Llevo pan.", creado: ahora.toISOString() }];
    const mezcla = mezclarGrupo(remoto, local);
    expect(mezcla.planes.map((item) => item.id).sort()).toEqual(["ejcena", "ejjuegos", "ejruta", "ejtarta", "picnic"]);
    expect(miEstado(mezcla, "ejcena", "ejana")).toBe("voy");
    expect(mezcla.votos.find((voto) => voto.personaId === "ejana")?.opcionId).toBe("ojpinar");
    expect(mezcla.mensajes.some((mensaje) => mensaje.id === "nuevo")).toBe(true);
    expect(mezcla.mensajes.some((mensaje) => mensaje.id === "mc1")).toBe(true);
    expect(mezcla.recuerdos.some((recuerdo) => recuerdo.foto.length > 0)).toBe(true);
  });
});
