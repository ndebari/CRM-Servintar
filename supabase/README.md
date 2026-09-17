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
