# Scrape Lens

Extensión (Chrome/Edge/Brave y Firefox ≥128) que **captura el tráfico de datos de cualquier sitio** —`fetch`, `XHR`, GraphQL, REST, XML, mensajes WebSocket, JSON embebido (`__NEXT_DATA__`, `ld+json`, estado global)— y lo convierte en **tablas exportables (CSV/JSON)**. No depende del DOM de un sitio concreto.

## Instalar
```bash
pnpm install
pnpm build            # Chrome → .output/chrome-mv3
pnpm build:firefox    # Firefox → .output/firefox-mv3
pnpm zip              # paquete .zip
```
- **Chrome/Edge:** `chrome://extensions` → Modo desarrollador → *Cargar descomprimida* → `.output/chrome-mv3`.
- **Firefox:** `about:debugging` → *Este Firefox* → *Cargar complemento temporal* → `.output/firefox-mv3/manifest.json`.
- Desarrollo con recarga: `pnpm dev` / `pnpm dev:firefox`.

## Uso
1. Abre el sitio y **recárgalo** (la captura se engancha en `document_start`). Haz clic en el icono: se abre el panel lateral.
2. **Capturas:** lista por pestaña; filtra por texto (URL/contenido), formato (json/graphql/xml/html/text) y origen. «Escanear datos embebidos» lee JSON incrustado.
3. **Detalle:** árbol JSON navegable. Clic en un nodo → su ruta; en un array → «usar como colección». «Copiar cURL» reproduce la petición.
4. **Extraer:** detecta automáticamente colecciones candidatas (arrays de objetos y mapas por clave), sugiere columnas, permite editarlas (clave aplanada `user.name` o ruta `items[*].tag`) y exporta CSV/JSON. Para HTML: selector de fila + columnas `nombre=selector@atributo`, sobre la captura o sobre el DOM en vivo.
5. **Paginar con replay:** repite la petición capturada *desde la página* (con tus cookies) cambiando un parámetro de URL, un campo del body JSON (`variables.page`) o siguiendo un cursor (`data.pageInfo.endCursor`). Con pausa configurable y límite de páginas.
6. **Recetas:** guarda ruta + columnas por sitio y vuélvelas a aplicar.

## Pestaña «Página»: datos estructurados de cualquier sitio
**Analizar página** prueba varios métodos en cascada (del más fiable al menos) y se queda con el primero que devuelve datos; los demás quedan visibles como botones para comparar:

1. **Regla del sitio** (JSON, ver abajo) → 2. **JSON-LD** (schema.org: Product, Article…) → 3. **Microdata / RDFa** → 4. **OpenGraph** → 5. **APIs internas** ya capturadas → 6. **Patrones repetidos del DOM** (tarjetas, listas, tablas) → 7. **Heurísticas** (artículo, precio) → 8. **IA** (manual, último recurso).

Tipos de contexto (Organization, BreadcrumbList, contacto…) se muestran con «incluir contexto» pero no detienen la cascada. **Mapear sitio** lee `robots.txt` y los sitemaps (con índices) y exporta las URLs; los feeds RSS/Atom se descargan en CSV.

**Un sitio nuevo no es un archivo `.ts`.** Es una regla JSON (selectores y rutas): «Guardar como regla» convierte una lista detectada en regla del sitio; también se importan/exportan desde «Reglas», o se dejan como archivos en `src/sites/rules/*.json` (ver su README). Cada regla lleva un estado `experimental | stable | unsupported`: `unsupported` marca un sitio que no se soporta y el panel lo explica en vez de fallar. El código por sitio (`sites/<id>/index.ts`) queda solo para lo que una regla no pueda expresar.

**IA:** envía el HTML limpio al proveedor que configures (API tipo `/chat/completions`) y valida el resultado contra tu esquema. La clave queda en el navegador; el contenido de la página sale hacia ese proveedor.

## Sintaxis de rutas
`a.b`, `a[0]`, `a[*]`, `a["clave rara"]`, `$.a.b`. Sobre un array, `items.id` mapea implícitamente.

## Privacidad y límites
- Todo se guarda **localmente** (IndexedDB); nada sale de tu equipo.
- Las cabeceras `Authorization`/`Cookie` **no se almacenan**; el replay usa las cookies de la página, así que sitios que exigen un token Bearer propio pueden requerir ajustes.
- Cuerpos binarios no se capturan; cuerpos >2 MB se truncan; máximo 300 capturas por pestaña (se borran las más antiguas).
- Botón «Grabando/Pausado» para detener la captura. Respeta los términos de uso y el robots/ToS de cada sitio.

> Estructura y reglas para crecer: ver `docs/ARCHITECTURE.md`.

## Pruebas
`pnpm test` (clasificación, rutas, extracción, CSV, replay) · `pnpm compile` (tipos).
