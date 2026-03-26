import type { BiasResult, PullRequestRecord, ReviewMatrix } from "../types";

/**
 * Computes the Gini coefficient (0 = equal, 1 = maximally unequal).
 *
 * @param nonZeroValues - The non-zero cell values from the matrix.
 * @param totalCells - The total number of cells in the full matrix (including
 *   structural zeros). When greater than `nonZeroValues.length`, the difference
 *   is treated as zero-valued cells without materializing them — only the
 *   non-zero values are sorted, and their rank indices are offset by the
 *   implicit leading zeros.
 */
function computeGiniCoefficient(
  nonZeroValues: number[],
  totalCells: number,
): number {
  if (totalCells === 0) return 0;

  const sorted = [
    ...nonZeroValues,
  ].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0);

  if (total === 0) return 0;

  const zeroCount = totalCells - sorted.length;
  let weightedSum = 0;
  // Zeros occupy ranks 1..zeroCount; their contribution is 0.
  // Non-zero values occupy ranks (zeroCount+1)..(zeroCount+sorted.length).
  for (let i = 0; i < sorted.length; i++) {
    weightedSum += (zeroCount + i + 1) * sorted[i];
  }

  return Math.max(
    0,
    (2 * weightedSum) / (totalCells * total) - (totalCells + 1) / totalCells,
  );
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

  // Build the full matrix dimensions for Gini coefficient.
  // Reviewers: users with ≥1 qualifying review (from the matrix).
  // Authors: all PR authors in the filtered set (including those with zero reviews).
  // Self-review diagonal entries (user is both reviewer and author) are excluded.
  const reviewers = new Set(matrix.keys());
  const authors = new Set<string>();
  for (const pr of pullRequests) {
    if (!includeBots && pr.authorIsBot) continue;
    authors.add(pr.author);
  }
  let selfPairs = 0;
  for (const r of reviewers) {
    if (authors.has(r)) selfPairs++;
  }
  const totalCells = reviewers.size * authors.size - selfPairs;

  const giniCoefficient = computeGiniCoefficient(allValues, totalCells);

  return {
    matrix,
    flaggedPairs,
    giniCoefficient,
  };
}
