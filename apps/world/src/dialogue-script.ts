export type DialogueSpeaker = {
  id: string;
  name: string;
};

export type ScriptChoice = {
  id: string;
  label: string;
  /** Siguiente nodo. Si falta, la conversación se cierra. */
  next?: string;
};

export type ScriptNode = {
  text: string;
  choices: ScriptChoice[];
};

export type DialogueScript = {
  speaker: DialogueSpeaker;
  start: string;
  nodes: Record<string, ScriptNode>;
};

export type ScriptCursor = {
  script: DialogueScript;
  nodeId: string;
};

export function startScript(script: DialogueScript): ScriptCursor {
  return { script, nodeId: script.start };
}

export function scriptNode(cursor: ScriptCursor): ScriptNode {
  const node = cursor.script.nodes[cursor.nodeId];
  if (!node) throw new Error(`Nodo de diálogo desconocido: ${cursor.nodeId}`);
  return node;
}

/** Avanza por una opción. `"close"` cierra el diálogo. */
export function chooseScript(cursor: ScriptCursor, choiceId: string): ScriptCursor | "close" {
  const choice = scriptNode(cursor).choices.find((item) => item.id === choiceId);
  if (!choice?.next) return "close";
  if (!cursor.script.nodes[choice.next]) throw new Error(`Nodo de diálogo desconocido: ${choice.next}`);
  return { script: cursor.script, nodeId: choice.next };
}

const remolon: DialogueScript = {
  speaker: { id: "remolon", name: "Remolón" },
  start: "hi",
  nodes: {
    hi: {
      text: "Uy, has llegado hasta el sofá. Soy Remolón: vigilo la tele y, de paso, la máquina del laboratorio. Ahí dentro se encienden los mundos, apps y juegos que el grupo va haciendo juntos. ¿Te quedas o es solo un estirón de piernas?",
      choices: [
        { id: "choice-remolon-lab", label: "¿Qué es este laboratorio?", next: "lab" },
        { id: "choice-remolon-machine", label: "¿Esa máquina es la tele?", next: "machine" },
        { id: "choice-remolon-bye", label: "Te dejo con la tele" },
      ],
    },
    lab: {
      text: "Es nuestro punto de encuentro. Quedamos, divagamos y, cuando una idea tiene potencial, se nota en la cara de los demás. No las encargamos: salen de la creatividad del grupo de amigos. Yo aporto el criterio del que no se levanta.",
      choices: [
        { id: "choice-remolon-and-then", label: "¿Y si la idea cuaja?", next: "machine" },
        { id: "choice-remolon-stay", label: "Me siento un minuto" },
      ],
    },
    machine: {
      text: "La tele solo hace ruido bonito. La máquina es otra cosa, y hay una sola: dentro viven los mundos, apps y juegos. Los desarrollamos en colaboración, desde este laboratorio, y ella los guarda todos. Si vieras dos, sería el reflejo. O las ganas de echarte una siesta.",
      choices: [
        { id: "choice-remolon-back", label: "Repíteme lo del laboratorio", next: "lab" },
        { id: "choice-remolon-ok", label: "Queda claro, guardián del sofá" },
      ],
    },
  },
};

const brasa: DialogueScript = {
  speaker: { id: "brasa", name: "Brasa" },
  start: "hi",
  nodes: {
    hi: {
      text: "Sopla hacia otro lado, que esta pipa ya tiene su público. Soy Brasa. Me siento a dejar que las ideas se templen antes de que nadie las apure. ¿Charla o silencio?",
      choices: [
        { id: "choice-brasa-meet", label: "¿Por qué os reunís aquí?", next: "meet" },
        { id: "choice-brasa-machine", label: "¿Qué hacéis con las ideas buenas?", next: "machine" },
        { id: "choice-brasa-bye", label: "Sigo, sin soplar" },
      ],
    },
    meet: {
      text: "El laboratorio es el punto de encuentro. El grupo de amigos trae ocurrencias —unas con chispa, otras que solo huelen a humo— y miramos cuáles tienen potencial. La creatividad es de todos, no de un genio que no invita a nadie. Aunque el Inventor lleve sombrero y lo parezca.",
      choices: [
        { id: "choice-brasa-then", label: "¿Y las que aguantan?", next: "machine" },
        { id: "choice-brasa-thanks", label: "Gracias, Brasa" },
      ],
    },
    machine: {
      text: "Las que aguantan el humo entran en la máquina. Una nada más, con sitio para mundos, apps y juegos distintos. Los hacemos en colaboración, desde aquí. Yo pongo la pausa: alguien tiene que vigilar que no nos quememos.",
      choices: [
        { id: "choice-brasa-again", label: "Háblame otra vez del laboratorio", next: "meet" },
        { id: "choice-brasa-ok", label: "Me llevo la calma" },
      ],
    },
  },
};

