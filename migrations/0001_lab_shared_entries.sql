-- Tabla del laboratorio. Una fila por slug y clave.
-- value es texto: la API compartida guarda un string (JSON serializado, si la app quiere).
-- Cupos que aplica la Function: 32 claves, 32768 bytes por valor, 262144 bytes por slug.
-- Workers Free: si D1 pasa el cupo, la consulta falla y no hay cargo.
-- Las tablas de una aplicación no van aquí: llevan el prefijo de su slug.
-- Ampliar lab_* solo con otra migración numerada en migrations/.

CREATE TABLE IF NOT EXISTS lab_shared_entries (
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 40),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 64),
  value TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes >= 0 AND bytes <= 32768 AND bytes = length(CAST(value AS BLOB))),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40),
  PRIMARY KEY (slug, key)
);
