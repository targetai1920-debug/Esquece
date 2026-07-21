"use client";

import { useEffect } from "react";

/**
 * Root error boundary — catches any otherwise-uncaught render/render-time
 * error in a page under this layout and shows a safe, generic message
 * instead of a raw stack trace or a blank screen (Phase K hardening).
 * The actual error is logged server-side already (route handlers, server
 * components); this only ever needs to log to the browser console here.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Algo salió mal.</h1>
      <p className="text-sm text-neutral-500">Ocurrió un error inesperado. Intenta de nuevo en unos momentos.</p>
      <button onClick={() => reset()} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
        Reintentar
      </button>
    </div>
  );
}
