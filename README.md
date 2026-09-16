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
