import type { PartialDataReason } from "../types";

export const PAGINATION_TIME_LIMIT_MINUTES = 10;

export function getDataCompletenessLabel(partialData: boolean): string {
  return partialData ? "Partial" : "Complete";
}

export function getPartialDataWarning(
  reason: PartialDataReason | null,
): string | null {
  switch (reason) {
    case "pagination-time-limit":
      return (
        "Analysis is based on partial PR data. " +
        `Pagination reached the ${PAGINATION_TIME_LIMIT_MINUTES}-minute collection budget, ` +
        "so counts and derived metrics may be understated."
      );
    case "pagination-delay-budget-exceeded":
      return (
        "Analysis is based on partial PR data. " +
        `Pagination stopped before a required rate-limit delay would exceed the remaining ${PAGINATION_TIME_LIMIT_MINUTES}-minute collection budget, ` +
        "so counts and derived metrics may be understated."
      );
    default:
      return null;
  }
}
