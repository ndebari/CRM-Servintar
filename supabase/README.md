# Supabase · CRM Servintar

## Instalación

Ejecutar **crm-complete.sql** en SQL Editor del proyecto CRM Servintar. Es la instalación unificada actual. No ejecutar schema.sql ni quote-register.sql como alternativa: son esquemas anteriores y no representan el modelo vigente.

El script usa una transacción y puede repetirse. No elimina las tablas antiguas customers, deals, quotes ni quote_items. Conserva las estructuras mensuales de costos. Instala tablas, vistas, índices, RLS y funciones RPC.

| Datos | Objeto |
|---|---|
| Usuarios autorizados | crm_members |
| Tipos de cliente | crm_client_types |
| Clientes con CUIT validado | crm_clients |
| Contactos comercial, operativo y compras | crm_contacts (vista del perfil) |
| Catálogo de adicionales $ / % | crm_additionals |
| Contador global de cotizaciones | crm_numbering |
| Cotizaciones y recotizaciones | crm_quotes |
| Historial de estados, contacto y usuario | crm_quote_events |
| Peajes cotizados con importes y fuentes | crm_quote_tolls (vista del detalle guardado) |
| Adicionales incluidos en cada cotización | crm_quote_additionals (vista del detalle guardado) |
| Lista de precios aprobados | crm_price_list (vista) |
| Rubros y costos mensuales | cost_categories, monthly_cost_structures, monthly_cost_items |

Las vistas evitan duplicar importes y mantienen los datos históricos dentro de la cotización. La baja de clientes conserva las referencias históricas. Los catálogos iniciales se cargan sin reemplazar los valores ya existentes.

## Acceso

Los registros nuevos no son accesibles con la clave pública sin una sesión de Supabase Auth. El administrador debe crear los usuarios de la aplicación en Authentication y agregar los UUID autorizados a crm_members. No confundir la sesión del panel de Supabase con una sesión de usuario del CRM.

Ejemplo para el administrador, reemplazando el UUID por el usuario concreto:

~~~sql
insert into public.crm_members(user_id) values ('UUID-DEL-USUARIO') on conflict do nothing;
~~~

No poner claves service_role ni contraseñas de base de datos en variables VITE_. Las tablas nuevas permiten lectura a miembros; sus escrituras se hacen por RPC validada. Las políticas antiguas de costos se conservan para no cortar la versión publicada: revisar y retirar sus permisos anónimos al activar la autenticación en toda la app.

## Contrato para conectar la app

- crm_read(): devuelve clients, quotes, clientTypes, additionals y schemaVersion.
- crm_save_client(p_client): guarda la ficha; valida CUIT y evita duplicados activos.
- crm_delete_client(p_id): baja lógica; conserva las cotizaciones.
- crm_create_quote(p_quote, p_parent_id): UUID estable por intento, numeración transaccional y estado inicial. El mismo UUID permite reintentar sin duplicar. p_parent_id vincula una recotización.
- crm_transition_quote(p_id, p_action, p_contact_key): send con contacto o approve después del envío.
- crm_save_catalog(p_kind, p_items, p_expected, p_rename): actualiza types o additionals; rechaza cambios si otro usuario modificó el catálogo desde su lectura. Los adicionales con importe todavía no definido devuelven amount: null; normalizarlo a undefined al cargar el modelo de la app.
- crm_save_costs(p_month, p_year, p_lines): guarda cabecera y rubros en una única transacción.

## Activación y datos locales

La aplicación ya incluye el adaptador remoto y la pantalla de acceso. Aplicar crm-cloud-activation.sql antes de publicar esa versión. Configurar el Site URL de Authentication en https://crmsvt.netlify.app/. Autorizar los correos en crm_allowed_emails; crm_claim_access incorpora únicamente usuarios con ese correo confirmado. Después de publicar, aplicar crm-secure-costs.sql para retirar los permisos anónimos antiguos. La importación se ejecuta explícitamente desde ABM y cancela el lote completo ante conflictos. No borrar IndexedDB ni localStorage antes de verificar esa importación. No importar catálogos o registros demo sobre datos productivos.

## Pruebas

