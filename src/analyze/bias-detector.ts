import type { BiasResult, PullRequestRecord, ReviewMatrix } from "../types";

/** Computes the Gini coefficient for a set of values (0 = equal, 1 = maximally unequal). */
function computeGiniCoefficient(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [
    ...values,
  ].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((a, b) => a + b, 0);

  if (total === 0) return 0;

  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * sorted[i];
  }

  return Math.max(0, (2 * weightedSum) / (n * total) - (n + 1) / n);
}

/**
 * Detects reviewer-author bias by building a review matrix, computing z-scores,
 * and flagging pairs that exceed the given threshold.
 */
export function detectBias(
  pullRequests: PullRequestRecord[],
  threshold: number,
  includeBots: boolean,
): BiasResult {
  // Build ReviewMatrix
  const matrix: ReviewMatrix = new Map();

  // Count every review submission (including multiple reviews on the same PR)
  // to capture the full frequency of reviewer-author interactions for bias detection.
  for (const pr of pullRequests) {
    if (!includeBots && pr.authorIsBot) continue;

    const author = pr.author;
    for (const review of pr.reviews) {
      if (review.state === "PENDING") continue;
      if (!includeBots && review.reviewerIsBot) continue;

      const reviewer = review.reviewer;
      if (reviewer === author) continue;

      let reviewerRow = matrix.get(reviewer);
      if (!reviewerRow) {
        reviewerRow = new Map();
        matrix.set(reviewer, reviewerRow);
      }
      reviewerRow.set(author, (reviewerRow.get(author) ?? 0) + 1);
    }
  }

  // Flatten all matrix cell values
  const allValues: number[] = [];
  for (const row of matrix.values()) {
    for (const count of row.values()) {
      allValues.push(count);
    }
  }

  if (allValues.length === 0) {
    return {
      matrix,
      flaggedPairs: [],
      giniCoefficient: 0,
    };
  }

  // Compute mean and stddev
  const n = allValues.length;
  const mean = allValues.reduce((a, b) => a + b, 0) / n;
  const variance = allValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  // Flag pairs exceeding threshold
  const flaggedPairs: BiasResult["flaggedPairs"] = [];

  if (stddev > 0) {
    for (const [reviewer, row] of matrix) {
      for (const [author, count] of row) {
        const zScore = (count - mean) / stddev;
        if (count > mean + threshold * stddev) {
          flaggedPairs.push({
            reviewer,
            author,
            count,
            zScore,
          });
        }
      }
    }
  }

  flaggedPairs.sort((a, b) => b.zScore - a.zScore);

  const giniCoefficient = computeGiniCoefficient(allValues);

  return {
    matrix,
    flaggedPairs,
    giniCoefficient,
  };
}
