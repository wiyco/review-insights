import type { PartialDataReason } from "../types";

export const PAGINATION_TIME_LIMIT_MINUTES = 10;

export function getDataCompletenessLabel(
  partialData: boolean,
  reason: PartialDataReason | null,
): string {
  if (!partialData) {
    return "Complete";
  }

  return reason === "max-prs-limit-reached" ? "Capped" : "Partial";
}

export function getPartialDataWarning(
  reason: PartialDataReason | null,
): string | null {
  switch (reason) {
    case "max-prs-limit-reached":
      return (
        "Analysis is based on a capped PR dataset. " +
        "Pagination found additional PRs within the requested date range after reaching the configured max-prs limit, " +
        "so counts and derived metrics reflect only the newest PRs collected in createdAt-descending order."
      );
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
