/**
 * Brand mark for thermal / print labels: a pure-black copy of
 * public/logo-konveko.png (thermal printers print black only).
 */
export function LabelMark({ className }: { className?: string }) {
  // plain <img>: print pages need the exact file, no optimizer round trip
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-konveko-black.png" alt="" aria-hidden className={className} />;
}
