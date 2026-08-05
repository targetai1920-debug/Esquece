#!/usr/bin/env node
// The generator: reads a client configuration (YAML), validates it, and
// produces a new, independent project from templates/barbershop-booking/.
// See docs/OPERATOR_GUIDE.md for the operator-facing walkthrough and
// .claude/skills/barbershop-crm-builder/references/factory-mode-and-client-onboarding.md
// for the design this implements.
//
// Usage:
//   node factory/create-client.mjs --config ./clients/<slug>.yaml --output ./generated/<slug> [--force] [--strict]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateClientConfig, toStrictResult } from "./lib/validateClientConfig.mjs";
import { scanContamination } from "./scan-contamination.mjs";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..");
const TEMPLATE_DIR = path.join(REPO_ROOT, "templates", "barbershop-booking");

function parseArgs(argv) {
  const args = { config: null, output: null, force: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config") args.config = argv[++i];
    else if (argv[i] === "--output") args.output = argv[++i];
    else if (argv[i] === "--force") args.force = true;
    else if (argv[i] === "--strict") args.strict = true;
  }
  return args;
}

const COPY_EXCLUDE = new Set([
  "node_modules",
  ".next",
  ".git",
  "package-lock.json",
  "next-env.d.ts",
  ".env",
  ".env.local",
]);

