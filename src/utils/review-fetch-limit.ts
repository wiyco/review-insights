import type { PullRequestRecord } from "../types";

/**
 * Returns a user-facing warning when one or more already-filtered PRs have
 * truncated review data beyond the first per-PR GraphQL page. Callers are
 * responsible for applying any author/bot filtering before passing records
 * here.
 */
export function getReviewFetchLimitWarning(
  pullRequests: PullRequestRecord[],
): string | null {
  const truncatedPRs = pullRequests.filter((pr) => pr.reviewLimitReached);
  if (truncatedPRs.length === 0) {
    return null;
  }

  const prList = truncatedPRs
    .slice(0, 10)
    .map((pr) => `#${pr.number}`)
    .join(", ");
  const listSuffix = truncatedPRs.length > 10 ? ", ..." : "";

  return `${truncatedPRs.length} PR(s) hit the review fetch limit and have truncated data beyond the first fetched page (PRs: ${prList}${listSuffix}). Statistics for these PRs may be incomplete.`;
}
