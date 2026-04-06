import { UNKNOWN_USER } from "../collect/normalizer";
import type { MergeCorrelation, PullRequestRecord } from "../types";
import { computeMedian } from "../utils/median";

/**
 * Computes per-author merge statistics: PRs authored, merged, average/median
 * reviews before merge, and zero-review merges.
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
      reviewCountsPerMergedPR: number[];
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
        reviewCountsPerMergedPR: [],
        zeroReviewMerges: 0,
      };
      authorMap.set(author, entry);
    }

    entry.prsAuthored++;

    if (pr.state === "MERGED") {
      entry.prsMerged++;
      const mergedMs =
        pr.mergedAt != null ? new Date(pr.mergedAt).getTime() : null;
      const reviewCount = pr.reviews.filter(
        (r) =>
          r.state !== "PENDING" &&
          (mergedMs === null || new Date(r.createdAt).getTime() <= mergedMs) &&
          (r.reviewer === UNKNOWN_USER ||
            author === UNKNOWN_USER ||
            r.reviewer !== author) &&
          (includeBots || !r.reviewerIsBot),
      ).length;
      entry.totalReviewsOnMerged += reviewCount;
      entry.reviewCountsPerMergedPR.push(reviewCount);
      if (reviewCount === 0) {
        entry.zeroReviewMerges++;
      }
    }
  }

  const results: MergeCorrelation[] = [];

  for (const [login, stats] of authorMap) {
    const medianReviewsBeforeMerge = computeMedian(
      stats.reviewCountsPerMergedPR,
    );

    results.push({
      login,
      prsAuthored: stats.prsAuthored,
      prsMerged: stats.prsMerged,
      avgReviewsBeforeMerge:
        stats.prsMerged > 0
          ? stats.totalReviewsOnMerged / stats.prsMerged
          : null,
      medianReviewsBeforeMerge,
      zeroReviewMerges: stats.zeroReviewMerges,
    });
  }

  results.sort((a, b) => b.prsAuthored - a.prsAuthored);
  return results;
}