function copyTemplate(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (COPY_EXCLUDE.has(entry.name)) continue;
    if (entry.name.endsWith(".tsbuildinfo")) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTemplate(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

function copyAssetIfPresent(configDir, relativePath, destDir) {
  if (!relativePath || /^REEMPLAZAR/.test(relativePath.trim())) return { copied: false, reason: "placeholder" };
  const src = path.resolve(configDir, relativePath);
  if (!fs.existsSync(src)) return { copied: false, reason: "not-found" };
  const destName = path.basename(src);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, destName));
  return { copied: true, publicPath: `/${destName}` };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config || !args.output) {
    console.error("Uso: node factory/create-client.mjs --config <ruta.yaml> --output <carpeta-destino> [--force] [--strict]");
    process.exit(1);
  }

  const configPath = path.resolve(args.config);
  if (!fs.existsSync(configPath)) {
    console.error(`No se encontró el archivo de configuración: ${configPath}`);
    process.exit(1);
  }
  const configDir = path.dirname(configPath);
  const raw = parseYaml(fs.readFileSync(configPath, "utf8"));

  let result = validateClientConfig(raw, { assetsBaseDir: configDir, fs });
  if (args.strict) result = toStrictResult(result);

  console.log(`\n=== Validando ${path.relative(REPO_ROOT, configPath)} ===`);
  if (result.warnings.length > 0) {
    console.log(`\n${result.warnings.length} advertencia(s) (datos pendientes, no bloquean la generación):`);
    for (const w of result.warnings) console.log(`  - [${w.path}] ${w.message}`);
  }
  if (!result.ok) {
    console.log(`\n${result.errors.length} error(es) — la generación NO puede continuar:`);
    for (const e of result.errors) console.log(`  - [${e.path}] ${e.message}`);
    process.exit(1);
  }
  console.log("\nConfiguración válida.");

  const outputDir = path.resolve(args.output);
  if (fs.existsSync(outputDir)) {
    if (!args.force) {
      console.error(`\nLa carpeta de salida ya existe: ${outputDir}\nUsa --force para sobrescribirla deliberadamente, o elige otra ruta.`);
      process.exit(1);
    }
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  console.log(`\n=== Copiando la plantilla a ${path.relative(REPO_ROOT, outputDir)} ===`);
  copyTemplate(TEMPLATE_DIR, outputDir);

  // Overwrite the template's own demo config with the real, validated client config.
  fs.writeFileSync(path.join(outputDir, "client-config.json"), JSON.stringify(result.config, null, 2) + "\n");

  // Apply name/slug metadata to package.json.
  const pkgPath = path.join(outputDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.name = result.config.business.slug;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // Copy branding/service/staff assets if they exist next to the config file.
  const assetReport = [];
  const logoResult = copyAssetIfPresent(configDir, result.config.branding.logo, path.join(outputDir, "public"));
  assetReport.push({ field: "branding.logo", ...logoResult });
  for (const service of result.config.services) {
    if (service.image) assetReport.push({ field: `services[${service.id}].image`, ...copyAssetIfPresent(configDir, service.image, path.join(outputDir, "public")) });
  }
  for (const member of result.config.staff) {
    if (member.photo) assetReport.push({ field: `staff[${member.id}].photo`, ...copyAssetIfPresent(configDir, member.photo, path.join(outputDir, "public")) });
  }

  // .env.example is already generic in the template — copy it verbatim (no
  // real values ever generated here; see the "No copies" list in
  // .claude/skills/barbershop-crm-builder/references/factory-mode-and-client-onboarding.md).
  const envExamplePath = path.join(outputDir, ".env.example");
  const envLines = fs.readFileSync(envExamplePath, "utf8").split("\n");
  const patchedEnv = envLines
    .map((line) => (line.startsWith("NEXT_PUBLIC_APP_URL=") ? `NEXT_PUBLIC_APP_URL=https://REEMPLAZAR_DOMINIO_DE_${result.config.business.slug.toUpperCase().replace(/-/g, "_")}` : line))
    .join("\n");
  fs.writeFileSync(envExamplePath, patchedEnv);

  console.log("\n=== Ejecutando escaneo de contaminación ===");
  const scan = scanContamination(outputDir);
  if (!scan.ok) {
    console.log(`\n${scan.findings.length} problema(s) encontrados — revisa antes de continuar:`);
    for (const f of scan.findings) console.log(`  - [${f.kind}] ${f.file}: ${f.detail}`);
  } else {
    console.log(`OK — ${scan.filesScanned} rutas escaneadas, sin rastros de clientes anteriores.`);
  }

  const pendingPlaceholders = [...result.warnings.filter((w) => /pendiente de reemplazar|Falta/.test(w.message))];

  const report = buildGenerationReport({ config: result.config, warnings: result.warnings, assetReport, scan, outputDir, args });
  fs.writeFileSync(path.join(outputDir, "GENERATION_REPORT.md"), report);
  fs.writeFileSync(path.join(outputDir, "DEPLOYMENT_GUIDE.md"), buildDeploymentGuide(result.config));
  fs.writeFileSync(path.join(outputDir, "CREDENTIALS_PENDING.md"), buildCredentialsPending(result.config));
  fs.writeFileSync(path.join(outputDir, "DESIGN_REVIEW_CHECKLIST.md"), buildDesignReviewChecklist(result.config));

  console.log(`\n=== Generación completa: ${outputDir} ===`);
  console.log(`Datos aún pendientes de reemplazar: ${pendingPlaceholders.length}`);
  console.log(`Ver ${path.join(path.relative(REPO_ROOT, outputDir), "GENERATION_REPORT.md")} para el informe completo.`);

  if (!scan.ok) {
    console.error("\nEl escaneo de contaminación encontró problemas — revisa el proyecto generado antes de usarlo.");
    process.exit(1);
  }
}

function buildGenerationReport({ config, warnings, assetReport, scan, outputDir, args }) {
  const lines = [];
  lines.push(`# Informe de generación — ${config.business.name}`);
  lines.push("");
  lines.push(`Generado en: ${new Date().toISOString()}`);
  // Deliberately the folder NAME only, not the absolute filesystem path —
  // an absolute path bakes in whatever directory structure the machine
  // that ran the generator happened to have, which is not meaningful in a
  // deliverable file and can spuriously resemble a leaked identifier.
  lines.push(`Carpeta: ${path.basename(outputDir)}/`);
  lines.push(`Modo: ${args.strict ? "estricto (--strict)" : "estándar"}`);
  lines.push("");
  lines.push("## Datos pendientes de reemplazar");
  if (warnings.length === 0) {
    lines.push("Ninguno — toda la configuración parece completa.");
  } else {
    for (const w of warnings) lines.push(`- **${w.path}**: ${w.message}`);
  }
  lines.push("");
  lines.push("## Recursos visuales");
  for (const a of assetReport) {
    if (a.copied) lines.push(`- ${a.field}: copiado a \`public${a.publicPath}\`.`);
    else if (a.reason === "placeholder") lines.push(`- ${a.field}: pendiente — todavía es un placeholder (\`REEMPLAZAR_*\`).`);
    else lines.push(`- ${a.field}: **no encontrado** en el sistema de archivos junto al archivo de configuración — pendiente.`);
  }
  if (assetReport.length === 0) lines.push("No se referenciaron recursos visuales en la configuración.");
  lines.push("");
  lines.push("## Escaneo de contaminación");
  lines.push(scan.ok ? `OK — ${scan.filesScanned} rutas escaneadas, sin hallazgos.` : `**${scan.findings.length} hallazgo(s)** — revisar antes de usar este proyecto.`);
  for (const f of scan.findings) lines.push(`- [${f.kind}] ${f.file}: ${f.detail}`);
  lines.push("");
  lines.push("## Módulos opcionales");
  for (const [key, value] of Object.entries(config.features)) {
    lines.push(`- ${key}: ${value ? "habilitado" : "deshabilitado"}`);
  }
  lines.push("");
  lines.push("## Próximos pasos");
  lines.push("1. `npm ci` dentro de la carpeta generada.");
  lines.push("2. `npm run lint && npm run typecheck && npm test && npm run build`.");
  lines.push("3. Copiar `.env.example` a `.env.local` y completar los valores reales — ver DEPLOYMENT_GUIDE.md.");
  lines.push("4. Reemplazar cualquier dato todavía marcado como pendiente arriba.");
  lines.push("5. Revisar visualmente `npm run dev` antes de desplegar.");
  lines.push("");
  return lines.join("\n");
}

function buildDeploymentGuide(config) {
  const lines = [];
  lines.push(`# Guía de despliegue — ${config.business.name}`);
  lines.push("");
  lines.push("Orden de operaciones — ver .claude/skills/barbershop-crm-builder/references/deployment-and-operations.md para el detalle completo de cada paso.");
  lines.push("");
  lines.push("1. `npm install` en esta carpeta (primera vez — no existe todavía un lockfile propio; genera `package-lock.json`, que debe commitearse). En instalaciones posteriores, una vez commiteado el lockfile, usar `npm ci`.");
  lines.push("2. `npm run lint && npm run typecheck && npm test && npm run build` — deben pasar todos antes de continuar.");
  lines.push("3. Copiar `.env.example` a `.env.local` y completar los valores reales (ver CREDENTIALS_PENDING.md).");
  lines.push("4. Elegir hosting para la aplicación Next.js (Vercel, Render, u otro compatible).");
  lines.push("5. Configurar el dominio real y actualizar `NEXT_PUBLIC_APP_URL`.");
  lines.push(`6. Confirmar que \`business.timezone\`, \`business.currency\`, \`business.locale\` en \`client-config.json\` sean los valores reales del negocio antes de servir tráfico real (actualmente: ${config.business.timezone} / ${config.business.currency} / ${config.business.locale}).`);
  if (config.features.whatsapp) lines.push("7. Completar la configuración de WhatsApp Cloud API (token, phone number id, app secret, verify token) antes de activar ese canal.");
  if (config.features.aiAssistant) lines.push("8. Completar la configuración del proveedor de IA (API key) antes de activar el asistente.");
  if (config.features.googleCalendar) lines.push("9. Completar la configuración de Google Calendar antes de activar la sincronización.");
  if (config.features.emailNotifications) lines.push("10. Completar la configuración del proveedor de email antes de activar notificaciones.");
  lines.push("");
  lines.push("El CRM de este proyecto es un almacenamiento en memoria (LocalCrmClient), inicializado desde `client-config.json` en cada arranque del proceso — ver README.md del proyecto generado para cuándo conviene reemplazarlo por un backend persistente (hoja de cálculo + script, o una base de datos), siguiendo la interfaz `CrmClient` ya definida en `src/lib/crm/types.ts`.");
  lines.push("");
  return lines.join("\n");
}

function buildCredentialsPending(config) {
  const lines = [];
  lines.push(`# Credenciales pendientes — ${config.business.name}`);
  lines.push("");
  lines.push("Ninguna de estas credenciales fue generada ni configurada automáticamente — ver `.env.example` para los nombres exactos de variable.");
  lines.push("");
  lines.push("## Siempre necesarias");
  lines.push("- `AUTH_SECRET` — valor aleatorio nuevo para firmar sesiones del panel administrativo.");
  lines.push("- `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` — credenciales reales del panel administrativo (generar el hash con el script del proyecto).");
  lines.push("- Dominio y hosting reales de la aplicación.");
  if (config.features.whatsapp) {
    lines.push("");
    lines.push("## WhatsApp (habilitado en este proyecto)");
    lines.push("- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`.");
  }
  if (config.features.aiAssistant) {
    lines.push("");
    lines.push("## Asistente de IA (habilitado en este proyecto)");
    lines.push("- `ANTHROPIC_API_KEY` (o la variable equivalente del proveedor elegido).");
  }
  if (config.features.googleCalendar) {
    lines.push("");
    lines.push("## Google Calendar (habilitado en este proyecto)");
    lines.push("- `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_CREDENTIALS_JSON`.");
  }
  if (config.features.emailNotifications) {
    lines.push("");
    lines.push("## Email (habilitado en este proyecto)");
    lines.push("- `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`.");
  }
  lines.push("");
  lines.push("Los módulos deshabilitados en `client-config.json` (`features`) no requieren ninguna credencial — el proyecto funciona completamente sin ellas.");
  lines.push("");
  return lines.join("\n");
}

function buildDesignReviewChecklist(config) {
  const lines = [];
  lines.push(`# Checklist de revisión de diseño — ${config.business.name}`);
  lines.push("");
  lines.push(`- [ ] Preset visual (\`${config.branding.visualPreset}\`) se ve correcto para esta marca.`);
  lines.push("- [ ] Colores (`primaryColor`/`secondaryColor`/`backgroundColor`) coinciden con la identidad real del negocio.");
  lines.push("- [ ] Logo real cargado (ver GENERATION_REPORT.md — recursos visuales).");
  lines.push("- [ ] Textos de `content` (hero, sobre nosotros, política de cancelación) son los reales, no placeholders.");
  lines.push("- [ ] Servicios, precios y duraciones son correctos.");
  lines.push("- [ ] Personal, fotos y horarios son correctos.");
  lines.push("- [ ] El orden del flujo de reservas (`booking.flowOrder`) es el deseado.");
  lines.push("- [ ] Probado en móvil y escritorio (`npm run dev`).");
  lines.push("- [ ] No quedan datos de ningún cliente anterior (confirmar con `npm run scan-contamination -- --dir <esta-carpeta>`).");
  lines.push("");
  return lines.join("\n");
}

main();
