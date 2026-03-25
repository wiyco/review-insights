import type { MergeCorrelation, PullRequestRecord } from "../types";

/**
 * Computes per-author merge statistics: PRs authored, merged, average reviews
 * before merge, and zero-review merges.
 */
export function computeMergeCorrelations(
  pullRequests: PullRequestRecord[],
  includeBots: boolean,
): MergeCorrelation[] {
  const authorMap = new Map<
    string,
    {
      prsAuthored: number;
      prsMerged: number;
      totalReviewsOnMerged: number;
      zeroReviewMerges: number;
    }
  >();

  for (const pr of pullRequests) {
    if (!includeBots && pr.authorIsBot) continue;

    const author = pr.author;
    let entry = authorMap.get(author);
    if (!entry) {
      entry = {
        prsAuthored: 0,
        prsMerged: 0,
        totalReviewsOnMerged: 0,
        zeroReviewMerges: 0,
      };
      authorMap.set(author, entry);
    }

    entry.prsAuthored++;

    if (pr.state === "MERGED") {
      entry.prsMerged++;
      const reviewCount = pr.reviews.filter(
        (r) =>
          r.state !== "PENDING" &&
          r.reviewer !== author &&
          (includeBots || !r.reviewerIsBot),
      ).length;
      entry.totalReviewsOnMerged += reviewCount;
      if (reviewCount === 0) {
        entry.zeroReviewMerges++;
      }
    }
  }

  const results: MergeCorrelation[] = [];

  for (const [login, stats] of authorMap) {
    results.push({
      login,
      prsAuthored: stats.prsAuthored,
      prsMerged: stats.prsMerged,
      avgReviewsBeforeMerge:
        stats.prsMerged > 0 ? stats.totalReviewsOnMerged / stats.prsMerged : 0,
      zeroReviewMerges: stats.zeroReviewMerges,
    });
  }

  results.sort((a, b) => b.prsAuthored - a.prsAuthored);
  return results;
}
