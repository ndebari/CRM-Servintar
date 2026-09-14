# CRM Servintar PWA

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

## Supabase

El esquema inicial esta en `supabase/schema.sql`.
