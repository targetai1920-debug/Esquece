import { PRESETS } from "./presets";
import type { ClientConfig } from "../../config/schema";

/** Produces the CSS custom properties a generated project's globals.css consumes. */
export function buildThemeCssVariables(config: ClientConfig): Record<string, string> {
  const preset = PRESETS[config.branding.visualPreset];
  return {
    "--color-primary": config.branding.primaryColor,
    "--color-secondary": config.branding.secondaryColor,
    "--color-background": config.branding.backgroundColor,
    "--radius": preset.radius,
    "--button-radius": preset.buttonRadius,
    "--shadow": preset.shadow,
    "--spacing-unit": `${8 * preset.spacingScale}px`,
    "--font-heading": config.branding.headingFont || preset.headingFontFallback,
    "--font-body": config.branding.bodyFont || preset.bodyFontFallback,
    "--letter-spacing-heading": preset.letterSpacingHeading,
    "--button-style": preset.buttonStyle,
  };
}

export function themeCssVariablesToCss(vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}
