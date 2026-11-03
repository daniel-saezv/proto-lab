/** Cupos de datos compartidos. La Function los aplica; la migración fija el tope por valor. */
export const SHARED_LIMITS = {
  maxSlugLength: 40,
  maxKeyLength: 64,
  maxKeys: 32,
  maxValueBytes: 32 * 1024,
  maxSlugBytes: 256 * 1024,
  /** Un valor de 32 KiB cabe aunque JSON lo escape. Por encima, ni se parsea. */
  maxBodyBytes: 200 * 1024,
} as const;

/** Nombre fijo del binding D1 en Pages. Producción y previews usan el mismo nombre. */
export const D1_BINDING = "DB";

export const SHARED_KEY = /^[A-Za-z0-9._-]+$/;

export const BANNED_SHARED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Textos que D1 devuelve en Workers Free al pasar el cupo diario o el de almacenamiento.
 * No reintentar: la llamada ya falló y un reintento no desbloquea el cupo.
 */
export function isFreeTierQuota(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /exceeded D1's free tier|exceeded D1's maximum account storage|Exceeded maximum DB size|maximum response size limit/i.test(message);
}
