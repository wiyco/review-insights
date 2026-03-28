import type { TopReviewerSummary, UserReviewStats } from "../types";

function compareLoginsByCodeUnit(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/**
 * Computes the active-reviewer population and the argmax set of reviewsGiven.
 * Ties are preserved instead of collapsing to a single login.
 */
export function computeTopReviewerSummary(
  userStats: UserReviewStats[],
): TopReviewerSummary {
  let reviewerCount = 0;
  let maxReviewsGiven: number | null = null;
  const topReviewers: string[] = [];

  for (const user of userStats) {
    if (user.reviewsGiven <= 0) {
      continue;
    }

    reviewerCount += 1;

    if (maxReviewsGiven === null || user.reviewsGiven > maxReviewsGiven) {
      maxReviewsGiven = user.reviewsGiven;
      topReviewers.length = 0;
      topReviewers.push(user.login);
      continue;
    }

    if (user.reviewsGiven === maxReviewsGiven) {
      topReviewers.push(user.login);
    }
  }

  if (maxReviewsGiven === null) {
    return {
      reviewerCount: 0,
      maxReviewsGiven: null,
      topReviewers: [],
    };
  }

  // Use locale-independent code-unit ordering so serialized outputs
  // remain stable across runners with different default locales.
  topReviewers.sort(compareLoginsByCodeUnit);

  return {
    reviewerCount,
    maxReviewsGiven,
    topReviewers,
  };
}
