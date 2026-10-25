//! Esqueleto del motor en Rust. Debe cumplir el contrato de src/engines/types.ts:
//! entradas/salidas como JSON (string) para cruzar la frontera WASM de forma simple.
//! Empieza por lo caliente: find_candidates, build_rows, to_csv. Sin probar todavía.
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
