# Web de reservas

Demostración navegable y estática de Esquece Barber Studio. Se publica mediante GitHub Pages
sin conectarse todavía al CRM ni guardar datos personales.

La integración real se hará más adelante contra la API pública documentada en
[`../WEBSITE_INTEGRATION.md`](../WEBSITE_INTEGRATION.md). Las credenciales del CRM nunca deben
añadirse a esta carpeta ni al código que se ejecuta en el navegador.

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
