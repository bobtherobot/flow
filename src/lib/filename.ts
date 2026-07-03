function withDot(ext: string): string {
  return ext.startsWith(".") ? ext : `.${ext}`;
}

/** Returns `name` guaranteed to end with `.ext`, without duplicating it. */
export function ensureExtension(name: string, ext: string): string {
  const clean = name.trim();
  const dotExt = withDot(ext);
  return clean.toLowerCase().endsWith(dotExt.toLowerCase())
    ? clean
    : `${clean}${dotExt}`;
}

/** Removes a trailing `.ext` from `name` if present (case-insensitive). */
export function stripExtension(name: string, ext: string): string {
  const dotExt = withDot(ext);
  return name.toLowerCase().endsWith(dotExt.toLowerCase())
    ? name.slice(0, -dotExt.length)
    : name;
}
