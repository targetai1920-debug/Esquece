# Web de reservas

Página estática de reservas de Esquece Barber Studio, publicada mediante GitHub Pages. Se
compila con `next build` (`output: "export"`) y todo el código corre en el navegador del
cliente.

## Qué API consume

Esta página consume exclusivamente la API pública de este mismo repositorio (el backend
Next.js desplegado en Render), documentada en
[`../WEBSITE_INTEGRATION.md`](../WEBSITE_INTEGRATION.md):

- `GET /api/public/settings`
- `GET /api/public/services`
- `GET /api/public/barbers` y `GET /api/public/barbers?serviceId={id}`
- `POST /api/public/availability`
- `POST /api/public/availability/validate`
- `POST /api/public/appointments`

Toda la comunicación HTTP vive en [`lib/api.ts`](lib/api.ts), que valida el envelope
`{ ok, data, error }` de cada respuesta y expone tipos TypeScript (`Service`, `Barber`,
`BusinessSettings`, `AvailableSlot`, `Appointment`) alineados con esas respuestas reales.

**Esta página nunca accede directamente a Google Apps Script ni a Google Sheets.** No conoce
`CRM_API_KEY` ni `CRM_SIGNING_SECRET` — esos secretos solo existen en el servidor de Render.
Google Sheets sigue siendo la única fuente de verdad; esta web solo lee y escribe a través de
la API pública del backend, igual que WhatsApp y el panel administrativo.

## Variable de entorno

`NEXT_PUBLIC_API_BASE_URL` — URL base de la API pública (sin barra final), por ejemplo
`https://esquece.onrender.com`. Es una variable pública de Next.js: se incrusta en el bundle
en tiempo de compilación, no en tiempo de ejecución, y no debe contener secretos.

En desarrollo local, si no se define, cae por defecto a `https://esquece.onrender.com`. En la
compilación de GitHub Pages (`.github/workflows/pages.yml`), se fija explícitamente a ese
mismo valor.

## Desarrollo local

```bash
npm install
npm run dev
```

## Compilación estática

```bash
npm run build
```

El resultado se genera en `out/` y la automatización de GitHub Pages lo publica.

## Configuración pendiente en Render

Para que las peticiones desde GitHub Pages no sean rechazadas por CORS/validación de origen,
el backend de Render debe tener configurado:

```
PUBLIC_WEBSITE_ORIGIN=https://targetai1920-debug.github.io
```

Esto es un cambio de configuración en Render, no de código — no se modifica desde este
repositorio de forma automática.
