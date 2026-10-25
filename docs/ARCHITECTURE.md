# Arquitectura

```
src/
├─ entrypoints/   Delgados: sólo conectan WXT con features (background, hook, bridge, sidepanel).
├─ core/          Tipos compartidos, hash/ids y almacenamiento (IndexedDB). Sin lógica de negocio.
├─ engines/       Cómputo puro tras la interfaz `Engine`. js/ (hoy) · wasm/ y native/ (enchufes vacíos).
├─ features/      Una carpeta por capacidad: capture, extract, replay, recipes.
├─ sites/         Un adaptador por sitio, en su propia carpeta. Se auto-registra (import.meta.glob).
├─ ui/panel/      Componentes del panel lateral.
└─ platform/      (reservado) diferencias Chrome/Firefox cuando crezcan.
crates/  native/  public/wasm/   Rust/Go: fuera de src, no afectan al build mientras no se usen.
```

## Reglas de dependencia (de arriba a abajo; nunca al revés)
entrypoints → ui, features → engines, sites → core. `core` no importa de nadie. `engines` sólo de `core`.
Lo que necesite DOM o APIs del navegador **no** va en `engines` (por eso `features/extract/dom.ts` y `xml.ts` están fuera).

## Datos estructurados (`features/structured/`)
Cada método de la cascada es un archivo pequeño que devuelve `Entity[]` o `ListResult[]`: `jsonld`, `microdata`, `opengraph`, `repeats` (DOM repetido y tablas), `heuristics`, `embedded` (APIs ya capturadas), `ai` (proveedor inyectado), `feeds` (robots/sitemap/RSS). `analyze.ts` los orquesta (`analyzeDom` en el content script, `cascade` en el panel). Los métodos que usan DOM reciben un `Document`, por eso se prueban con `linkedom` sin navegador.
**Regla de crecimiento:** un sitio nuevo = un JSON en `sites/rules/` o una regla del usuario (`SiteRule`, ver `types.ts`). Solo si una regla no alcanza se escribe un adaptador `.ts`. Añadir un método nuevo = un archivo + una línea en `analyze.ts` y en `DEFAULT_ORDER` (`rules.ts`).

## Cómo crecer sin tocar carpetas
- **Nuevo sitio:** copia `sites/_template` a `sites/<sitio>/`. Cero ediciones en otros archivos.
- **Nueva capacidad:** carpeta nueva en `features/` + una pestaña en `ui/panel`.
- **Más rendimiento:** implementa en Rust/Go sólo los métodos calientes de `Engine` y devuélvelos desde
  `engines/wasm` (o `engines/native`). `initEngine()` los superpone; el resto sigue en JS. Si el cómputo bloquea la UI,
  envuelve la fachada `engine` en un Web Worker: es un único archivo (`engines/index.ts`).
- **Backend propio (sincronizar, cuentas, etc.):** `services/` (Go/Rust) con su cliente en `core/` — no existe aún.
- **Otro navegador/formato de salida:** `platform/` y nuevos exportadores en `features/extract`.
