import {
  AVISO_HORAS,
  LIMITES,
  celdasMes,
  diaClave,
  fechaLocalValor,
  fotoSegura,
  miEstado,
  partirAgenda,
  planesDelDia,
  recuento,
  recordatorios,
  textoCuando,
  textoGente,
  textoPlazo,
  tituloMes,
  type Datos,
  type EstadoAsistencia,
  type ModoGrupo,
  type Perfil,
  type Plan,
  type TipoPlan,
} from "./logic";

export type Pestana = "agenda" | "mes" | "recuerdos";

export type Pantalla =
  | { tipo: "principal" }
  | { tipo: "ficha"; id: string }
  | { tipo: "alta" };

export type EstadoVista = {
  modo: "cargando" | ModoGrupo;
  perfil: Perfil | null;
  datos: Datos;
  pestana: Pestana;
  pantalla: Pantalla;
  mes: { year: number; month: number };
  dia: string;
  ahora: number;
  aviso: string;
  ocupado: boolean;
};

export type Borrador = { titulo: string; motivo: string; cuandoLocal: string; lugar: string; tipo: string; nombre: string };

export type Acciones = {
  ui: (accion: string, id: string) => void;
  proponer: (borrador: Borrador) => void;
  perfil: (nombre: string) => void;
  opcion: (texto: string) => void;
  mensaje: (texto: string) => void;
  recuerdo: (planId: string, texto: string, file: File | null) => void;
};

