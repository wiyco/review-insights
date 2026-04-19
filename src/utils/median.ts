import {
  assertFiniteDenseNumbers,
  midpoint,
  readFiniteDenseNumber,
} from "./statistics";

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
  const lowerIndex = sorted.length % 2 === 0 ? mid - 1 : mid;
  const lower = readFiniteDenseNumber(sorted, lowerIndex, "Median");
  const upper = readFiniteDenseNumber(sorted, mid, "Median");
  assertFiniteDenseNumbers(sorted, "Median");

  return midpoint(lower, upper);
}
