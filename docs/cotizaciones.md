# Registro compartido de cotizaciones

El almacenamiento operativo utiliza Supabase. Clientes, cotizaciones, ABM y costos se leen de la base compartida; las escrituras no vuelven al almacenamiento local si falla la red. La pantalla de ingreso requiere una sesión de Supabase Auth y autorización del CRM.

La numeración global se confirma en crm_create_quote en una transacción que bloquea crm_numbering. C-00001 a C-99999; versiones C-00001-R-01 y siguientes. La original pasa a Recotizada al guardar su revisión. Los reintentos de una creación usan el mismo UUID.

Registrar como enviada guarda un contacto y fecha; no envía correos comerciales. Una cotización enviada puede aprobarse o recotizarse. Lista de precios consulta las aprobadas sin borrar el historial.

## Datos locales anteriores

ABM → Importar datos guardados en este navegador permite revisar cantidades, descargar una copia e importar. La copia local nunca se borra. Debe usarse desde el navegador y dominio donde se cargaron esos datos. Los registros demo se excluyen. Los catálogos existentes en Supabase se conservan; los faltantes se agregan.

La importación preserva números y vínculos; si un número pertenece a otra cotización en Supabase, cancela todo el lote. También cancela si falta un cliente, hay CUIT inválidos o un estado enviado/aprobado carece de su destinatario histórico. No inventa destinatarios. Un mismo lote puede reintentarse sin duplicarse. Los IDs antiguos se convierten de forma determinista a UUID y se conserva legacyId.

## Instalación

1. supabase/crm-complete.sql: esquema y RPC comerciales.
2. supabase/crm-cloud-activation.sql: acceso con correo autorizado y confirmado, importación atómica.
3. Agregar en crm_allowed_emails únicamente los correos autorizados por el administrador.
4. Publicar la aplicación y crear/confirmar cada usuario con su contraseña propia.
5. supabase/crm-secure-costs.sql: retira los accesos anónimos de la versión anterior de costos.

No se deben compartir contraseñas ni usar claves service_role en el frontend. Para revocar un acceso, el administrador elimina su correo de crm_allowed_emails y su UUID de crm_members.

## Pruebas

Los tests de quote-lifecycle, cloud-repository y quote-tolls verifican reglas y adaptador. scripts/test-supabase.mjs y scripts/test-cloud-activation.mjs prueban SQL en una instancia PostgreSQL aislada con PGlite, incluyendo permisos, reintentos, conflictos y rollback.
