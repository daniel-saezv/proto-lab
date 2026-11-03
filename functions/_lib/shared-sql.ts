/**
 * Sentencias fijas. Los datos de la aplicación solo entran por `bind`.
 * El INSERT es una sola sentencia: el cupo de claves y de bytes se decide ahí.
 * La tabla es del laboratorio (`lab_shared_entries`), no de una aplicación.
 */
export const SHARED_SQL = {
  get: "SELECT value FROM lab_shared_entries WHERE slug = ?1 AND key = ?2",
  delete: "DELETE FROM lab_shared_entries WHERE slug = ?1 AND key = ?2",
  upsert: `INSERT INTO lab_shared_entries (slug, key, value, bytes, updated_at)
SELECT ?1, ?2, ?3, ?4, ?5
WHERE (
  EXISTS (SELECT 1 FROM lab_shared_entries WHERE slug = ?1 AND key = ?2)
  OR (SELECT COUNT(*) FROM lab_shared_entries WHERE slug = ?1) < ?6
)
AND (
  COALESCE((SELECT SUM(bytes) FROM lab_shared_entries WHERE slug = ?1), 0)
  - COALESCE((SELECT bytes FROM lab_shared_entries WHERE slug = ?1 AND key = ?2), 0)
  + ?4
) <= ?7
ON CONFLICT (slug, key) DO UPDATE SET
  value = excluded.value,
  bytes = excluded.bytes,
  updated_at = excluded.updated_at
RETURNING key`,
} as const;
