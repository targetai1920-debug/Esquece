/**
 * In-process mutex emulating a script-level lock (e.g. Apps Script's
 * LockService.getScriptLock()) — serializes every mutating booking
 * operation so two concurrent confirmations can never both pass validation
 * and both write. This is a single-process stand-in; a networked CRM
 * backend would use its own platform lock or a database transaction
 * instead, but the calling contract (acquire → re-validate against fresh
 * data → write → always release) stays identical. See
 * .claude/skills/barbershop-crm-builder/references/security-and-idempotency.md.
 */

let queue: Promise<unknown> = Promise.resolve();

export function withLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const result = queue.then(fn, fn);
  // Swallow rejection for the chain itself (not for the caller's awaited
  // result) so one failed operation doesn't permanently wedge the queue.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
