# Guía de despliegue — REEMPLAZAR_NOMBRE_DE_LA_BARBERIA

Orden de operaciones — ver .claude/skills/barbershop-crm-builder/references/deployment-and-operations.md para el detalle completo de cada paso.

1. `npm install` en esta carpeta (primera vez — no existe todavía un lockfile propio; genera `package-lock.json`, que debe commitearse). En instalaciones posteriores, una vez commiteado el lockfile, usar `npm ci`.
2. `npm run lint && npm run typecheck && npm test && npm run build` — deben pasar todos antes de continuar.
3. Copiar `.env.example` a `.env.local` y completar los valores reales (ver CREDENTIALS_PENDING.md).
4. Elegir hosting para la aplicación Next.js (Vercel, Render, u otro compatible).
5. Configurar el dominio real y actualizar `NEXT_PUBLIC_APP_URL`.
6. Confirmar que `business.timezone`, `business.currency`, `business.locale` en `client-config.json` sean los valores reales del negocio antes de servir tráfico real (actualmente: REEMPLAZAR_ZONA_HORARIA / REEMPLAZAR_MONEDA / REEMPLAZAR_LOCALE).
10. Completar la configuración del proveedor de email antes de activar notificaciones.

El CRM de este proyecto es un almacenamiento en memoria (LocalCrmClient), inicializado desde `client-config.json` en cada arranque del proceso — ver README.md del proyecto generado para cuándo conviene reemplazarlo por un backend persistente (hoja de cálculo + script, o una base de datos), siguiendo la interfaz `CrmClient` ya definida en `src/lib/crm/types.ts`.
