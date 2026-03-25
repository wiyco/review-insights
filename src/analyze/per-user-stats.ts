import type { PullRequestRecord, UserReviewStats } from "../types";

/**
 * Computes per-user review statistics from pull request data.
 * Tracks reviews given/received, approval counts, and average time to first review.
 */
export function computeUserStats(
  pullRequests: PullRequestRecord[],
  includeBots: boolean,
): UserReviewStats[] {
  const statsMap = new Map<
    string,
    {
      reviewsGivenPRs: Set<number>;
      reviewsReceived: number;
      approvals: number;
      changeRequests: number;
      comments: number;
      dismissed: number;
      firstReviewTimesMs: number[];
    }
  >();

  function getOrCreate(login: string) {
    let entry = statsMap.get(login);
    if (!entry) {
      entry = {
        reviewsGivenPRs: new Set(),
        reviewsReceived: 0,
        approvals: 0,
        changeRequests: 0,
        comments: 0,
        dismissed: 0,
        firstReviewTimesMs: [],
      };
      statsMap.set(login, entry);
    }
    return entry;
  }

  for (const pr of pullRequests) {
    const author = pr.author;
    // When a bot-authored PR is skipped, all reviews on that PR are also
    // excluded from human reviewer stats. This avoids inflating review counts
    // with automated PRs that don't reflect real team review workload.
    if (!includeBots && pr.authorIsBot) continue;

    // Ensure author entry exists
    getOrCreate(author);

    // Track earliest review time for this PR (for the author's avgTimeToFirstReview)
    let earliestReviewMs: number | null = null;
    const prCreatedMs = new Date(pr.createdAt).getTime();

    for (const review of pr.reviews) {
      const reviewer = review.reviewer;
      if (!includeBots && review.reviewerIsBot) continue;

      // PENDING reviews are drafts that have not been submitted yet;
      // they should not count toward any reviewer metrics.
      if (review.state === "PENDING") continue;

      // Self-reviews don't count (consistent with bias-detector)
      if (reviewer === author) continue;

      // Track unique PR reviews given
      const reviewerStats = getOrCreate(reviewer);
      reviewerStats.reviewsGivenPRs.add(pr.number);

      // Count reviews received by the PR author
      const authorStats = getOrCreate(author);
      authorStats.reviewsReceived++;

      // Count by state
      switch (review.state) {
        case "APPROVED":
          reviewerStats.approvals++;
          break;
        case "CHANGES_REQUESTED":
          reviewerStats.changeRequests++;
          break;
        case "COMMENTED":
          reviewerStats.comments++;
          break;
        case "DISMISSED":
          reviewerStats.dismissed++;
          break;
      }

      // Track earliest review for time-to-first-review calculation
      const reviewMs = new Date(review.createdAt).getTime();
      if (
        reviewMs >= prCreatedMs &&
        (earliestReviewMs === null || reviewMs < earliestReviewMs)
      ) {
        earliestReviewMs = reviewMs;
      }
    }

    // Record time-to-first-review for this PR's author
    if (earliestReviewMs !== null) {
      const authorStats = getOrCreate(author);
      authorStats.firstReviewTimesMs.push(earliestReviewMs - prCreatedMs);
    }
  }

  const results: UserReviewStats[] = [];

  for (const [login, stats] of statsMap) {
    const avgTimeToFirstReviewMs =
      stats.firstReviewTimesMs.length > 0
        ? stats.firstReviewTimesMs.reduce((a, b) => a + b, 0) /
          stats.firstReviewTimesMs.length
        : null;

    results.push({
      login,
      reviewsGiven: stats.reviewsGivenPRs.size,
      reviewsReceived: stats.reviewsReceived,
      approvals: stats.approvals,
      changeRequests: stats.changeRequests,
      comments: stats.comments,
      dismissed: stats.dismissed,
      avgTimeToFirstReviewMs,
    });
  }

  results.sort((a, b) => b.reviewsGiven - a.reviewsGiven);
  return results;
}
