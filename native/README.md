# Host nativo (opcional)
Binario Rust o Go que la extensión usa por **Native Messaging** (`engines/native`). Solo si WASM no basta:
volúmenes de cientos de MB, exportaciones a Parquet/SQLite, acceso a disco o a una BD local.
Carpeta `host-go/` reservada para una implementación en Go. Requiere manifiesto del host + permiso `nativeMessaging`
(se añade entonces, no antes: cada permiso extra encarece la revisión en las tiendas).
