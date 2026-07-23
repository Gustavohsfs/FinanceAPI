export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new RangeError('totalCents must be a nonnegative safe integer');
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > 24) {
    throw new RangeError('count must be an integer between 1 and 24');
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_value, index) => base + (index < remainder ? 1 : 0));
}
