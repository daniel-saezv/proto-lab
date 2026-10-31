# Proto Lab

Laboratorio privado de prototipos para un grupo de amigos. La propia app es un mundo 3D pequeño: las máquinas son prototipos y con el Inventor se proponen ideas nuevas o mejoras. Cada prototipo es una web estática que se abre a pantalla completa dentro de la app.

Producción: [https://proto-lab-3k6.pages.dev](https://proto-lab-3k6.pages.dev). Las previews de cada pull request salen en `https://*.proto-lab-3k6.pages.dev`. Los dos hostnames están detrás de Cloudflare Access con PIN de un solo uso.

## Qué hay dentro

Entras al laboratorio, caminas y te acercas a una máquina. Al usarla, el prototipo ocupa la pantalla en un `iframe` con `sandbox="allow-scripts"` (sin navegación de la ventana superior). Volver cierra el juego y regresas al mundo.

El Inventor pregunta, resume y pide confirmación. Al confirmar, una Pages Function crea una issue en este repositorio. El texto del amigo va citado como petición de producto. Eso avisa al Grok Bot para que el dueño pueda revisarla en el chat. Solo el dueño (@daniel-saezv) añade la etiqueta `aprobado`; entonces el bot comprueba en GitHub que la puso el dueño, marca la issue como `en-curso` y lanza un agente de Cursor. El agente abre un pull request con preview. El merge lo hace el dueño a mano.

## Desarrollo

Hace falta Node 22 y pnpm 12.17.0 (`packageManager` en `package.json`).

```sh
corepack enable
corepack prepare pnpm@12.17.0 --activate
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm build
pnpm preview
```

`pnpm preview` sirve el sitio en `http://127.0.0.1:4173`. `pnpm dev` regenera el catálogo, construye los prototipos y arranca el laboratorio con recarga.

`pnpm test:unit` cubre la validación de propuestas. `pnpm test:e2e` abre el mundo, completa una propuesta con la Function simulada y lanza el prototipo de ejemplo. `pnpm typecheck` comprueba los tipos.

### Commits en pull requests

Convención canónica para agentes y colaboradores: **[`AGENTS.md` — Convenciones para agentes (pull requests)](AGENTS.md#convenciones-para-agentes-pull-requests)** (`[skip ci]` en commits intermedios; el último commit del PR sin marca para CI y preview de Pages).

## Añadir un prototipo

Crea `protos/<slug>/` con su `package.json`, su build de Vite (`base` en `/protos/<slug>/`) y un `proto.json`:

- `slug` igual al nombre de la carpeta
- `title`, `description`, `author` (email o alias), `date` (`AAAA-MM-DD`)
- `tags`, `cover` (archivo en la misma carpeta, o `null`)
- `version` y `history` (la versión actual tiene que aparecer en el historial)
- opcional: `"assets": ["media/foo.png", …]` — rutas relativas declaradas para el puente de recursos privados (límites en [`AGENTS.md`](AGENTS.md))

`pnpm build` lee esos manifiestos, publica el laboratorio en `/` y cada prototipo en `/protos/<slug>/`. El mundo coloca una máquina por manifiesto. Crea también la etiqueta de GitHub con el slug para que las iteraciones puedan llevarla.

Al jugar desde el laboratorio, la app —que ya pasó Access— descarga el `index.html` y el JS, junta un solo documento y lo abre en un iframe aislado (`sandbox` solo `allow-scripts`, dirección `blob:`). El prototipo no ve las cookies ni el DOM del laboratorio. Si Access devuelve la página del PIN en vez del juego, o el juego no llega a arrancar, se quita el iframe y queda el aviso con Volver: en el iPhone un documento a medias se ve como una pantalla blanca y tapa los botones.

Tiene que ser una página autocontenida en el arranque: el build de Vite (un JS referenciado por el HTML, y el CSS si lo hay) es el formato esperado. No uses `import()` dinámicos ni `fetch` al propio sitio para cargar el juego; desde el iframe aislado no llevan la sesión y Access las corta. **Excepción:** binarios listados en `"assets"` del manifiesto se piden al laboratorio con `window.__protoLabAssets` (blob URLs o `ArrayBuffer`); el padre los descarga con la cookie de Access. Límites: 32 rutas, 2 MiB por archivo, 8 MiB total, 64 peticiones por sesión. Abrir `/protos/<slug>/` en una pestaña sigue funcionando con peticiones normales.

## Cloudflare Pages

El proyecto ya está conectado al repositorio. No hace falta cambiar el build:

| Ajuste | Valor |
| --- | --- |
| Rama de producción | `main` |
| Preset | None |
| Comando de build | `pnpm build` |
| Directorio de salida | `dist` |
| `NODE_VERSION` | `22` |

`pnpm build` genera el catálogo, construye el laboratorio y los prototipos, y deja el sitio estático en `dist`. Pages instala las dependencias antes, a partir de `pnpm-lock.yaml`. La Function no va dentro de `dist`: Pages la toma de `functions/` en la raíz del repositorio (`/api/proposals`).

Hostnames:

- Producción: `proto-lab-3k6.pages.dev`
- Previews: `*.proto-lab-3k6.pages.dev`

Access con PIN de un solo uso cubre los dos. La Function lee el email de `Cf-Access-Authenticated-User-Email`. Esa cabecera solo es de fiar porque Access está delante de producción y de las previews; sin eso, cualquiera podría falsificarla. No definas `ALLOW_DEV_AUTH` en Pages: es solo para probar la Function en local.

La app solo se sirve en esos hostnames. `Access-Control-Allow-Origin: *` en `/protos/*` no basta para saltarse Access: sin la cookie, el PIN sigue delante. Por eso el laboratorio incrusta el prototipo en vez de dejar que el iframe lo pida solo.

En Pages, el secreto `GITHUB_TOKEN` (fine-grained, solo Issues de lectura y escritura en este repositorio) y el binding KV `PROPOSALS` (límite de 5 propuestas por email y día UTC) ya están configurados en producción y en preview.

Las etiquetas del flujo de propuestas (`propuesta`, `iteracion`, `aprobado`, `en-curso` y una por slug de prototipo) están creadas en GitHub; su significado y quién las pone está en [`.github/LABELS.md`](.github/LABELS.md). Solo el dueño (@daniel-saezv) añade `aprobado`.

Quien entre a producción o a una preview tiene que superar la política de Access (PIN de un solo uso). El email con el que pasen Access es el que la Function escribe en la issue.

El aviso al Grok Bot usa dos secretos del repositorio (Settings → Secrets and variables → Actions), nunca en el código: `GROKBOT_WEBHOOK_URL` (URL del webhook) y `GROKBOT_WEBHOOK_AUTH` (valor completo de la cabecera `Authorization`, sin prefijo `Bearer` añadido por el workflow). Si faltan, [`.github/workflows/aprobado-webhook.yml`](.github/workflows/aprobado-webhook.yml) no falla: emite un aviso y no envía nada. El workflow corre al abrir una issue y cuando el dueño pone `aprobado`; otras etiquetas o un `aprobado` de otra cuenta no disparan el aviso de aprobación.

## Instalar la PWA

Hay que abrir [https://proto-lab-3k6.pages.dev](https://proto-lab-3k6.pages.dev), superar el PIN y, desde esa misma origen, añadirla a la pantalla de inicio. Si se instala otro hostname, Access puede volver a pedir el PIN o no coincidir la sesión.

- **iPhone o iPad:** Safari, compartir, «Añadir a pantalla de inicio».
- **Android:** Chrome, menú, «Instalar aplicación» o «Añadir a pantalla de inicio».

La app cachea la carcasa del laboratorio y los assets del mundo. Los prototipos se piden siempre a la red.

## Siguiente paso

Un tablón, u otro personaje, que muestre el estado de las propuestas leyendo las issues con una Function de solo lectura y el mismo token. No está en esta versión.
