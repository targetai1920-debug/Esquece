"use client";

import { useEffect } from "react";

/**
 * Catches an error in the root layout itself (rare — error.tsx handles
 * everything else). Must render its own <html>/<body> since the real
 * layout is what failed.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center", fontFamily: "sans-serif" }}>
        <h1>Algo salió mal.</h1>
        <p>Ocurrió un error inesperado. Intenta de nuevo en unos momentos.</p>
        <button onClick={() => reset()}>Reintentar</button>
      </body>
    </html>
  );
}
