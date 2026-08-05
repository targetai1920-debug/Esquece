import type { Metadata } from "next";
import "./globals.css";
import { loadClientConfig } from "@/config/loadConfig";
import { buildThemeCssVariables, themeCssVariablesToCss } from "@/lib/branding/tokens";

export function generateMetadata(): Metadata {
  const config = loadClientConfig();
  return {
    title: config.business.name,
    description: config.content.heroSubtitle || config.content.heroTitle,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const config = loadClientConfig();
  // The visual preset + client-supplied colors/fonts are applied here, at
  // render time, straight from client-config.json — no separate "compile
  // the theme" generation step, so a preset change is visible immediately.
  // See .claude/skills/barbershop-crm-builder §"Fase interna 8".
  const themeCss = themeCssVariablesToCss(buildThemeCssVariables(config));
  return (
    <html lang={config.business.locale.split("-")[0] || "es"}>
      <head>
        <style id="theme-tokens" dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
