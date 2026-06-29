# MONUR XVIII Staff Chat

Canal de comunicacion en tiempo real estilo Discord para el staff de MONUR XVIII. Incluye chat general, canal de incidentes, avisos y panel de incidentes activos.

## Supabase

1. Crea un proyecto en Supabase.
2. Abre `SQL Editor`.
3. Ejecuta completo el archivo `supabase-schema.sql`.
4. Copia tus datos de `Project Settings > API`:
   - `Project URL`
   - `anon public key`

## Variables de entorno

El archivo `.env` no debe subirse a GitHub. Ya esta protegido por `.gitignore`.

Para desarrollo local, coloca:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

En Vercel coloca las mismas variables en `Settings > Environment Variables`.

## Ejecutar local

```bash
npm install
npm run dev
```

Abre:

```text
http://localhost:5173
```

## Deploy en Vercel

1. Sube el repo a GitHub sin el archivo `.env`.
2. Importa el proyecto en Vercel.
3. Agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy.

Los mensajes e incidentes permanecen en Supabase aunque el usuario salga o cierre la pagina.
