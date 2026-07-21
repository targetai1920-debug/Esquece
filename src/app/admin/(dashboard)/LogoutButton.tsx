"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function onClick() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }
  return (
    <button onClick={onClick} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
      Cerrar sesión
    </button>
  );
}
