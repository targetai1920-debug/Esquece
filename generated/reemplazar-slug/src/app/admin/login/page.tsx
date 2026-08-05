"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!body.ok) {
        setError(body.error?.message ?? "No se pudo iniciar sesión.");
        return;
      }
      router.push("/admin");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container">
      <h1>Panel administrativo</h1>
      <form onSubmit={handleSubmit}>
        <input placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        <input placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
        {error && <p role="alert">{error}</p>}
        <button disabled={submitting} type="submit">
          {submitting ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
