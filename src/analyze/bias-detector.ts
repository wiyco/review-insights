import { UNKNOWN_USER } from "../collect/normalizer";
import type { BiasResult, PullRequestRecord, ReviewMatrix } from "../types";

const IPF_MAX_ITERATIONS = 10_000;
const IPF_RELATIVE_TOLERANCE = 1e-8;

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

function getRelativeMarginDiff(fitted: number, observed: number): number {
  return Math.abs(fitted - observed) / Math.max(1, Math.abs(observed));
}

export function fitQuasiIndependenceModel(matrix: ReviewMatrix): {
  expectedCount: (reviewer: string, author: string) => number;
} {
  const authors: Array<{
    author: string;
    columnTotal: number;
    reviewerPositions: number[];
  }> = [];
  const authorIndex = new Map<string, number>();
  const reviewers: Array<{
    reviewer: string;
    rowTotal: number;
    authorPositions: number[];
  }> = [];

  for (const [reviewer, row] of matrix) {
    const reviewerPosition = reviewers.length;
    let rowTotal = 0;
    const authorPositions: number[] = [];

    for (const [author, count] of row) {
      rowTotal += count;

      let authorPosition = authorIndex.get(author);
      if (authorPosition == null) {
        authorPosition = authors.length;
        authorIndex.set(author, authorPosition);
        authors.push({
          author,
          columnTotal: 0,
          reviewerPositions: [],
        });
      }

      authorPositions.push(authorPosition);
      authors[authorPosition].columnTotal += count;
      authors[authorPosition].reviewerPositions.push(reviewerPosition);
    }

    reviewers.push({
      reviewer,
      rowTotal,
      authorPositions,
    });
  }

  const reviewerFactors = reviewers.map(() => 1);
  const authorFactors = authors.map(() => 1);
  const reviewerIndex = new Map(
    reviewers.map(({ reviewer }, index) => [
      reviewer,
      index,
    ]),
  );
  const reviewerSupportSets = reviewers.map(
    ({ authorPositions }) => new Set(authorPositions),
  );
  const authorIndexByName = new Map(
    authors.map(({ author }, index) => [
      author,
      index,
    ]),
  );

  function getReviewerSupportMass(reviewerPosition: number): number {
    return reviewers[reviewerPosition].authorPositions.reduce(
      (sum, authorPosition) => {
        return sum + authorFactors[authorPosition];
      },
      0,
    );
  }

  function getAuthorSupportMass(authorPosition: number): number {
    return authors[authorPosition].reviewerPositions.reduce(
      (sum, reviewerPosition) => {
        return sum + reviewerFactors[reviewerPosition];
      },
      0,
    );
  }

  for (let iteration = 0; iteration < IPF_MAX_ITERATIONS; iteration++) {
    for (
      let reviewerPosition = 0;
      reviewerPosition < reviewers.length;
      reviewerPosition++
    ) {
      const { reviewer, rowTotal } = reviewers[reviewerPosition];
      const supportMass = getReviewerSupportMass(reviewerPosition);
      if (supportMass <= 0) {
        throw new Error(
          `Bias model support is empty for reviewer "${reviewer}".`,
        );
      }
      const fittedRowTotal = reviewerFactors[reviewerPosition] * supportMass;
      reviewerFactors[reviewerPosition] *= rowTotal / fittedRowTotal;
    }

    for (
      let authorPosition = 0;
      authorPosition < authors.length;
      authorPosition++
    ) {
      const { author, columnTotal } = authors[authorPosition];
      const supportMass = getAuthorSupportMass(authorPosition);
      if (supportMass <= 0) {
        throw new Error(`Bias model support is empty for author "${author}".`);
      }
      const fittedColumnTotal = authorFactors[authorPosition] * supportMass;
      authorFactors[authorPosition] *= columnTotal / fittedColumnTotal;
    }

    let maxRelativeDiff = 0;

    for (
      let reviewerPosition = 0;
      reviewerPosition < reviewers.length;
      reviewerPosition++
    ) {
      const { rowTotal } = reviewers[reviewerPosition];
      const fittedRowTotal =
        reviewerFactors[reviewerPosition] *
        getReviewerSupportMass(reviewerPosition);
      maxRelativeDiff = Math.max(
        maxRelativeDiff,
        getRelativeMarginDiff(fittedRowTotal, rowTotal),
      );
    }

    for (
      let authorPosition = 0;
      authorPosition < authors.length;
      authorPosition++
    ) {
      const { columnTotal } = authors[authorPosition];
      const fittedColumnTotal =
        authorFactors[authorPosition] * getAuthorSupportMass(authorPosition);
      maxRelativeDiff = Math.max(
        maxRelativeDiff,
        getRelativeMarginDiff(fittedColumnTotal, columnTotal),
      );
    }

    if (maxRelativeDiff < IPF_RELATIVE_TOLERANCE) {
      return {
        expectedCount(reviewer: string, author: string): number {
          const reviewerPosition = reviewerIndex.get(reviewer);
          const authorPosition = authorIndexByName.get(author);
          if (reviewerPosition == null || authorPosition == null) {
            return 0;
          }
          if (!reviewerSupportSets[reviewerPosition].has(authorPosition)) {
            return 0;
          }
          return (
            reviewerFactors[reviewerPosition] * authorFactors[authorPosition]
          );
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
