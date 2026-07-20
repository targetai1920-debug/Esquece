import type { NextRequest } from "next/server";

/**
 * In-memory, fixed-window rate limiter. SECURITY.md: "MVP implementation
 * is an in-memory provider abstraction (documented as not
 * multi-instance-safe); a stronger external provider can be swapped in
 * later without changing call sites." This module IS that abstraction —
 * callers use `checkRateLimit(key, config)`, not the Map directly, so
 * swapping in e.g. a Redis-backed implementation later only touches this
 * one file.
 *
 * Not safe across multiple server instances/processes (each has its own
 * in-memory counters) — fine for a single Render Web Service instance at
 * Esquece's scale, explicitly not fine if this app ever runs
 * horizontally scaled without a shared store.
 */

interface WindowState {
  count: number;
  windowStartMs: number;
}

const buckets = new Map<string, WindowState>();

export interface RateLimitConfig {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStartMs >= config.windowMs) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return { allowed: true, remaining: config.limit - 1, resetAtMs: now + config.windowMs };
  }

  if (existing.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAtMs: existing.windowStartMs + config.windowMs };
  }

  existing.count += 1;
  return { allowed: true, remaining: config.limit - existing.count, resetAtMs: existing.windowStartMs + config.windowMs };
}

/** Best-effort client IP from standard proxy headers (Render sits behind a proxy). */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export const RATE_LIMITS = {
  /** Public reads: settings/services/barbers/faqs/promotions. */
  read: { limit: 120, windowMs: 60_000 } satisfies RateLimitConfig,
  /** Availability queries — more expensive than a flat read, still frequent during normal use. */
  availability: { limit: 60, windowMs: 60_000 } satisfies RateLimitConfig,
  /** Appointment mutations — create/cancel/reschedule. */
  mutation: { limit: 20, windowMs: 60_000 } satisfies RateLimitConfig,
};

/** Test-only: clears all counters between test cases. */
export function _resetRateLimitsForTests() {
  buckets.clear();
}
