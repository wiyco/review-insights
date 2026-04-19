export function readFiniteDenseNumber(
  values: readonly number[],
  index: number,
  label: string,
): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`${label} value at index ${String(index)} is missing`);
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `${label} value at index ${String(index)} must be finite, got ${String(value)}`,
    );
  }
  return value;
}

export function assertFiniteDenseNumbers(
  values: readonly number[],
  label: string,
): void {
  for (let index = 0; index < values.length; index++) {
    readFiniteDenseNumber(values, index, label);
  }
}

export function midpoint(lower: number, upper: number): number {
  const sum = lower + upper;
  if (Number.isFinite(sum)) {
    return sum / 2;
  }
  return lower / 2 + upper / 2;
}

export function interpolateLinear(
  lower: number,
  upper: number,
  fraction: number,
): number {
  return lower * (1 - fraction) + upper * fraction;
}

export function arithmeticMean(
  values: readonly number[],
  label: string,
): number | null {
  if (values.length === 0) return null;

  let maxAbs = 0;
  for (let index = 0; index < values.length; index++) {
    maxAbs = Math.max(
      maxAbs,
      Math.abs(readFiniteDenseNumber(values, index, label)),
    );
  }

  if (maxAbs === 0) return 0;

  let scaledSum = 0;
  for (let index = 0; index < values.length; index++) {
    scaledSum += readFiniteDenseNumber(values, index, label) / maxAbs;
  }

  return (scaledSum / values.length) * maxAbs;
}