verify-crm.sql verifica objetos, funciones y valores iniciales sin mostrar datos comerciales. scripts/test-supabase.mjs ejecuta pruebas sobre PostgreSQL mediante PGlite, fuera del proyecto productivo. Requiere @electric-sql/pglite disponible, o CRM_PGLITE_MODULE apuntando a su módulo.

Administración de usuarios: aplicar `crm-admin-access.sql` después de las migraciones anteriores, con el correo `ndebari@servintar.com.ar` ya confirmado. Ese usuario es el administrador principal; su identidad queda asociada al ID de Auth, sin depender de metadatos editables por el usuario.

El administrador abre **Usuarios** y autoriza el correo antes del registro. Un trigger sobre `auth.users` rechaza la creación de cuentas con correos no autorizados, incluso por llamadas directas a Auth. El nuevo usuario crea su contraseña y confirma su correo. Los usuarios comunes no pueden consultar ni modificar las autorizaciones. Revocar acceso bloquea inmediatamente las consultas y operaciones del CRM; conserva la cuenta de Auth y sus referencias históricas. No se permite revocar al administrador ni cambiar su correo desde Auth.

Validación aislada: `node scripts/test-admin-access.mjs` (requiere PGlite o CRM_PGLITE_MODULE). El SQL se aplica desde el panel con privilegios de propietario; esas credenciales nunca forman parte del frontend. Los operadores con credenciales administrativas de Supabase conservan control de infraestructura.

Visibilidad por cliente: aplicar `crm-client-access.sql` después de `crm-admin-access.sql`. **ABM → Usuarios** permite autorizar un correo, asignar varios clientes con casillas y revocar el acceso. Solo el administrador ve ese ABM. Los usuarios empiezan con cero asignaciones; la administración ve todos los clientes. Los contactos, cotizaciones, revisiones, peajes y listas de precios heredan el acceso del cliente. Las políticas RLS y las entradas RPC aplican el mismo filtro; las implementaciones internas no tienen permisos públicos de ejecución.

Los usuarios pueden trabajar con los clientes asignados. El alta de clientes, la importación local y los cambios de catálogos quedan para el administrador para impedir cambios o importaciones sobre clientes ajenos. Las bajas de usuarios revocan acceso y asignaciones sin borrar las referencias de auditoría. Las pruebas de `test-admin-access.mjs` incluyen aislamiento entre clientes, acceso directo a tablas/vistas y rechazo de reutilización de UUID ajenos. Aplicar las migraciones en orden; no reinstalar el esquema base por encima de las migraciones de permisos.
Proveedores y precios fleteros: ejecutar `crm-suppliers.sql` después del esquema base. Proveedores usa una ficha separada de clientes con CUIT validado, nombre de fantasía, razón social, tipo, estado y contactos comercial/operativo. Elegir tipo Fletero para incluirlo en el selector de tarifas. Una baja conserva el historial.

Precios fleteros guarda versiones inmutables por proveedor con fecha de vigencia, moneda ARS/USD, origen, destino, servicio, unidad, importe y observaciones. Se consulta por mes; si no hubo actualización ese mes se muestra la última lista vigente. Se pueden consultar todas las versiones creadas para un mismo mes. Actualizar crea una versión nueva, nunca sobrescribe listas anteriores. La fecha no puede ser futura ni anterior a la última lista; la primera carga admite una fecha histórica. Guardar valida concurrencia y permite reintentos con el mismo UUID. La lectura y escritura requieren pertenecer al CRM; el frontend no guarda tarifas localmente.

Validación: `scripts/test-supplier-prices.mjs` con PGlite, `tests/supplier-prices.test.mjs`, TypeScript y build. La prueba visual aislada verificó actualización y recuperación de los importes del mes anterior sin crear datos de prueba en producción.

Adicionales referenciales: aplicar crm-additional-references.sql después de crm-client-access.sql. Agrega fechas y auditoría de valores. Guardar los costos del mes actual ajusta únicamente importes fijos por la suma ponderada de valores base asignados por día/km y sus índices. Los porcentajes permanecen iguales y se aplican sobre la tarifa final del transporte. Cada mes conserva su base para evitar aumentos duplicados; correcciones históricas no alteran referencias vigentes. Validar con scripts/test-additional-references.mjs (PGlite).
