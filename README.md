# CRM Cotizador PWA

Base inicial para un CRM con cotizador integrado, preparado para GitHub, Netlify y Supabase.

## Stack

- React + Vite + TypeScript
- PWA con `vite-plugin-pwa`
- Supabase client listo por variables de entorno
- Deploy en Netlify

## Primer arranque

```bash
npm install
npm run dev
```

Copiar `.env.example` a `.env` y completar:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Deploy

Netlify detecta `netlify.toml`:

- build: `npm run build`
- publish: `dist`


## Peajes y rutas de tránsito pesado

El cotizador crea una fila por cada paso de peaje, con nombre, localidad e importe editable. Las estaciones repetidas en ida/vuelta se cuentan por separado. El total de las filas se suma al costo antes de aplicar el margen y el detalle se incluye en el texto preparado. Al cambiar el recorrido, vehículo o pago se invalida el importe anterior. Una tarifa desconocida queda pendiente, nunca se interpreta como cero.

La configuración confirmada es tractor de tres ejes + araña de tres ejes: seis ejes en total. Confirmar altura total, largo y peso bruto cargado, y elegir TelePASE o efectivo. El recorrido debe incluir todas las paradas; Roundtrip agrega el retorno al origen.

### Activar cálculo automático

1. Obtener una cuenta de TollGuru con acceso al endpoint v2 origin-destination-waypoints y cobertura de camiones/peajes en Argentina.
2. Configurar TOLLGURU_API_KEY en las variables de entorno de Netlify para Functions. No colocar esta clave en variables VITE_, Git ni el navegador.
3. Publicar nuevamente el sitio para desplegar netlify/functions/truck-route.mjs.
4. Validar un trayecto conocido con el vehículo real y la forma de pago. Las pruebas automáticas usan respuestas simuladas; todavía hace falta validar tarifas en vivo con una cuenta habilitada.

Se solicita HERE en modo camión de seis ejes, tractor con un semi y restricciones estrictas, moneda ARS. Se leen los importes por estación según la forma de pago; no se reparte un total estimado entre filas. Los importes desconocidos o en otra moneda quedan vacíos. Si el proveedor no informa la localidad, se solicita completarla; no se utiliza la provincia como si fuera localidad. Sin listado del proveedor no se infiere que el trayecto sea libre de peajes. La carga manual permite agregar estaciones y confirmar el listado completo. Kilómetros y peajes se toman de la misma ruta (la más rápida devuelta). Se rechazan rutas con advertencias, categorías de auto o moneda diferente. El costo corresponde al momento de consulta, no a una fecha futura de servicio. No se sustituye la consulta fallida por rutas de automóvil. La cobertura y las restricciones locales deben verificarse operativamente.

Con Vite solo, las funciones de Netlify no se ejecutan: se permite carga manual y se indica que el cálculo automático no está activo. Para probar la integración completa usar Netlify Dev o un deploy de Netlify con la clave configurada. Las API de Google existentes se conservan solo para autocompletar direcciones.

Pruebas de integración del proveedor (sin consumo de API): node --test tests/*.test.mjs

Documentación del proveedor: https://cdn.tollguru.com/github/toll-api-docs/static-america.html

## Búsqueda de tarifas en publicaciones oficiales

La función official-tolls consulta directamente las publicaciones públicas de AUBASA y AUSOL, sin credenciales de TollGuru ni servicios de búsqueda pagos. La selección utiliza concesionaria, nombre exacto de estación, sentido, pago y horario pico/no pico para seis ejes. El navegador muestra el documento original, categoría y hora de consulta. Los valores manuales nunca se reemplazan.

Cobertura inicial: cuadros publicados de AUBASA (Buenos Aires–La Plata y rutas 2/11/74) y AUSOL Acceso Norte. Otras concesionarias o estaciones no reconocidas quedan pendientes, sin inventar importes. No se trata de un buscador universal ni de OCR automático: las celdas de seis ejes fueron revisadas visualmente el 16/09/2026 y se guardan con la huella SHA-256 de la publicación. Antes de usarlas, el servidor verifica que la página oficial siga enlazando ese documento y que los bytes coincidan. Si cambia el cuadro o no puede consultarse, devuelve importe vacío; un mantenedor debe revisar la nueva publicación antes de agregar su huella y valores. Nunca se usan como respaldo los precios ocultos del CMS ni tarifas antiguas ante un fallo.

Esto resuelve la búsqueda de importes de las estaciones ya identificadas o cargadas. Detectar estaciones sobre una ruta apta para camiones sigue siendo independiente y requiere el proveedor de rutas configurado. El proveedor de rutas ya no aporta los importes: estos se consultan en las publicaciones oficiales. No se deduce que una ruta sea apta para tránsito pesado a partir de un tarifario.

Vite incluye un middleware local para probar official-tolls. En Netlify la misma función se despliega junto con la aplicación. Los datos de respaldo están en netlify/lib/verified-tariffs.json y la validación en netlify/lib/official-publications.mjs. No se aceptan URLs arbitrarias del cliente.


## Estimación de peajes sobre Google Directions (16/09/2026)

Este flujo reemplaza la integración anterior de TollGuru/HERE; ya no se consulta ni requiere su clave. La misma respuesta de Directions aporta kilómetros y la geometría detallada de cada paso. Se compara con un extracto de nodos OpenStreetMap (16/09/2026) en un margen de 65 m. Se agrupan cabinas cercanas y se conservan pasadas posteriores, incluida la vuelta. Es una estimación: puede incluir colectoras o no detectar estaciones faltantes; el usuario debe revisar y confirmar el listado. La localidad, cuando falta, es la población del mapa más cercana hasta 20 km; puede no ser la jurisdicción administrativa. No verifica restricciones de camiones.

El catálogo es una instantánea, no una actualización automática: fuente OSM, licencia ODbL, copia descargable en `/toll-stations.json`. Incluye el rectángulo regional -55,-74,-21,-53, por lo que contiene puntos de países vecinos; solo se muestran los próximos a la ruta recibida. No se envía el recorrido a Overpass. La búsqueda oficial conserva la cobertura limitada AUBASA/AUSOL y deja otras tarifas pendientes.
