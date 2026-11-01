/** Parpadeo y respiración. El tiempo es el del bucle del mundo, en segundos. */

/** 1 abierto. Un cierre breve cada `period` segundos. */
export function blinkOpen(time: number, phase = 0, period = 3.8): number {
  const span = ((time + phase) % period + period) % period;
  const width = 0.12;
  if (span > width) return 1;
  const u = span / width;
  return 1 - 0.88 * Math.sin(u * Math.PI);
}

/** Escala del pecho, ±2 %. */
export function breathScale(time: number, phase = 0): number {
  return 1 + Math.sin(time * 1.5 + phase) * 0.02;
}

/** Balanceo del jugador: paso al andar y un aliento quieto. */
export function rigSway(time: number, moving: boolean): { z: number; y: number } {
  if (moving) {
    const step = Math.sin(time * 9);
    return { z: step * 0.07, y: Math.abs(step) * 0.035 };
  }
  return { z: 0, y: (breathScale(time, 0.8) - 1) * 0.6 };
}

/** Ranura de repintado. Cambia `hz` veces por segundo. */
export function windowPaintSlot(time: number, hz = 10): number {
  return Math.floor(time * hz);
}

export function idlePhase(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 33 + id.charCodeAt(i)) % 997;
  return (hash / 997) * Math.PI * 2;
}
