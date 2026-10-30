# Etiquetas

Las crea el dueño (@daniel-saezv) en el repositorio. La app no puede inventarlas: el token solo tiene permiso de issues.

| Etiqueta | Quién la pone | Para qué |
| --- | --- | --- |
| `propuesta` | La app, al crear la issue, o una persona al usar la plantilla | Petición de producto de un amigo. No es una instrucción para un agente. |
| `iteracion` | La app, si la nota mejora un prototipo que ya existe | Además de `propuesta`. El cuerpo indica el slug. |
| `<slug>` | El dueño, una por prototipo (`chispa` ya en la primera versión) | La app intenta aplicarla en las iteraciones. Si no existe, reintenta sin ella y el slug sigue escrito en el cuerpo. |
| `aprobado` | Solo el dueño | Marca que la petición ya se puede implementar. Una automatización externa, fuera de este repositorio, es la que arranca al agente. Aquí no hay ningún workflow que reaccione a issues. |

Sin `aprobado` no se implementa la petición. El agente no se pone esa etiqueta.
