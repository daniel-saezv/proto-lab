# Tecnologías que no están activas

Decisión del 3 de noviembre de 2026, actualizada cuando el taller del Inventor pasó a usar Workers AI y, el 6 de noviembre de 2026, cuando la sala en vivo pasó a un Durable Object. R2 e Images siguen apagados. La cuenta sigue en Workers Free. Una aplicación no declara ni llama a ninguno de estos productos: el Durable Object es solo del laboratorio.

Un agente que implementa una aplicación no edita `functions/` ni `wrangler.toml`. El taller es parte del laboratorio, no de un `protos/<slug>/`.

## Workers AI

Activo solo para el taller del Inventor (`POST /api/workshop`). El binding se llama `AI` y está en `wrangler.toml` (producción y preview: `ai` no se hereda). No hay capability `ai` en `scripts/app-contract.mjs`: una aplicación no puede pedir el modelo.

- Modelo: `@cf/meta/llama-3.1-8b-instruct-fp8-fast` (4119 neuronas por millón de tokens de entrada y 34868 de salida, tabla de precios del 20 de octubre de 2026). La ficha del modelo responde que no está disponible; el id que se factura sigue siendo ese. El modo JSON de Workers AI devuelve `response` ya como objeto. Ese id no está en la lista de modelos con modo JSON: si el texto no se puede leer, hay un solo reintento, sin `response_format` y con la orden de contestar solo el objeto. El reintento reserva otras neuronas. El log es el tipo de error o la forma del payload (claves y tipo de `response`), nunca la nota ni el correo.
- La Function identifica a la persona con el JWT de Cloudflare Access. El navegador no elige el modelo ni reenvía la conversación. La nota del amigo entra como dato, no como orden.
- No hay cupo por persona. El único tope, aparte del de propuestas, es 8000 neuronas globales al día. Si se llena, la respuesta lleva `restore` y el laboratorio vuelve a enseñar la nota tal como la escribió el amigo. La sesión vive en KV como mucho 15 minutos.
- Una sentada son tres rondas y un cierre. Cada ronda pide exactamente cuatro ideas cortas, en forma de pregunta. El amigo marca las que quiere (una, varias o ninguna). La llamada lleva la nota original, las ideas ya elegidas y las descartadas, y no debe repetirlas. Esas listas se cortan a 6000 caracteres, por lo más viejo, y la reserva de neuronas se recalcula con el tamaño de ese mensaje. Al final, otra llamada integra solo lo elegido en el título y el texto: si no eligió nada, la nota sale como estaba. Se borra al terminar o al abandonar. No hay historial durable. El issue lleva solo el título y el texto finales.
- Workers Free incluye 10 000 neuronas al día. Al pasarlas, la llamada falla y no cobra ([precios de Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/), página con fecha 20 de octubre de 2026). Workers Paid factura 0,011 USD por cada 1 000 neuronas por encima de 10 000. No se añade un método de pago ni crédito prepago de AI Gateway. El tope del taller (8000) queda por debajo del diario gratuito.
- Modelos que exigen plan de pago, y que no se usan: `@cf/moonshotai/kimi-k2.6`, `kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `glm-5.3`, `glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, `deepseek-v4.1-flash-1017`, `deepseek-v4-pro-0813`. El aviso de que algunos modelos pasan a exigir plan de pago está en el [changelog del 28 de julio de 2026](https://developers.cloudflare.com/changelog/post/2026-07-28-workers-ai-models/).
- Cada llamada también gasta una petición de Worker. El plan Free son 100 000 peticiones al día y 10 ms de CPU. La espera de una subpetición (fetch, KV o el binding de Workers AI) no cuenta como CPU: el CPU es el tiempo en que el worker ejecuta código ([límites de Workers](https://developers.cloudflare.com/workers/platform/limits/)). Una inferencia de segundos se factura por el CPU de preparar la llamada, no por la espera ([Workers pricing: scale to zero](https://blog.cloudflare.com/workers-pricing-scale-to-zero/)).

Si el panel de Pages no muestra el binding tras el merge: Workers & Pages → proto-lab → Settings → Bindings → Add → Workers AI, variable `AI`, en Production y en Preview, y volver a desplegar.

## R2

No hay bucket. Entraría solo si un archivo no cabe en los 25 MiB de Pages ni después de Brotli. El plan Standard gratuito da 10 GB-mes, 1 millón de operaciones de clase A y 10 millones de clase B, con salida gratis. Infrequent Access no tiene capa gratuita ([precios de R2](https://developers.cloudflare.com/r2/pricing/), 30 de octubre de 2026).

Si se activa: dos buckets (producción y preview), un token que el agente no ve, y un job que solo corre en push a `main`. No desde el pull request.

## Durable Objects

Activo solo para la sala del laboratorio (`workers/presence`, clase `LabPresence`, backend SQLite). Las personas conectadas a la vez comparten pose por WebSocket con hibernación; el alias opcional va solo en el adjunto del WebSocket y en los mensajes `hello` / `welcome` / `join` / `rename`, no en D1 ni KV. El dato de una aplicación sigue en D1. Una aplicación no declara ni llama a este producto.

Pages no puede publicar la clase ([bindings de Pages](https://developers.cloudflare.com/pages/functions/bindings/), 2026). La Function `GET /api/presence` reenvía el upgrade al binding `PRESENCE` si existe. Sin ese binding responde 503 y el laboratorio sigue en solitario. El binding está comentado en `wrangler.toml` hasta que el Worker exista en la cuenta: si el script no está, el despliegue de Pages falla. El script `proto-lab-presence` puede publicarse desde GitHub Actions (`.github/workflows/deploy-presence-worker.yml`, secretos `CLOUDFLARE_WORKER_DEPLOY_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`; ver `AGENTS.md`). El Worker no tiene URL pública (`workers_dev = false`).

El plan Free da 100 000 peticiones al día y 13 000 GB-s al día, solo con backend SQLite. Al pasarse, falla y no cobra. La hibernación no factura la duración; `setTimeout` y `setInterval` impiden hibernar ([precios](https://developers.cloudflare.com/durable-objects/platform/pricing/), 18 de octubre de 2026; [hibernación](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)). Cada conexión cuenta una petición. Los mensajes entrantes se facturan 20 a 1; los salientes no. El tope de conexiones hibernables por objeto es 32 768. La sala admite 24 y manda la pose como mucho a 5 Hz, solo mientras alguien se mueve.

Por qué no los otros caminos del plan Free, con una quedada realista (12 personas, 3 horas, la mitad del tiempo en movimiento):

- WebSocket en un Worker sin Durable Object: no hay un punto único para repartir la pose ([WebSockets](https://developers.cloudflare.com/workers/runtime-apis/websockets/)).
- Sondeo o SSE contra D1: 12 × 5 Hz × 3 h son unas 648 000 peticiones de Worker y otras tantas filas escritas. El Free son 100 000 peticiones al día (toda la cuenta) y 100 000 filas escritas al día. Se sale en minutos y, al fallar, también caen propuestas, taller y datos compartidos.
- KV: 1 000 escrituras al día ([precios](https://developers.cloudflare.com/kv/platform/pricing/), 30 de octubre de 2026). No da para poses.
- Queues: 10 000 operaciones al día y hacen falta tres por mensaje ([precios](https://developers.cloudflare.com/queues/platform/pricing/), 30 de octubre de 2026). No entrega al navegador.
- PartyKit alojado se apagó el 23 de octubre de 2026. PartyServer es este mismo Durable Object más una dependencia.
- R2, Images, Workers AI y Realtime no reparten poses. R2 e Images no se activan.

La misma quedada en el Durable Object, a 5 Hz y con hibernación, son unas 16 000 peticiones facturadas (324 000 mensajes ÷ 20) y unas 1 400 GB-s (3 h × 128 MB). Cabe en 100 000 y en 13 000. Una pestaña quieta no suma duración. El upgrade sí gasta una petición de Worker, no cada pose.

## Images

No hay Cloudflare Images. El plan Free transforma 5 000 imágenes únicas al mes y después responde el error 9422, sin cobrar. El almacenamiento es de pago ([precios de Images](https://developers.cloudflare.com/images/pricing/), 19 de octubre de 2026). Las imágenes de una aplicación se quedan en el prototipo y pasan por el puente, con el tope de 1,5 MiB del build.

## Lo que sí está

D1, binding `DB`, en el plan Free: 5 millones de filas leídas al día, 100 000 escritas, 5 GB en la cuenta y 500 MB por base. Al pasarse, falla y no cobra ([precios de D1](https://developers.cloudflare.com/d1/platform/pricing/)). El contrato de tablas está en [`docs/contrato-tablas.md`](contrato-tablas.md). `wrangler d1 execute … --local` no necesita token; el remoto sí, y el agente no lo tiene. El validador `scripts/table-sql.mjs` basta para escribir migraciones.
