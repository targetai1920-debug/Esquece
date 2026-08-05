import type { VisualPreset } from "../../config/schema";

/**
 * Visual presets change real presentation properties (radii, shadows,
 * spacing scale, button style), not just a label — see
 * .claude/skills/barbershop-crm-builder §"Fase interna 8" and
 * references/architecture-and-decisions.md. Client-supplied colors/fonts
 * always override a preset's own defaults (see tokens.ts).
 */
export interface PresetTokens {
  radius: string;
  buttonRadius: string;
  shadow: string;
  spacingScale: number;
  buttonStyle: "solid" | "outline" | "pill";
  headingFontFallback: string;
  bodyFontFallback: string;
  letterSpacingHeading: string;
}

export const PRESETS: Record<VisualPreset, PresetTokens> = {
  minimal: {
    radius: "2px",
    buttonRadius: "2px",
    shadow: "none",
    spacingScale: 1,
    buttonStyle: "outline",
    headingFontFallback: "system-ui, sans-serif",
    bodyFontFallback: "system-ui, sans-serif",
    letterSpacingHeading: "normal",
  },
  luxury: {
    radius: "0px",
    buttonRadius: "0px",
    shadow: "0 8px 24px rgba(0,0,0,0.35)",
    spacingScale: 1.35,
    buttonStyle: "outline",
    headingFontFallback: "Georgia, 'Times New Roman', serif",
    bodyFontFallback: "Georgia, serif",
    letterSpacingHeading: "0.08em",
  },
  urban: {
    radius: "10px",
    buttonRadius: "999px",
    shadow: "0 4px 14px rgba(0,0,0,0.25)",
    spacingScale: 1.1,
    buttonStyle: "solid",
    headingFontFallback: "'Segoe UI', system-ui, sans-serif",
    bodyFontFallback: "'Segoe UI', system-ui, sans-serif",
    letterSpacingHeading: "0.02em",
  },
  classic: {
    radius: "6px",
    buttonRadius: "6px",
    shadow: "0 2px 8px rgba(0,0,0,0.15)",
    spacingScale: 1,
    buttonStyle: "solid",
    headingFontFallback: "Georgia, 'Times New Roman', serif",
    bodyFontFallback: "system-ui, sans-serif",
    letterSpacingHeading: "normal",
  },
};
