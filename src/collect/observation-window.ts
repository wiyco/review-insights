import type { PullRequestRecord, PullRequestState } from "../types";

/**
 * Applies the analysis cutoff timestamp to fetched PR data.
 *
 * The fetcher already limits PRs by createdAt. This function makes the
 * remainder of the dataset a stable historical snapshot by:
 * - dropping reviews created after `until`
 * - censoring PR state/close/merge metadata to what was observable at `until`
 * - censoring current-snapshot commit/size metadata for PRs not merged at `until`
 */
export function applyObservationWindow(
  pullRequests: PullRequestRecord[],
  until: string,
): PullRequestRecord[] {
  const untilMs = new Date(until).getTime();

  return pullRequests.map((pr) => {
    const reviews = pr.reviews.filter(
      (review) => new Date(review.createdAt).getTime() <= untilMs,
    );

    const mergedMs =
      pr.mergedAt != null ? new Date(pr.mergedAt).getTime() : null;
    const closedMs =
      pr.closedAt != null ? new Date(pr.closedAt).getTime() : null;

    let state: PullRequestState;
    let mergedAt: string | null = null;
    let closedAt: string | null = null;
    let mergedBy: string | null = null;

    if (mergedMs != null && mergedMs <= untilMs) {
      state = "MERGED";
      mergedAt = pr.mergedAt;
      closedAt =
        closedMs != null && closedMs <= untilMs ? pr.closedAt : pr.mergedAt;
      mergedBy = pr.mergedBy;
    } else if (closedMs != null && closedMs <= untilMs) {
      state = "CLOSED";
      closedAt = pr.closedAt;
    } else {
      state = "OPEN";
    }

    const observableSnapshotMetadata =
      state !== "MERGED"
        ? {
            // GitHub exposes these as current PR metadata, not a historical
            // as-of diff/commit snapshot. Keeping them for unmerged PRs would
            // let later pushes leak into historical AI/size analyses.
            commitMessages: null,
            additions: null,
            deletions: null,
            // AI-authored is determined from the stable author login. The
            // other categories depend on commit trailers, so they are unknown.
            aiCategory: pr.aiCategory === "ai-authored" ? pr.aiCategory : null,
          }
        : {
            commitMessages: pr.commitMessages,
            additions: pr.additions,
            deletions: pr.deletions,
            aiCategory: pr.aiCategory,
          };

    return {
      ...pr,
      state,
      mergedAt,
      closedAt,
      mergedBy,
      reviews,
      ...observableSnapshotMetadata,
    };
  });
}
