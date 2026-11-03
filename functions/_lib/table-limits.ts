/** Cupos de ejecución. Tienen que coincidir con TABLE_LIMITS de scripts/table-sql.mjs. */
export const TABLE_LIMITS = {
  maxStringBytes: 2048,
  maxRows: 50,
  maxResultBytes: 32 * 1024,
  maxBodyBytes: 48 * 1024,
  maxParams: 8,
} as const;
