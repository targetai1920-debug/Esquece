# Informe de generación — REEMPLAZAR_NOMBRE_DE_LA_BARBERIA

Generado en: 2026-08-05T21:21:17.468Z
Carpeta: reemplazar-slug/
Modo: estándar

## Datos pendientes de reemplazar
- **business.timezone**: Falta la zona horaria real del negocio (valor actual: "REEMPLAZAR_ZONA_HORARIA").
- **business.currency**: Falta la moneda real del negocio (valor actual: "REEMPLAZAR_MONEDA").
- **business.locale**: Falta el locale real del negocio (valor actual: "REEMPLAZAR_LOCALE").
- **business.name**: El campo "business.name" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_NOMBRE_DE_LA_BARBERIA".
- **business.country**: El campo "business.country" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_PAIS".
- **business.city**: El campo "business.city" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_CIUDAD".
- **business.address**: El campo "business.address" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_DIRECCION".
- **business.phone**: El campo "business.phone" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_TELEFONO".
- **business.email**: El campo "business.email" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_EMAIL".
- **business.instagram**: El campo "business.instagram" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_INSTAGRAM".
- **business.mapsUrl**: El campo "business.mapsUrl" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_MAPS_URL".
- **content.heroTitle**: El campo "content.heroTitle" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_TITULO_PRINCIPAL".
- **content.heroSubtitle**: El campo "content.heroSubtitle" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_SUBTITULO".
- **content.aboutText**: El campo "content.aboutText" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_DESCRIPCION_REAL".
- **content.cancellationPolicy**: El campo "content.cancellationPolicy" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_POLITICA_DE_CANCELACION".
- **branding.styleDescription**: El campo "branding.styleDescription" todavía tiene un valor pendiente de reemplazar: "REEMPLAZAR_DESCRIPCION_DEL_ESTILO".
- **branding.primaryColor**: Falta el color real para "branding.primaryColor" (valor actual: "REEMPLAZAR_COLOR_PRINCIPAL").
- **branding.secondaryColor**: Falta el color real para "branding.secondaryColor" (valor actual: "REEMPLAZAR_COLOR_SECUNDARIO").
- **branding.backgroundColor**: Falta el color real para "branding.backgroundColor" (valor actual: "REEMPLAZAR_COLOR_DE_FONDO").
- **branding.logo**: Falta la ruta real del logo (valor actual: "REEMPLAZAR_RUTA_DEL_LOGO").
- **services[0] (classic-cut)**: El servicio "classic-cut" tiene precio 0 — confirma si es un valor real o un dato pendiente.
- **services[1] (beard-trim)**: El servicio "beard-trim" tiene precio 0 — confirma si es un valor real o un dato pendiente.
- **staff[0] (barber-one)**: Falta el nombre real del trabajador (valor actual: "REEMPLAZAR_NOMBRE_DEL_BARBERO").

## Recursos visuales
- branding.logo: pendiente — todavía es un placeholder (`REEMPLAZAR_*`).

## Escaneo de contaminación
OK — 40 rutas escaneadas, sin hallazgos.

## Módulos opcionales
- publicBookingWebsite: habilitado
- adminDashboard: habilitado
- whatsapp: deshabilitado
- aiAssistant: deshabilitado
- reminders: deshabilitado
- googleCalendar: deshabilitado
- emailNotifications: habilitado
- promotions: habilitado
- faqs: habilitado

## Próximos pasos
1. `npm ci` dentro de la carpeta generada.
2. `npm run lint && npm run typecheck && npm test && npm run build`.
3. Copiar `.env.example` a `.env.local` y completar los valores reales — ver DEPLOYMENT_GUIDE.md.
4. Reemplazar cualquier dato todavía marcado como pendiente arriba.
5. Revisar visualmente `npm run dev` antes de desplegar.
