import type { DialogueCue } from "./dialogue-cues";

export type { DialogueCue } from "./dialogue-cues";

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
  /** Gesto del personaje mientras se dice este nodo. */
  cue?: DialogueCue;
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
      text: "Ni se te ocurra pedirme que me levante: el sofá y yo hemos firmado una {em}tregua{/em}. Soy Remolón, especialista en la tele y en ideas que se quedan a medias. ¿Miras conmigo o vienes a no terminar algo?",
      cue: "slouch",
      choices: [
        { id: "choice-remolon-tv", label: "¿Qué echan?", next: "tv" },
        { id: "choice-remolon-halves", label: "¿Ideas a medias?", next: "halves" },
        { id: "choice-remolon-bye", label: "Te dejo con la tele" },
      ],
    },
    tv: {
      text: "Un {glow}fulgor{/glow} que cambia de color y no se compromete con nadie. Me representa. La tele, al menos, llega al siguiente canal. Las ideas que empiezan en este sofá suelen dormirse en el título, que es la parte que no cansa.",
      cue: "slouch",
      choices: [
        { id: "choice-remolon-titles", label: "Eso de los títulos…", next: "halves" },
        { id: "choice-remolon-watch", label: "Sigue, que yo miro" },
      ],
    },
    halves: {
      text: "«{mark}El faro perezoso{/mark}». «La cometa que dijo mañana». Títulos preciosos, cuerpos en blanco. Yo les hago compañía: abandonarlas de pie sería un esfuerzo. Si quieres que alguna espabile, Croquis tiene el lápiz. Yo tengo el mando, y la ironía.",
      choices: [
        { id: "choice-remolon-back-tv", label: "¿Y la tele lo aprueba?", next: "tv" },
        { id: "choice-remolon-stay", label: "Me quedo en el título" },
      ],
    },
  },
};

const brasa: DialogueScript = {
  speaker: { id: "brasa", name: "Brasa" },
  start: "hi",
  nodes: {
    hi: {
      text: "Aparta el aire, que esta {em}pipa{/em} ya cuenta sola. Soy Brasa. Recuerdo prototipos que el taller dio por buenos antes de que se les cayera el orgullo. ¿Batallita o silencio?",
      cue: "smoke",
      choices: [
        { id: "choice-brasa-pinball", label: "La del pinball", next: "gloton" },
        { id: "choice-brasa-spark", label: "Una que saliera viva", next: "spark" },
        { id: "choice-brasa-bye", label: "Sigo, sin soplar" },
      ],
    },
    gloton: {
      text: "El Glotón. Un pinball que, según el cuaderno, se reparaba solo. Según el suelo, se comía las bolas y {shake}eructaba resortes{/shake}. Tres tardes, un destornillador doblado y ni una disculpa. Lo jubilamos tapándolo con una caja. En mi época a eso se le llamaba ceremonia.",
      choices: [
        { id: "choice-brasa-victory", label: "¿Hubo alguna victoria?", next: "spark" },
        { id: "choice-brasa-rest", label: "Descansen los resortes" },
      ],
    },
    spark: {
      text: "También hubo una {glow}chispa terca{/glow}. Nació en una servilleta manchada de salsa y se negó a apagarse: alguien la persiguió con el dedo hasta que el taller aplaudió. No todas las batallas acaban en una caja. Algunas se quedan encendidas por cabezonería, no por discurso.",
      cue: "smoke",
      choices: [
        { id: "choice-brasa-again", label: "Otra derrota, anda", next: "gloton" },
        { id: "choice-brasa-ok", label: "Gracias, veterano" },
      ],
    },
  },
};

const naipe: DialogueScript = {
  speaker: { id: "naipe", name: "Naipe" },
  start: "hi",
  nodes: {
    hi: {
      text: "Manos sobre la mesa, que veo los dedos. Soy Naipe. Aquí no se juega por calderilla: se apuestan {em}ideas{/em}, y yo reparto. ¿Entras o miras desde la banda?",
      cue: "shuffle",
      choices: [
        { id: "choice-naipe-deal", label: "Reparte", next: "deal" },
        { id: "choice-naipe-stake", label: "¿Qué se apuesta?", next: "stake" },
        { id: "choice-naipe-bye", label: "Paso de la mano" },
      ],
    },
    deal: {
      text: "Tu carta: un título de tres palabras, dicho sin toser. La mía: un pato mal dibujado, que es mi especialidad. Gana quien arranque una risa sin levantarse. Si pierdes, me debes una idea que todavía no hayas soltado. Si ganas, te debo este {mark}as{/mark}: es de cartón y presume igual.",
      cue: "shuffle",
      choices: [
        { id: "choice-naipe-raise", label: "Subo", next: "stake" },
        { id: "choice-naipe-fold", label: "Me planto" },
      ],
    },
    stake: {
      text: "La apuesta es el nombre de algo que aún no existe. Si lo dices, cae en mi montón y ya no es del todo tuyo: es de la mesa. Remolón ni se giraría a mirarlo. Brasa juraría que ya ardió una vez. Yo solo quiero ver si {shake}blefeaste{/shake}. ¿Cartas o retirada digna?",
      choices: [
        { id: "choice-naipe-cards", label: "Cartas", next: "deal" },
        { id: "choice-naipe-out", label: "Retirada digna" },
      ],
    },
  },
};

const croquis: DialogueScript = {
  speaker: { id: "croquis", name: "Croquis" },
  start: "hi",
  nodes: {
    hi: {
      text: "Si aprieto el lápiz, el trazo se asusta y se esconde. Soy Croquis. Dibujo lo que el grupo se atreve a decir en {em}voz alta{/em}. ¿Quieres ver cómo nace una propuesta?",
      cue: "sketch",
      choices: [
        { id: "choice-croquis-born", label: "¿Cómo nace?", next: "born" },
        { id: "choice-croquis-machine", label: "¿Dónde vive después?", next: "machine" },
        { id: "choice-croquis-bye", label: "Te dejo el margen" },
      ],
    },
    born: {
      text: "En este laboratorio, que es nuestro punto de encuentro. El grupo de amigos se sienta y, de la creatividad de todos, asoma una idea con {glow}potencial{/glow}. No viene encargada. Alguien la dice, yo la dejo en un boceto y, si sigue en pie cuando se enfría el café, se la contamos al Inventor para que la apunte.",
      cue: "sketch",
      choices: [
        { id: "choice-croquis-then", label: "¿Y si el boceto aguanta?", next: "machine" },
        { id: "choice-croquis-clear", label: "Así me queda" },
      ],
    },
    machine: {
      text: "Si aguanta, pasa a la máquina. Una sola máquina, y dentro muchos mundos: los mundos, apps y juegos que hacemos en {em}colaboración{/em} desde el laboratorio. Yo marco el margen y se lo dejo al Inventor. Con eso le basta para empezar.",
      choices: [
        { id: "choice-croquis-back", label: "Repíteme cómo nace", next: "born" },
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
