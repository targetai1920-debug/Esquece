# Guía del operador — crear una nueva barbería

Guía breve para una persona del equipo que no necesita entender toda la arquitectura.
Para el detalle técnico completo, ver
[`.claude/skills/barbershop-crm-builder/`](../.claude/skills/barbershop-crm-builder/README.md).

## 1. Qué información pedirle a la barbería

- Nombre del negocio, país, ciudad, zona horaria, moneda, dirección, teléfono, correo,
  Instagram, link de Google Maps.
- Logo, colores de marca (principal, secundario, fondo), un preset visual
  (`minimal` / `luxury` / `urban` / `classic`), descripción breve del estilo.
- Lista de servicios: nombre, descripción, precio, duración en minutos, buffer si aplica.
- Lista de personal: nombre, biografía breve, foto, qué servicios realiza cada uno,
  horario de trabajo por día, descansos.
- Reglas de reserva: anticipación mínima, anticipación máxima, intervalo entre horarios,
  si se permite "cualquier profesional disponible", política de cancelación.
- Textos: título principal, subtítulo, texto "sobre nosotros", política de cancelación.
- Qué módulos opcionales activar: WhatsApp, asistente de IA, recordatorios, Google
  Calendar, notificaciones por email, promociones, FAQs.

Si algo no está disponible todavía, no lo inventes — usa un valor `REEMPLAZAR_*` y sigue
adelante; el generador lo señala como pendiente sin bloquear el resto del trabajo (a menos
que uses `--strict`, pensado para la generación final de producción).

## 2. Cómo llenar la configuración

Copia `clients/reemplazar-slug.yaml` (o cualquier archivo `.yaml` existente en `clients/`)
a un nuevo archivo, por ejemplo `clients/mi-nueva-barberia.yaml`, y reemplaza los valores.
La forma exacta de cada campo está documentada en los comentarios del archivo de ejemplo y
en `templates/barbershop-booking/src/config/schema.ts`.

## 3. Dónde guardar las imágenes

Guarda el logo y las fotos en la misma carpeta que el archivo `.yaml` (o en una subcarpeta,
referenciada con una ruta relativa desde ahí) y apunta `branding.logo`,
`services[].image`, `staff[].photo` a esas rutas relativas. El generador las copia
automáticamente a la carpeta `public/` del proyecto generado si existen; si no existen
todavía, quedan marcadas como pendientes en el informe de generación.

## 4. Qué comando ejecutar

```bash
npm run create-client -- --config ./clients/mi-nueva-barberia.yaml --output ./generated/mi-nueva-barberia
```

Agrega `--strict` si querés que cualquier dato todavía marcado como `REEMPLAZAR_*` bloquee
la generación (útil justo antes de un despliegue real). Agrega `--force` solo si querés
sobrescribir deliberadamente una carpeta de salida que ya existe.

## 5. Cómo previsualizar la página

```bash
cd generated/mi-nueva-barberia
npm install
npm run dev
```

Abrí `http://localhost:3000` para la página pública y `http://localhost:3000/admin/login`
para el panel administrativo (necesita `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`AUTH_SECRET`
configurados en `.env.local` — ver `CREDENTIALS_PENDING.md` en el proyecto generado).

## 6. Cómo interpretar errores

- El generador nunca crea el proyecto si hay **errores** — los lista con el campo exacto y
  una explicación en español (ej. "El trabajador X utiliza el servicio Y, pero ese
  servicio no existe").
- Las **advertencias** (datos todavía pendientes de reemplazar) no bloquean la generación
  en modo normal — se listan igual, y quedan registradas en
  `generated/<slug>/GENERATION_REPORT.md`.

## 7. Cómo ejecutar las pruebas

Dentro del proyecto generado:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Los cuatro deben pasar antes de considerar el proyecto listo para revisión.

## 8. Qué credenciales hacen falta

Ver `generated/<slug>/CREDENTIALS_PENDING.md` — se genera automáticamente según qué
módulos opcionales estén activados en la configuración (WhatsApp, IA, Google Calendar,
email siempre necesitan sus propias credenciales; el panel administrativo siempre necesita
`AUTH_SECRET`/`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`).

## 9. Cómo conectar el CRM

El proyecto generado incluye un CRM en memoria (`LocalCrmClient`), inicializado desde
`client-config.json` — funciona de inmediato para desarrollo y para negocios pequeños en
un solo proceso. Si el negocio necesita persistencia real entre reinicios o mayor volumen,
ver `.claude/skills/barbershop-crm-builder/references/architecture-and-decisions.md` para
decidir entre un backend de hoja de cálculo + script, o una base de datos relacional —
ambos se conectan implementando la misma interfaz `CrmClient` que ya usa todo el proyecto,
sin tocar el resto del código.

## 10. Cómo desplegar

Ver `generated/<slug>/DEPLOYMENT_GUIDE.md`, generado específicamente para ese proyecto
(incluye únicamente los pasos de los módulos que esa barbería activó).

## 11. Cómo comprobar que no quedaron datos de otra barbería

```bash
npm run scan-contamination -- --dir ./generated/mi-nueva-barberia
```

Termina con error si encuentra el nombre, dominio o cualquier otro rastro de un cliente
anterior. Corré esto siempre antes de entregar el proyecto.

## 12. Cómo entregar el proyecto

1. Confirmá que lint/typecheck/test/build pasan.
2. Confirmá que el escaneo de contaminación pasa.
3. Revisá `generated/<slug>/DESIGN_REVIEW_CHECKLIST.md` visualmente (`npm run dev`).
4. Entregá al cliente: la lista de credenciales pendientes (`CREDENTIALS_PENDING.md`) y la
   guía de despliegue (`DEPLOYMENT_GUIDE.md`).
5. El resto del trabajo (obtener credenciales, aprobar diseño, conectar cuentas externas)
   queda del lado del cliente o de la persona con esos accesos — no requiere volver a tocar
   el motor de reservas, el CRM, la seguridad ni las pruebas.
