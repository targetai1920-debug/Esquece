# Checklist de revisión de diseño — REEMPLAZAR_NOMBRE_DE_LA_BARBERIA

- [ ] Preset visual (`urban`) se ve correcto para esta marca.
- [ ] Colores (`primaryColor`/`secondaryColor`/`backgroundColor`) coinciden con la identidad real del negocio.
- [ ] Logo real cargado (ver GENERATION_REPORT.md — recursos visuales).
- [ ] Textos de `content` (hero, sobre nosotros, política de cancelación) son los reales, no placeholders.
- [ ] Servicios, precios y duraciones son correctos.
- [ ] Personal, fotos y horarios son correctos.
- [ ] El orden del flujo de reservas (`booking.flowOrder`) es el deseado.
- [ ] Probado en móvil y escritorio (`npm run dev`).
- [ ] No quedan datos de ningún cliente anterior (confirmar con `npm run scan-contamination -- --dir <esta-carpeta>`).
