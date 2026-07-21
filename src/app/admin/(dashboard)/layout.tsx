import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/auth/session";
import { LogoutButton } from "./LogoutButton";

const NAV_ITEMS = [
  { href: "/admin", label: "Panel" },
  { href: "/admin/appointments", label: "Citas" },
  { href: "/admin/customers", label: "Clientes" },
  { href: "/admin/services", label: "Servicios" },
  { href: "/admin/barbers", label: "Barberos" },
  { href: "/admin/schedule", label: "Horarios" },
  { href: "/admin/conversations", label: "Conversaciones" },
  { href: "/admin/notifications", label: "Notificaciones" },
  { href: "/admin/config", label: "Configuración" },
];

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const session = token ? await verifyAdminSessionToken(token) : null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-neutral-200 p-4 dark:border-neutral-800">
        <div className="mb-6">
          <p className="text-sm font-semibold">Esquece Admin</p>
          {session && <p className="truncate text-xs text-neutral-500">{session.email}</p>}
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="rounded px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-6">{children}</main>
    </div>
  );
}
