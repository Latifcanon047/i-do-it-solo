/**
 * Validasi callbackUrl dari query param/body request eksternal.
 * Cuma izinin path relatif yang mulai dengan "/" tunggal (bukan "//",
 * biar gak jadi protocol-relative URL ke luar domain). Selain itu, invalid.
 */
export function sanitizeCallbackUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (!url.startsWith("/") || url.startsWith("//")) return null;
  return url;
}
