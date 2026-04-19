import { UNKNOWN_USER } from "../collect/normalizer";
import type { BiasResult, PullRequestRecord, ReviewMatrix } from "../types";

const IPF_MAX_ITERATIONS = 10_000;
const IPF_RELATIVE_TOLERANCE = 1e-8;

interface AuthorStats {
  author: string;
  columnTotal: number;
  reviewers: ReviewerStats[];
  factor: number;
}

interface ReviewerStats {
  reviewer: string;
  rowTotal: number;
  authors: AuthorStats[];
  authorSet: Set<AuthorStats>;
  factor: number;
}

/**
 * Computes the Gini coefficient (0 = equal, 1 = maximally unequal).
 *
 * @param nonZeroValues - The non-zero cell values from the matrix.
 * @param totalCells - The total number of cells in the full matrix (including
 *   structural zeros). When greater than `nonZeroValues.length`, the difference
 *   is treated as zero-valued cells without materializing them - only the
 *   non-zero values are sorted, and their rank indices are offset by the
 *   implicit leading zeros.
 */
function computeGiniCoefficient(
  nonZeroValues: number[],
  totalCells: number,
): number {
  const sorted = [
    ...nonZeroValues,
  ].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0);

  const zeroCount = totalCells - sorted.length;
  let weightedSum = 0;
  // Zeros occupy ranks 1..zeroCount; their contribution is 0.
  // Non-zero values occupy ranks (zeroCount+1)..(zeroCount+sorted.length).
  for (const [index, count] of sorted.entries()) {
    weightedSum += (zeroCount + index + 1) * count;
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

function getRelativeMarginDiff(fitted: number, observed: number): number {
  return Math.abs(fitted - observed) / Math.max(1, Math.abs(observed));
}

export function fitQuasiIndependenceModel(matrix: ReviewMatrix): {
  expectedCount: (reviewer: string, author: string) => number;
} {
  const authors: AuthorStats[] = [];
  const authorByName = new Map<string, AuthorStats>();
  const reviewers: ReviewerStats[] = [];

  for (const [reviewer, row] of matrix) {
    const reviewerStats: ReviewerStats = {
      reviewer,
      rowTotal: 0,
      authors: [],
      authorSet: new Set(),
      factor: 1,
    };

    for (const [author, count] of row) {
      if (count < 0) {
        throw new Error(
          `Review matrix contains a negative count for reviewer "${reviewer}" and author "${author}": ${count}`,
        );
      }
      if (count === 0) {
        continue;
      }

      reviewerStats.rowTotal += count;

      let authorStats = authorByName.get(author);
      if (authorStats == null) {
        authorStats = {
          author,
          columnTotal: 0,
          reviewers: [],
          factor: 1,
        };
        authorByName.set(author, authorStats);
        authors.push(authorStats);
      }

      reviewerStats.authors.push(authorStats);
      reviewerStats.authorSet.add(authorStats);
      authorStats.columnTotal += count;
      authorStats.reviewers.push(reviewerStats);
    }

    if (reviewerStats.authors.length === 0) {
      continue;
    }

    reviewers.push(reviewerStats);
  }

  if (reviewers.length === 0) {
    throw new Error(
      "Bias model requires at least one positive reviewer-author count.",
    );
  }

  const reviewerByName = new Map<string, ReviewerStats>();
  for (const reviewerStats of reviewers) {
    reviewerByName.set(reviewerStats.reviewer, reviewerStats);
  }

  function getReviewerSupportMass(reviewerStats: ReviewerStats): number {
    return reviewerStats.authors.reduce(
      (sum, authorStats) => sum + authorStats.factor,
      0,
    );
  }

  function getAuthorSupportMass(authorStats: AuthorStats): number {
    return authorStats.reviewers.reduce(
      (sum, reviewerStats) => sum + reviewerStats.factor,
      0,
    );
  }

  for (let iteration = 0; iteration < IPF_MAX_ITERATIONS; iteration++) {
    for (const reviewerStats of reviewers) {
      const supportMass = getReviewerSupportMass(reviewerStats);
      const fittedRowTotal = reviewerStats.factor * supportMass;
      reviewerStats.factor *= reviewerStats.rowTotal / fittedRowTotal;
    }

    for (const authorStats of authors) {
      const supportMass = getAuthorSupportMass(authorStats);
      const fittedColumnTotal = authorStats.factor * supportMass;
      authorStats.factor *= authorStats.columnTotal / fittedColumnTotal;
    }

    let maxRelativeDiff = 0;

    for (const reviewerStats of reviewers) {
      const fittedRowTotal =
        reviewerStats.factor * getReviewerSupportMass(reviewerStats);
      maxRelativeDiff = Math.max(
        maxRelativeDiff,
        getRelativeMarginDiff(fittedRowTotal, reviewerStats.rowTotal),
      );
    }

    for (const authorStats of authors) {
      const fittedColumnTotal =
        authorStats.factor * getAuthorSupportMass(authorStats);
      maxRelativeDiff = Math.max(
        maxRelativeDiff,
        getRelativeMarginDiff(fittedColumnTotal, authorStats.columnTotal),
      );
    }

    if (maxRelativeDiff < IPF_RELATIVE_TOLERANCE) {
      return {
        expectedCount(reviewer: string, author: string): number {
          const reviewerStats = reviewerByName.get(reviewer);
          const authorStats = authorByName.get(author);
          if (reviewerStats == null || authorStats == null) {
            return 0;
          }
          if (!reviewerStats.authorSet.has(authorStats)) {
            return 0;
          }
          return reviewerStats.factor * authorStats.factor;
        },
      };
    }
  }

  throw new Error(
    `Bias model did not converge within ${IPF_MAX_ITERATIONS} IPF iterations.`,
  );
}

/**
 * Detects reviewer-author concentration by comparing observed counts against a
 * quasi-independence model that conditions on reviewer and author activity.
 *
 * When the model cannot be fit numerically, the function returns an
 * unavailable bias result (no flagged pairs plus a modelFitError) instead of
 * throwing, so downstream reports can still render descriptive statistics.
 */
export function detectBias(
  pullRequests: PullRequestRecord[],
  threshold: number,
  includeBots: boolean,
): BiasResult {
  const matrix: ReviewMatrix = new Map();

  // Count every review submission (including multiple reviews on the same PR)
  // to capture the full reviewer-author interaction frequency.
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
      ) {
        continue;
      }

      let reviewerRow = matrix.get(reviewer);
      if (!reviewerRow) {
        reviewerRow = new Map();
        matrix.set(reviewer, reviewerRow);
      }
      reviewerRow.set(author, (reviewerRow.get(author) ?? 0) + 1);
    }
  }

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
      modelFitError: null,
    };
  }

  // Build the full matrix dimensions for Gini coefficient.
  // Reviewers: users with >=1 qualifying review (from the matrix).
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

  try {
    const { expectedCount } = fitQuasiIndependenceModel(matrix);

    const flaggedPairs: BiasResult["flaggedPairs"] = [];
    for (const [reviewer, row] of matrix) {
      for (const [author, count] of row) {
        const fittedCount = expectedCount(reviewer, author);
        const pearsonResidual = (count - fittedCount) / Math.sqrt(fittedCount);
        if (count > fittedCount && pearsonResidual > threshold) {
          flaggedPairs.push({
            reviewer,
            author,
            count,
            expectedCount: fittedCount,
            pearsonResidual,
          });
        }
      }
    }

    flaggedPairs.sort((a, b) => b.pearsonResidual - a.pearsonResidual);

    return {
      matrix,
      flaggedPairs,
      giniCoefficient,
      modelFitError: null,
    };
  } catch (err: unknown) {
    return {
      matrix,
      flaggedPairs: [],
      giniCoefficient,
      modelFitError: err instanceof Error ? err.message : String(err),
    };
  }
}
