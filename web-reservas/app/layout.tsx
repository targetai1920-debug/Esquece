import type { Metadata } from "next";
import "@fontsource/sedgwick-ave-display/latin.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reservas | Esquece Barber Studio",
  description: "Reserva tu cita en Esquece Barber Studio, Cochabamba.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
