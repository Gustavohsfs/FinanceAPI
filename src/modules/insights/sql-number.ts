export function toSafeInteger(value: unknown): number {
  const normalized =
    typeof value === 'bigint'
      ? Number(value)
      : typeof value === 'string' && /^-?\d+$/.test(value)
        ? Number(value)
        : value;
  if (typeof normalized !== 'number' || !Number.isSafeInteger(normalized)) {
    throw new RangeError('PostgreSQL aggregate exceeded the safe JSON integer range');
  }
  return normalized;
}
