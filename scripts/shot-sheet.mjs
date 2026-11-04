/** Perfiles fijos de `pnpm shots`. El id entra en el nombre del archivo. */
export const SHOT_PROFILES = [
  { id: "desktop", label: "Escritorio 1280×800", width: 1280, height: 800, mobile: false },
  { id: "iphone", label: "Teléfono 390×844", width: 390, height: 844, mobile: true },
  { id: "tall", label: "Teléfono 412×915", width: 412, height: 915, mobile: true },
  { id: "iphone-land", label: "Teléfono 844×390", width: 844, height: 390, mobile: true },
];

export function shotFileName(prefix, viewpointId, profileId) {
  const stem = `${viewpointId}-${profileId}.png`;
  return prefix ? `${prefix}-${stem}` : stem;
}

export function contactSheetName(prefix) {
  return prefix ? `${prefix}-contact-sheet.png` : "contact-sheet.png";
}

export function selectorRow(prefix) {
  return {
    id: "selector",
    label: "Selector",
    cells: SHOT_PROFILES.map((profile) => ({
      profileId: profile.id,
      file: shotFileName(prefix, "selector", profile.id),
    })),
  };
}

/**
 * @param {{ title: string, columns: { id: string, label: string }[], rows: { id: string, label: string, cells: { profileId: string, file: string }[] }[] }} sheet
 */
export function buildContactSheetHtml(sheet) {
  const head = sheet.columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("");
  const body = sheet.rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => `<td><img src="${escapeAttr(cell.file)}" alt="${escapeAttr(`${row.label} ${cell.profileId}`)}"></td>`)
        .join("");
      return `<tr><th class="label">${escapeHtml(row.label)}</th>${cells}</tr>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(sheet.title)}</title>
  <style>
    body { margin: 0; background: #14182b; color: #f6f1e7; font-family: "Segoe UI", sans-serif; }
    h1 { margin: 16px 16px 8px; font-size: 20px; }
    p { margin: 0 16px 12px; opacity: 0.8; }
    table { border-collapse: collapse; margin: 0 16px 20px; }
    th, td { border: 1px solid #3c4a68; padding: 6px; vertical-align: middle; background: #1a2140; }
    th.label { text-align: left; white-space: nowrap; font-size: 14px; }
    img { display: block; max-height: 220px; max-width: 300px; width: auto; height: auto; background: #0e1224; }
  </style>
</head>
<body>
  <h1>${escapeHtml(sheet.title)}</h1>
  <p>Misma lista de encuadres en escritorio, dos teléfonos en vertical y uno en horizontal.</p>
  <table>
    <thead><tr><th>Encuadre</th>${head}</tr></thead>
    <tbody>
      ${body}
    </tbody>
  </table>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
