# Reglas por sitio (datos, no código)

Cada archivo `*.json` de esta carpeta describe cómo extraer un sitio concreto. Se carga solo: no hay que editar ningún `.ts`.
El panel también guarda reglas del usuario (pestaña «Reglas»: crear desde una lista detectada, importar y exportar JSON),
que tienen prioridad sobre las de esta carpeta.

Campos: `id`, `name`, `match.host` (cadena o lista), `match.path` (regex opcional), `status`
(`experimental` | `stable` | `unsupported`), `note`, `prefer`/`disable` (estrategias de la cascada),
`list` (`rowSelector` + `columns`) y `entity` (`type` + `fields`; cada campo prueba `css` → `jsonld` → `meta`, luego `regex` y `transform`).

`"status": "unsupported"` marca un sitio que no se puede extraer; el panel lo muestra con la nota y no intenta nada.
Usa código (`sites/<id>/index.ts`) solo cuando una regla no alcance: un sitio que firma peticiones, por ejemplo.