type Child = Node | string | false | null | undefined;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | undefined>,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  if (node instanceof HTMLButtonElement && !node.hasAttribute("type")) node.type = "button";
  for (const child of children) {
    if (child == null || child === false || child === "") continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function campo(id: string, etiqueta: string, control: HTMLElement): HTMLElement {
  return h("label", { class: "etiqueta" }, etiqueta, control);
}

function botonEstado(texto: string, clase: string, activo: boolean, act: string, id: string): HTMLButtonElement {
  return h("button", {
    class: activo ? `${clase} activo` : clase,
    "data-act": act,
    "data-id": id,
    "aria-pressed": activo ? "true" : "false",
  }, texto);
}

function sugerencia(ms: number): string {
  const fecha = new Date(ms + 24 * 3_600_000);
  fecha.setHours(19, 0, 0, 0);
  return fechaLocalValor(fecha);
}

const LIBRES = new Set(["cerrar", "tab", "mes", "dia"]);

export function montar(root: HTMLElement, acciones: Acciones): {
  pintar: (estado: EstadoVista, cuerpo?: boolean, limpiar?: string[]) => void;
  pulso: (estado: EstadoVista) => void;
} {
  const reloj = h("time", { class: "reloj" });
  const quien = h("p", { class: "quien" });
  const actualizar = h("button", { class: "fantasma", "data-act": "actualizar" }, "Actualizar");
  const aviso = h("p", { class: "aviso", role: "status" });
  const nota = h("p", { class: "nota" });
  const recordatorioTexto = h("p", {});
  const recordatorioExtra = h("p", { class: "kicker" });
  const ocultar = h("button", { "data-act": "visto" }, "Ocultar");
  const recordatorio = h(
    "div",
    { class: "recordatorio" },
    h("span", { class: "latido", "aria-hidden": "true" }),
    h("div", {}, h("p", { class: "kicker" }, "Recordatorio"), recordatorioTexto, recordatorioExtra),
    ocultar,
  );
  recordatorio.hidden = true;
  aviso.hidden = true;
  nota.hidden = true;
  const cuerpo = h("main", { class: "cuerpo" });
  const nav = h("nav", { class: "nav" });
  const barra = h(
    "header",
    { class: "barra" },
    h("div", { class: "marca" }, h("div", { class: "sello", "aria-hidden": "true" }, "C"), h("div", {}, h("h1", {}, "Conecta"), quien)),
    h("div", { class: "lado" }, reloj, actualizar),
  );
  root.replaceChildren(barra, aviso, nota, recordatorio, cuerpo, nav);

  let ultimo: EstadoVista | null = null;
  let tipoAlta: TipoPlan = "plan";
  let pantallaPrevia = "";
  let firmaAviso = "";
  const conservados = ["nombre-input", "alta-titulo", "alta-cuando", "alta-lugar", "alta-motivo", "opcion-texto", "chat-texto", "recuerdo-texto"];

  function valores(): Map<string, { value: string; start: number | null }> {
    const mapa = new Map<string, { value: string; start: number | null }>();
    for (const id of conservados) {
      const node = document.getElementById(id);
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        mapa.set(id, { value: node.value, start: node.selectionStart });
      }
    }
    return mapa;
  }

  function restaurar(mapa: Map<string, { value: string; start: number | null }>, foco: string): void {
    for (const [id, guardado] of mapa) {
      const node = document.getElementById(id);
      if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) continue;
      node.value = guardado.value;
      if (guardado.start != null) node.selectionStart = node.selectionEnd = guardado.start;
    }
    if (!foco) return;
    const node = document.getElementById(foco);
    if (node instanceof HTMLElement) node.focus();
  }

  function pintarReloj(ms: number): void {
    const fecha = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    reloj.dateTime = fecha.toISOString();
    reloj.textContent = `${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
  }

  function pintarRecordatorio(estado: EstadoVista): void {
    const lista = estado.perfil ? recordatorios(estado.datos.planes, estado.datos.asistencia, estado.perfil, estado.ahora) : [];
    const primero = lista[0];
    const firma = primero ? `${primero.id}|${textoPlazo(estado.ahora, primero.cuando)}|${lista.length}` : "";
    if (firma === firmaAviso) return;
    firmaAviso = firma;
    recordatorio.hidden = !primero;
    if (!primero) return;
    recordatorioTexto.textContent = `${textoPlazo(estado.ahora, primero.cuando)} · ${primero.titulo}`;
    recordatorioExtra.textContent = lista.length > 1 ? `y ${lista.length - 1} más` : "Con la aplicación abierta";
    ocultar.dataset.id = primero.id;
  }

  function tarjeta(plan: Plan, estado: EstadoVista): HTMLElement {
    const mio = miEstado(estado.datos, plan.id, estado.perfil?.id ?? null);
    const gente = textoGente(estado.datos, plan.id);
    return h(
      "article",
      { class: "tarjeta" },
      h("div", { class: "fila" }, h("span", { class: "pill" }, plan.tipo === "actividad" ? "Actividad" : "Plan"), h("span", { class: "meta" }, plan.autor)),
      h("button", { class: "titulo-btn", "data-act": "abrir", "data-id": plan.id }, plan.titulo),
      h("p", { class: "cuando" }, textoCuando(plan.cuando), plan.lugar ? ` · ${plan.lugar}` : ""),
      h("p", { class: "extracto" }, plan.motivo),
      gente ? h("p", { class: "gente" }, gente) : false,
      h(
        "div",
        { class: "acciones" },
        botonEstado("Voy", "voy", mio === "voy", "voy", plan.id),
        botonEstado("Anular", "anular", mio === "no", "anular", plan.id),
      ),
    );
  }

  function horas(estado: EstadoVista): HTMLElement | false {
    if (!estado.perfil) return false;
    return h(
      "div",
      { class: "horas" },
      h("span", { class: "meta" }, "Avisar con"),
      ...AVISO_HORAS.map((horasAviso) =>
        h("button", {
          class: estado.perfil?.avisoHoras === horasAviso ? "segmento activo" : "segmento",
          "data-act": "horas",
          "data-id": String(horasAviso),
          "aria-pressed": estado.perfil?.avisoHoras === horasAviso ? "true" : "false",
        }, `${horasAviso} h`),
      ),
    );
  }

  function agenda(estado: EstadoVista): HTMLElement {
    const partes = partirAgenda(estado.datos.planes, estado.ahora);
    const bloques: Child[] = [
      estado.modo === "cargando" ? h("p", { class: "hueco" }, "Buscando los planes del grupo…") : false,
      !estado.perfil && estado.modo !== "ejemplo" ? formularioNombre() : false,
      horas(estado),
      h("p", { class: "pie" }, "El aviso sale en esta pantalla mientras Conecta está abierto."),
    ];
    if (partes.proximos.length === 0 && estado.modo !== "cargando") {
      bloques.push(h("p", { class: "hueco" }, "Todavía no hay planes por venir. Propón el primero."));
    }
    for (const plan of partes.proximos) bloques.push(tarjeta(plan, estado));
    if (partes.pasados.length > 0) {
      bloques.push(h("h2", { class: "seccion" }, "Ya pasó"));
      for (const plan of partes.pasados) bloques.push(tarjeta(plan, estado));
    }
    return h("div", { class: "grupo" }, ...bloques);
  }

  function calendario(estado: EstadoVista): HTMLElement {
    const celdas = celdasMes(estado.mes.year, estado.mes.month);
    const conPlan = new Set(
      estado.datos.planes.flatMap((plan) => {
        const ms = Date.parse(plan.cuando);
        return Number.isFinite(ms) ? [diaClave(new Date(ms))] : [];
      }),
    );
    const hoy = diaClave(new Date(estado.ahora));
    const delDia = planesDelDia(estado.datos.planes, estado.dia);
    return h(
      "div",
      { class: "grupo" },
      h(
        "div",
        { class: "mes-cabeza" },
        h("button", { "data-act": "mes", "data-id": "-1", "aria-label": "Mes anterior" }, "‹"),
        h("h2", {}, tituloMes(estado.mes.year, estado.mes.month)),
        h("button", { "data-act": "mes", "data-id": "1", "aria-label": "Mes siguiente" }, "›"),
      ),
      h("div", { class: "semana" }, ...["L", "M", "X", "J", "V", "S", "D"].map((dia) => h("span", {}, dia))),
      h(
        "div",
        { class: "mes" },
        ...celdas.map((celda) => {
          const clases = ["dia"];
          if (!celda.enMes) clases.push("fuera");
          if (celda.clave === hoy) clases.push("hoy");
          if (celda.clave === estado.dia) clases.push("elegido");
          if (conPlan.has(celda.clave)) clases.push("con");
          return h("button", {
            class: clases.join(" "),
            "data-act": celda.enMes ? "dia" : undefined,
            "data-id": celda.clave,
            disabled: celda.enMes ? undefined : "",
            "aria-label": `${celda.numero}${conPlan.has(celda.clave) ? ", con planes" : ""}`,
            "aria-pressed": celda.clave === estado.dia ? "true" : "false",
          }, String(celda.numero));
        }),
      ),
      h("h2", { class: "seccion" }, "Ese día"),
      delDia.length > 0 ? false : h("p", { class: "hueco" }, "Nada apuntado."),
      ...delDia.map((plan) => tarjeta(plan, estado)),
    );
  }

  function formularioNombre(): HTMLElement {
    return h(
      "form",
      { id: "perfil", class: "bloque" },
      campo("nombre-input", "¿Cómo te llamamos?", h("input", { id: "nombre-input", class: "campo", maxlength: String(LIMITES.nombre), autocomplete: "nickname", required: "" })),
      h("button", { type: "submit", class: "primaria" }, "Listo"),
    );
  }

  function formularioRecuerdo(estado: EstadoVista, planId: string): HTMLElement {
    const planes = [...estado.datos.planes].sort((a, b) => b.cuando.localeCompare(a.cuando));
    return h(
      "form",
      { id: "recuerdo", class: "bloque", "data-plan": planId },
      planId
        ? false
        : campo(
            "recuerdo-plan",
            "Plan",
            h(
              "select",
              { id: "recuerdo-plan", class: "campo" },
              ...planes.map((plan) => h("option", { value: plan.id }, plan.titulo)),
            ),
          ),
      campo("recuerdo-texto", "Recuerdo", h("textarea", { id: "recuerdo-texto", maxlength: String(LIMITES.recuerdo) })),
      h("label", { class: "archivo" }, "Añadir estampa", h("input", { id: "recuerdo-foto", type: "file", accept: "image/*" })),
      h("p", { class: "pie" }, "La foto se guarda pequeña, del tamaño de una estampa."),
      h("button", { type: "submit", class: "primaria" }, "Guardar recuerdo"),
    );
  }

  function recuerdos(estado: EstadoVista): HTMLElement {
    const porPlan = new Map(estado.datos.planes.map((plan) => [plan.id, plan.titulo]));
    const lista = [...estado.datos.recuerdos].sort((a, b) => b.creado.localeCompare(a.creado));
    return h(
      "div",
      { class: "grupo" },
      estado.datos.planes.length > 0 ? formularioRecuerdo(estado, "") : h("p", { class: "hueco" }, "Cuando haya un plan, podrás dejar aquí la foto y la frase."),
      ...lista.map((recuerdo) => {
        const foto = fotoSegura(recuerdo.foto);
        return h(
          "article",
          { class: "tarjeta fila" },
          foto
            ? h("img", { class: "estampa", src: foto, alt: `Recuerdo de ${recuerdo.persona}` })
            : recuerdo.tieneFoto
              ? h("button", { class: "secundaria", "data-act": "foto", "data-id": recuerdo.id }, "Ver estampa")
              : h("div", { class: "estampa", "aria-hidden": "true" }),
          h(
            "div",
            {},
            h("p", { class: "meta" }, `${recuerdo.persona} · ${porPlan.get(recuerdo.planId) ?? "Plan"}`),
            h("p", {}, recuerdo.texto),
          ),
        );
      }),
    );
  }

  function ficha(estado: EstadoVista, id: string): HTMLElement {
    const plan = estado.datos.planes.find((item) => item.id === id);
    if (!plan) {
      return h("div", {}, h("button", { class: "cerrar", "data-act": "cerrar" }, "Volver"), h("p", { class: "hueco" }, "Ese plan ya no está."));
    }
    const mio = miEstado(estado.datos, plan.id, estado.perfil?.id ?? null);
    const votos = recuento(estado.datos, plan.id, estado.perfil?.id ?? null);
    const mensajes = estado.datos.mensajes
      .filter((mensaje) => mensaje.planId === plan.id)
      .sort((a, b) => a.creado.localeCompare(b.creado));
    const memorias = estado.datos.recuerdos.filter((recuerdo) => recuerdo.planId === plan.id);
    return h(
      "div",
      { class: "grupo" },
      h("button", { class: "cerrar", "data-act": "cerrar" }, "Volver"),
      h("article", { class: "tarjeta" },
        h("span", { class: "pill" }, plan.tipo === "actividad" ? "Actividad" : "Plan"),
        h("h2", { class: "titulo-btn" }, plan.titulo),
        h("p", { class: "cuando" }, `${textoCuando(plan.cuando)}${plan.lugar ? ` · ${plan.lugar}` : ""}`),
        h("p", { class: "meta" }, `Lo propone ${plan.autor}`),
        h("p", { class: "porque" }, h("span", {}, "Por qué"), plan.motivo),
        h("h2", { class: "seccion" }, "Asistencia"),
        h("p", { class: "gente" }, textoGente(estado.datos, plan.id) || "Nadie ha dicho nada todavía."),
        h("div", { class: "acciones" },
          botonEstado("Voy", "voy", mio === "voy", "voy", plan.id),
          botonEstado("Anular", "anular", mio === "no", "anular", plan.id),
        ),
      ),
      h("section", {},
        h("h2", { class: "seccion" }, "Votación"),
        votos.length === 0 ? h("p", { class: "hueco" }, "Todavía no hay opciones.") : false,
        ...votos.map((fila) =>
          h("div", { class: "opcion" },
            h("div", {}, h("strong", {}, fila.opcion.texto), h("div", { class: "cuenta" }, fila.votos === 1 ? "1 voto" : `${fila.votos} votos`)),
            h("button", {
              class: fila.mio ? "secundaria activo" : "secundaria",
              "data-act": "votar",
              "data-id": fila.opcion.id,
              "aria-pressed": fila.mio ? "true" : "false",
            }, fila.mio ? "Tu voto" : "Votar"),
          ),
        ),
        h("form", { id: "opcion" },
          campo("opcion-texto", "Nueva opción", h("input", { id: "opcion-texto", class: "campo", maxlength: String(LIMITES.opcion) })),
          h("button", { type: "submit", class: "secundaria" }, "Añadir opción"),
        ),
      ),
      h("section", {},
        h("h2", { class: "seccion" }, "Charla"),
        mensajes.length === 0 ? h("p", { class: "hueco" }, "Todavía no hay mensajes. Concreta la hora, el sitio o lo que haya que llevar.") : false,
        ...mensajes.map((mensaje) =>
          h("div", { class: mensaje.personaId === estado.perfil?.id ? "burbuja mia" : "burbuja" },
            h("span", { class: "meta" }, mensaje.persona),
            h("p", {}, mensaje.texto),
          ),
        ),
        h("form", { id: "chat" },
          campo("chat-texto", "Mensaje", h("input", { id: "chat-texto", class: "campo", maxlength: String(LIMITES.mensaje) })),
          h("button", { type: "submit", class: "primaria" }, "Enviar"),
        ),
        h("button", { class: "fantasma", "data-act": "charla", "data-id": plan.id }, "Actualizar charla"),
      ),
      h("section", {},
        h("h2", { class: "seccion" }, "Recuerdo"),
        ...memorias.map((recuerdo) => {
          const foto = fotoSegura(recuerdo.foto);
          return h(
            "article",
            { class: "tarjeta fila" },
            foto ? h("img", { class: "estampa", src: foto, alt: `Recuerdo de ${recuerdo.persona}` }) : h("div", { class: "estampa", "aria-hidden": "true" }),
            h("p", {}, `${recuerdo.persona}: ${recuerdo.texto}`),
          );
        }),
        formularioRecuerdo(estado, plan.id),
      ),
    );
  }

  function alta(estado: EstadoVista): HTMLElement {
    return h(
      "form",
      { id: "alta", class: "grupo" },
      h("button", { type: "button", class: "cerrar", "data-act": "cerrar" }, "Volver"),
      h("div", { class: "acciones" },
        h("button", { type: "button", class: tipoAlta === "plan" ? "voy activo" : "voy", "data-act": "tipo", "data-id": "plan", "aria-pressed": tipoAlta === "plan" ? "true" : "false" }, "Plan"),
        h("button", { type: "button", class: tipoAlta === "actividad" ? "anular activo" : "anular", "data-act": "tipo", "data-id": "actividad", "aria-pressed": tipoAlta === "actividad" ? "true" : "false" }, "Actividad"),
      ),
      campo("alta-titulo", "Título", h("input", { id: "alta-titulo", class: "campo", maxlength: String(LIMITES.titulo), required: "" })),
      campo("alta-cuando", "Cuándo", h("input", { id: "alta-cuando", class: "campo", type: "datetime-local", value: sugerencia(estado.ahora), required: "" })),
      campo("alta-lugar", "Lugar", h("input", { id: "alta-lugar", class: "campo", maxlength: String(LIMITES.lugar) })),
      campo("alta-motivo", "Por qué", h("textarea", { id: "alta-motivo", maxlength: String(LIMITES.motivo), required: "" })),
      !estado.perfil
        ? campo("nombre-input", "¿Cómo te llamamos?", h("input", { id: "nombre-input", class: "campo", maxlength: String(LIMITES.nombre), autocomplete: "nickname", required: "" }))
        : false,
      h("button", { type: "submit", class: "primaria" }, "Proponer"),
    );
  }

  function pintarCuerpo(estado: EstadoVista): void {
    const foco = document.activeElement instanceof HTMLElement ? document.activeElement.id : "";
    const mapa = valores();
    const scroll = cuerpo.scrollTop;
    const pantalla = JSON.stringify(estado.pantalla);
    if (pantalla !== pantallaPrevia && estado.pantalla.tipo === "alta") tipoAlta = "plan";
    pantallaPrevia = pantalla;
    let contenido: HTMLElement;
    if (estado.pantalla.tipo === "ficha") contenido = ficha(estado, estado.pantalla.id);
    else if (estado.pantalla.tipo === "alta") contenido = alta(estado);
    else if (estado.pestana === "mes") contenido = calendario(estado);
    else if (estado.pestana === "recuerdos") contenido = recuerdos(estado);
    else contenido = agenda(estado);
    cuerpo.replaceChildren(contenido);
    cuerpo.scrollTop = scroll;
    restaurar(mapa, foco);
  }

  function pintarNav(estado: EstadoVista): void {
    const pestanas: Array<[Pestana, string]> = [
      ["agenda", "Agenda"],
      ["mes", "Mes"],
      ["recuerdos", "Recuerdos"],
    ];
    nav.replaceChildren(
      ...pestanas.map(([id, texto]) =>
        h("button", {
          "data-act": "tab",
          "data-id": id,
          "aria-current": estado.pantalla.tipo === "principal" && estado.pestana === id ? "page" : undefined,
        }, texto),
      ),
      h("button", { class: "nuevo", "data-act": "alta" }, "Nuevo"),
    );
  }

  function pintar(estado: EstadoVista, conCuerpo = true, limpiar: string[] = []): void {
    ultimo = estado;
    quien.textContent = estado.perfil?.nombre ?? "Elige un nombre";
    actualizar.hidden = estado.modo === "ejemplo" || estado.modo === "cargando";
    aviso.hidden = estado.aviso === "";
    aviso.textContent = estado.aviso;
    const textoNota =
      estado.modo === "ejemplo"
        ? "Ejemplo en este aparato. En el laboratorio el grupo comparte los mismos planes."
        : estado.modo === "local"
          ? "Sin el grupo: lo que anotes se queda en este aparato."
          : "";
    nota.hidden = textoNota === "";
    nota.textContent = textoNota;
    pintarReloj(estado.ahora);
    pintarRecordatorio(estado);
    pintarNav(estado);
    if (conCuerpo) pintarCuerpo(estado);
    for (const id of limpiar) {
      const node = document.getElementById(id);
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) node.value = "";
    }
  }

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const node = target.closest("[data-act]");
    if (!(node instanceof HTMLElement)) return;
    const act = node.dataset.act ?? "";
    if (act === "tipo") {
      tipoAlta = node.dataset.id === "actividad" ? "actividad" : "plan";
      for (const boton of root.querySelectorAll<HTMLButtonElement>("[data-act=tipo]")) {
        const activo = boton.dataset.id === tipoAlta;
        boton.classList.toggle("activo", activo);
        boton.setAttribute("aria-pressed", activo ? "true" : "false");
      }
      return;
    }
    if (ultimo?.ocupado && !LIBRES.has(act)) return;
    acciones.ui(act, node.dataset.id ?? "");
  });

  root.addEventListener("submit", (event) => {
    event.preventDefault();
    if (ultimo?.ocupado) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id === "perfil") {
      const input = form.querySelector("#nombre-input");
      acciones.perfil(input instanceof HTMLInputElement ? input.value : "");
      return;
    }
    if (form.id === "alta") {
      const leer = (id: string) => {
        const node = form.querySelector(`#${id}`);
        return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node.value : "";
      };
      acciones.proponer({
        titulo: leer("alta-titulo"),
        motivo: leer("alta-motivo"),
        cuandoLocal: leer("alta-cuando"),
        lugar: leer("alta-lugar"),
        tipo: tipoAlta,
        nombre: leer("nombre-input"),
      });
      return;
    }
    if (form.id === "opcion") {
      const input = form.querySelector("#opcion-texto");
      acciones.opcion(input instanceof HTMLInputElement ? input.value : "");
      return;
    }
    if (form.id === "chat") {
      const input = form.querySelector("#chat-texto");
      acciones.mensaje(input instanceof HTMLInputElement ? input.value : "");
      return;
    }
    if (form.id === "recuerdo") {
      const texto = form.querySelector("#recuerdo-texto");
      const fileInput = form.querySelector("#recuerdo-foto");
      const select = form.querySelector("#recuerdo-plan");
      const planId = form.dataset.plan || (select instanceof HTMLSelectElement ? select.value : "");
      const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] ?? null : null;
      acciones.recuerdo(planId, texto instanceof HTMLTextAreaElement ? texto.value : "", file);
    }
  });

  return {
    pintar,
    pulso(estado) {
      ultimo = estado;
      pintarReloj(estado.ahora);
      pintarRecordatorio(estado);
    },
  };
}
