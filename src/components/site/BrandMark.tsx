/**
 * LOGO PLACEHOLDER — Esquece's real mark (crowned smiling face, X eyes) has
 * not been supplied yet. This is a deliberately plain stand-in so the
 * layout has something in the logo's place without inventing the brand's
 * actual artwork. Replace with the official asset once received — see
 * CLIENT_INFORMATION_REQUIRED.md.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border-2 border-current font-black tracking-tight ${className ?? ""}`}
      aria-label="Esquece Barber Studio (logo placeholder)"
    >
      EQ
    </div>
  );
}
