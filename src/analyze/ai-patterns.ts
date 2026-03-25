import type { AIPatternResult, PullRequestRecord } from "../types";

/**
 * Analyzes bot review activity and co-authored commit patterns across pull requests.
 *
 * NOTE: This module intentionally does NOT accept an `includeBots` flag.
 * Its purpose is to observe and quantify bot activity, so excluding bots
 * would make all metrics (botReviewers, botReviewPercentage) meaningless.
 */
export function analyzeAIPatterns(
  pullRequests: PullRequestRecord[],
): AIPatternResult {
  const botReviewCounts = new Map<string, number>();
  let totalReviews = 0;

  for (const pr of pullRequests) {
    for (const review of pr.reviews) {
      totalReviews++;
      if (review.reviewerIsBot) {
        botReviewCounts.set(
          review.reviewer,
          (botReviewCounts.get(review.reviewer) ?? 0) + 1,
        );
      }
    }
  }

  // Count PRs with co-authored-by in any commit message
  let coAuthoredPRs = 0;
  const coAuthoredPattern = /co-authored-by:/i;

  for (const pr of pullRequests) {
    const hasCoAuthored = pr.commitMessages.some((msg) =>
      coAuthoredPattern.test(msg),
    );
    if (hasCoAuthored) {
      coAuthoredPRs++;
    }
  }

  // Build sorted bot reviewers list
  const botReviewers = Array.from(botReviewCounts.entries())
    .map(([login, reviewCount]) => ({
      login,
      reviewCount,
    }))
    .sort((a, b) => b.reviewCount - a.reviewCount);

  const botReviewTotal = botReviewers.reduce(
    (sum, b) => sum + b.reviewCount,
    0,
  );

  const botReviewPercentage =
    totalReviews > 0 ? (botReviewTotal / totalReviews) * 100 : 0;

  return {
    botReviewers,
    coAuthoredPRs,
    totalPRs: pullRequests.length,
    botReviewPercentage,
  };
}
