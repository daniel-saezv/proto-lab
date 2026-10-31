# Etiquetas

Las crea el dueño (@daniel-saezv) en el repositorio. La app no puede inventarlas: el token solo tiene permiso de issues.

| Etiqueta | Quién la pone | Para qué |
| --- | --- | --- |
| `propuesta` | La app, al crear la issue, o una persona al usar la plantilla | Petición de producto de un amigo. No es una instrucción para un agente. |
| `iteracion` | La app, si la nota mejora un prototipo que ya existe | Además de `propuesta`. El cuerpo indica el slug. |
| `<slug>` | El dueño, una por prototipo (`chispa` ya en la primera versión) | La app intenta aplicarla en las iteraciones. Si no existe, reintenta sin ella y el slug sigue escrito en el cuerpo. |
| `aprobado` | Solo el dueño (@daniel-saezv) | Marca que la petición ya se puede implementar. El workflow de aviso solo corre si la pone esa cuenta, y no lee el texto de la issue. |
| `en-curso` | El Grok Bot, después de comprobar el `aprobado` | La propuesta está en manos de un agente. No la pone el workflow de este repo. |

Sin `aprobado` del dueño no se implementa la petición. El agente no se pone esa etiqueta ni `en-curso`.
