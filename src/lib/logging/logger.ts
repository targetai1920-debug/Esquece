/**
 * Minimal structured logger. SECURITY.md: logs never contain access
 * tokens, API keys, signing secrets, or admin passwords/hashes; phone
 * numbers are redacted by default. Deliberately not a heavyweight
 * dependency — this project's log volume doesn't need one yet.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const SECRET_KEY_PATTERN = /token|secret|apikey|api_key|password|authorization/i;

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return "[redacted]";
  if (key.toLowerCase().includes("phone") && typeof value === "string") {
    return value.length > 4 ? "***" + value.slice(-4) : "***";
  }
  return value;
}

function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

export interface LogFields {
  requestId?: string;
  provider?: string;
  operation?: string;
  entityId?: string;
  durationMs?: number;
  status?: string;
  errorCode?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, fields: LogFields = {}, minLevel: LogLevel = "info") {
  if (!shouldLog(level, minLevel)) return;
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...redactFields(fields),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Reads LOG_LEVEL lazily so this module has no import-time env dependency (safe for client-side accidental import, though it shouldn't happen). */
function currentMinLevel(): LogLevel {
  const value = typeof process !== "undefined" ? process.env.LOG_LEVEL : undefined;
  return value === "debug" || value === "warn" || value === "error" ? value : "info";
}

export const logger = {
  debug: (message: string, fields?: LogFields) => log("debug", message, fields, currentMinLevel()),
  info: (message: string, fields?: LogFields) => log("info", message, fields, currentMinLevel()),
  warn: (message: string, fields?: LogFields) => log("warn", message, fields, currentMinLevel()),
  error: (message: string, fields?: LogFields) => log("error", message, fields, currentMinLevel()),
};
