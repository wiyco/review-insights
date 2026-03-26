/**
 * Computes the median of an unsorted numeric array.
 *
 * For an even number of elements, returns the arithmetic mean of the two middle
 * values. Returns `null` for empty arrays.
 */
export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [
    ...values,
  ].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
