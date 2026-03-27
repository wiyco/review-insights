import { UNKNOWN_USER } from "../collect/normalizer";
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

function countStructurallyExcludedDiagonalCells(
  reviewers: ReadonlySet<string>,
  authors: ReadonlySet<string>,
): number {
  let excludedDiagonals = 0;

  for (const reviewer of reviewers) {
    // The shared UNKNOWN_USER placeholder may represent different deleted
    // accounts, so ghost->ghost remains an eligible matrix cell.
    if (reviewer !== UNKNOWN_USER && authors.has(reviewer)) {
      excludedDiagonals++;
    }
  }

  return excludedDiagonals;
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
      // Skip self-review exclusion when either login is the UNKNOWN_USER
      // placeholder to avoid incorrectly collapsing unrelated deleted users.
      if (
        reviewer !== UNKNOWN_USER &&
        author !== UNKNOWN_USER &&
        reviewer === author
      )
        continue;

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
  // Genuine self-review diagonal entries (user is both reviewer and author) are excluded.
  // Only genuine identity overlaps shrink the matrix. The shared UNKNOWN_USER
  // placeholder stays in the domain because ghost->ghost may represent
  // different deleted accounts.
  const reviewers = new Set(matrix.keys());
  const authors = new Set<string>();
  for (const pr of pullRequests) {
    if (!includeBots && pr.authorIsBot) continue;
    authors.add(pr.author);
  }
  const excludedDiagonalCells = countStructurallyExcludedDiagonalCells(
    reviewers,
    authors,
  );
  const totalCells = reviewers.size * authors.size - excludedDiagonalCells;

  const giniCoefficient = computeGiniCoefficient(allValues, totalCells);

  return {
    matrix,
    flaggedPairs,
    giniCoefficient,
  };
}
