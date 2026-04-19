export function requiredAt<T>(
  items: readonly T[],
  index: number,
  label: string,
): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Missing ${label} at index ${index}`);
  }
  return item;
}
