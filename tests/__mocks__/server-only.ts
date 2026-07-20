// Stub for the "server-only" package under Vitest, which has no Next.js
// compiler pass to make the real package's client/server guard work.
// Real server/client separation is still enforced by Next.js's build for
// actual app code — this only unblocks unit-testing server-only modules
// directly (e.g. env/server.ts) with Vitest.
export {};
