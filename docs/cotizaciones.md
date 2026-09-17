# Registro de cotizaciones

La versión actual utiliza IndexedDB en el navegador. Conserva clientes y cotizaciones al recargar y migra servintar.quotes.v1 sin borrar la copia anterior. No sincroniza equipos, perfiles ni dominios. Borrar los datos del sitio elimina esta base local.

La numeración se asigna al confirmar la transacción: C-00001 a C-99999. Las revisiones usan C-00001-R-01 y siguientes, con el mismo cliente y raíz. El índice único y la transacción compartida con el contador evitan duplicados entre pestañas del mismo navegador. Una revisión no consume otro número base. Una original pasa a Recotizada al guardar su revisión; cancelar el borrador no cambia la original.

El envío es un registro manual: no envía correos. Guarda una copia del contacto elegido y la fecha. Solamente una cotización enviada puede aprobarse o recotizarse. Las aprobadas aparecen en Lista de precios sin borrarse del historial.

## Base compartida pendiente

supabase/quote-register.sql prepara tablas y acceso limitado a miembros autenticados. No fue ejecutado y el frontend no usa esas tablas todavía. Antes de habilitarlo se requiere acceso de administración al proyecto, autenticación de usuarios, una función transaccional para numerar y guardar, y migración validada de los registros locales. No habilitar acceso anónimo a estos registros comerciales.

## Verificación

Pruebas unitarias: tests/quote-lifecycle.test.mjs. Verificación en navegador sobre un origen local aislado: guardados concurrentes con números distintos, rechazo de aprobación sin envío, selección de contacto, revisión vinculada, aprobación, recuperación de registros al recargar y filtro de Lista de precios.

## Actualización de infraestructura

El esquema completo fue creado en el proyecto Supabase CRM Servintar con supabase/crm-complete.sql. La app aún usa IndexedDB; falta activar el adaptador remoto y Supabase Auth. Ver supabase/README.md para el contrato de conexión. El antiguo quote-register.sql queda como referencia histórica.
