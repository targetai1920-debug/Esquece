# Credenciales pendientes — REEMPLAZAR_NOMBRE_DE_LA_BARBERIA

Ninguna de estas credenciales fue generada ni configurada automáticamente — ver `.env.example` para los nombres exactos de variable.

## Siempre necesarias
- `AUTH_SECRET` — valor aleatorio nuevo para firmar sesiones del panel administrativo.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` — credenciales reales del panel administrativo (generar el hash con el script del proyecto).
- Dominio y hosting reales de la aplicación.

## Email (habilitado en este proyecto)
- `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`.

Los módulos deshabilitados en `client-config.json` (`features`) no requieren ninguna credencial — el proyecto funciona completamente sin ellas.
