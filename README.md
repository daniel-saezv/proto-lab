# Proto Lab

Laboratorio privado de prototipos para un grupo de amigos. La propia app es un mundo 3D pequeño: las máquinas son prototipos y con el Inventor se proponen ideas nuevas o mejoras. Cada prototipo es una web estática que se abre a pantalla completa dentro de la app.

Producción: [https://proto-lab-3k6.pages.dev](https://proto-lab-3k6.pages.dev). Las previews de cada pull request salen en `https://*.proto-lab-3k6.pages.dev`. Los dos hostnames están detrás de Cloudflare Access con PIN de un solo uso.

## Qué hay dentro

Entras al laboratorio, caminas y te acercas a una máquina. Al usarla, el prototipo ocupa la pantalla en un `iframe` con `sandbox="allow-scripts"` (sin navegación de la ventana superior). Volver cierra el juego y regresas al mundo.

El Inventor pregunta, resume y pide confirmación. Al confirmar, una Pages Function crea una issue en este repositorio. El texto del amigo va citado como petición de producto. Solo el dueño (@daniel-saezv) añade la etiqueta `aprobado`. Eso avisa al Grok Bot; el bot comprueba en GitHub que la puso el dueño, marca la issue como `en-curso` y lanza un agente de Cursor. El agente abre un pull request con preview. El merge lo hace el dueño a mano.

## Desarrollo

Hace falta Node 22 y pnpm 10.33.4 (`packageManager` en `package.json`).

```sh
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm build
pnpm preview
```

`pnpm preview` sirve el sitio en `http://127.0.0.1:4173`. `pnpm dev` regenera el catálogo, construye los prototipos y arranca el laboratorio con recarga.

`pnpm test:unit` cubre la validación de propuestas. `pnpm test:e2e` abre el mundo, completa una propuesta con la Function simulada y lanza el prototipo de ejemplo. `pnpm typecheck` comprueba los tipos.

## Añadir un prototipo

Crea `protos/<slug>/` con su `package.json`, su build de Vite (`base` en `/protos/<slug>/`) y un `proto.json`:

- `slug` igual al nombre de la carpeta
- `title`, `description`, `author` (email o alias), `date` (`AAAA-MM-DD`)
- `tags`, `cover` (archivo en la misma carpeta, o `null`)
- `version` y `history` (la versión actual tiene que aparecer en el historial)

`pnpm build` lee esos manifiestos, publica el laboratorio en `/` y cada prototipo en `/protos/<slug>/`. El mundo coloca una máquina por manifiesto. Crea también la etiqueta de GitHub con el slug para que las iteraciones puedan llevarla.

Al jugar desde el laboratorio, la app —que ya pasó Access— descarga el `index.html` y el JS, junta un solo documento y lo abre en un iframe aislado (`sandbox` solo `allow-scripts`, dirección `blob:`). El prototipo no ve las cookies ni el DOM del laboratorio. Si Access devuelve la página del PIN en vez del juego, o el juego no llega a arrancar, se quita el iframe y queda el aviso con Volver: en el iPhone un documento a medias se ve como una pantalla blanca y tapa los botones.

Tiene que ser una página autocontenida. El build de Vite (un JS referenciado por el HTML, y el CSS si lo hay) es el formato esperado. No añadas imágenes, audio, `import()` dinámicos ni `fetch` al propio sitio para que el juego arranque: desde el iframe aislado esas peticiones no llevan la sesión y Access las corta. Abrir `/protos/<slug>/` en una pestaña sigue funcionando, porque ahí la navegación sí lleva la cookie.

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

### Pendiente en el panel

1. **Secreto `GITHUB_TOKEN`.** Token fine-grained de GitHub, solo el repositorio `daniel-saezv/proto-lab`, permiso Issues de lectura y escritura, nada más. Guárdalo cifrado en Pages para producción y para preview si las previews deben poder proponer. No lo pongas en el cliente ni en el repositorio.
2. **KV opcional.** Namespace enlazado con el nombre de variable `PROPOSALS`, en producción y en preview. Con él hay un máximo de 5 propuestas por email y día (UTC). Sin el binding la Function sigue creando issues y no aplica ese límite.
3. **Etiquetas.** `propuesta`, `iteracion`, `aprobado` y `chispa`. El significado está en [`.github/LABELS.md`](.github/LABELS.md). `aprobado` solo la pone el dueño. `en-curso` la pone el Grok Bot cuando ya está trabajando.
4. **Amigos.** Quien deba entrar tiene que poder superar la política de Access (el PIN de un solo uso). El email con el que entren es el que queda escrito en la issue.
5. **Secretos del aviso al Grok Bot**, en el repositorio (Settings → Secrets and variables → Actions), sin pegar los valores en el código ni en las issues:
   - `GROKBOT_WEBHOOK_URL`: la URL del webhook.
   - `GROKBOT_WEBHOOK_AUTH`: el valor completo de la cabecera `Authorization`, tal como lo muestra el panel del Grok Bot. No lleva el prefijo `Bearer` añadido por el workflow.

   Si faltan, el workflow [`.github/workflows/aprobado-webhook.yml`](.github/workflows/aprobado-webhook.yml) no falla: deja un aviso y no envía nada. Solo corre cuando el dueño pone `aprobado`. Una etiqueta puesta por otra cuenta no dispara el aviso.

## Instalar la PWA

Hay que abrir [https://proto-lab-3k6.pages.dev](https://proto-lab-3k6.pages.dev), superar el PIN y, desde esa misma origen, añadirla a la pantalla de inicio. Si se instala otro hostname, Access puede volver a pedir el PIN o no coincidir la sesión.

- **iPhone o iPad:** Safari, compartir, «Añadir a pantalla de inicio».
- **Android:** Chrome, menú, «Instalar aplicación» o «Añadir a pantalla de inicio».

La app cachea la carcasa del laboratorio y los assets del mundo. Los prototipos se piden siempre a la red.

## Siguiente paso

Un tablón, u otro personaje, que muestre el estado de las propuestas leyendo las issues con una Function de solo lectura y el mismo token. No está en esta versión.