const naipe: DialogueScript = {
  speaker: { id: "naipe", name: "Naipe" },
  start: "hi",
  nodes: {
    hi: {
      text: "Ni se te ocurra mirarme la mano, que aún no sé si es buena. Soy Naipe. Barajo lo que se nos ocurre hasta que una carta promete. ¿Te repartes una pregunta?",
      choices: [
        { id: "choice-naipe-seek", label: "¿Qué buscáis al juntaros?", next: "seek" },
        { id: "choice-naipe-where", label: "¿Dónde acaban las cartas buenas?", next: "machine" },
        { id: "choice-naipe-bye", label: "No enseño mi juego" },
      ],
    },
    seek: {
      text: "Esto es un punto de encuentro: el grupo de amigos se sienta a detectar ideas con potencial. Salen de nuestra creatividad, como naipes que nadie ha visto. Las miramos juntos, nos reímos de las malas y nos quedamos con las que pican.",
      choices: [
        { id: "choice-naipe-then", label: "¿Y las que pican?", next: "machine" },
        { id: "choice-naipe-deal", label: "Reparte, pues" },
      ],
    },
    machine: {
      text: "Esas entran en la máquina del laboratorio. Hay una sola, y dentro caben mundos, apps y juegos muy distintos. Los desarrollamos en colaboración, desde este rincón y el resto del taller. Yo solo barajo; el cuaderno del Inventor hace el resto.",
      choices: [
        { id: "choice-naipe-back", label: "Baraja otra vez lo del encuentro", next: "seek" },
        { id: "choice-naipe-ok", label: "Buena mano" },
      ],
    },
  },
};

const croquis: DialogueScript = {
  speaker: { id: "croquis", name: "Croquis" },
  start: "hi",
  nodes: {
    hi: {
      text: "Trazo bajito: las ideas se asustan si las dibujo muy fuerte. Soy Croquis. ¿Miras el boceto o me cuentas el tuyo?",
      choices: [
        { id: "choice-croquis-lab", label: "¿Qué dibujas, en el fondo?", next: "lab" },
        { id: "choice-croquis-machine", label: "¿Dónde vive lo que merece tinta?", next: "machine" },
        { id: "choice-croquis-bye", label: "Te dejo el margen en blanco" },
      ],
    },
    lab: {
      text: "Dibujo lo que aparece cuando el grupo de amigos se encuentra. Este laboratorio es ese punto de encuentro: aquí detectamos ideas con potencial, y salen de nuestra creatividad, no de un encargo serio. Si el boceto nos hace reír y luego pensar, va por buen camino.",
      choices: [
        { id: "choice-croquis-then", label: "¿Y si el boceto aguanta?", next: "machine" },
        { id: "choice-croquis-margin", label: "Sigue, que te queda margen" },
      ],
    },
    machine: {
      text: "Si aguanta, pasa a la máquina. Una sola máquina para todos los mundos, apps y juegos. Los desarrollamos en colaboración, desde el laboratorio, y ella los tiene juntos. Yo no lleno páginas de más: con un margen basta.",
      choices: [
        { id: "choice-croquis-back", label: "Cuéntame otra vez el encuentro", next: "lab" },
        { id: "choice-croquis-fine", label: "Buen pulso" },
      ],
    },
  },
};

export const LOUNGE_SCRIPTS: Record<string, DialogueScript> = {
  remolon,
  brasa,
  naipe,
  croquis,
};

export function loungeScript(id: string): DialogueScript | undefined {
  return LOUNGE_SCRIPTS[id];
}
