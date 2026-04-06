import { hasAICoAuthor, UNKNOWN_USER } from "../collect/normalizer";
import type {
  AICategory,
  AIPatternResult,
  DistributionStats,
  HumanReviewBurden,
  HumanReviewBurdenGroup,
  PRSizeTier,
  PullRequestRecord,
  ReviewRecord,
} from "../types";

/**
 * Computes a percentile from a **sorted** numeric array using linear interpolation.
 * Equivalent to NumPy's `percentile(..., interpolation='linear')` default.
 */
export function percentile(sorted: number[], p: number): number | null {
  if (p < 0 || p > 100) {
    throw new RangeError(`Percentile p must be in [0, 100], got ${String(p)}`);
  }
  const n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0];
  const rank = (p / 100) * (n - 1);
  const k = Math.floor(rank);
  const f = rank - k;
  if (k + 1 >= n) return sorted[n - 1];
  return sorted[k] + f * (sorted[k + 1] - sorted[k]);
}

/**
 * Builds a DistributionStats (median, p90, mean) from an unsorted array.
 */
function distributionStats(values: number[]): DistributionStats {
  if (values.length === 0) {
    return {
      median: null,
      p90: null,
      mean: null,
    };
  }
  const sorted = [
    ...values,
  ].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    mean: sum / sorted.length,
  };
}

/** Assigns a PR size tier based on total changed lines. */
export function assignSizeTier(
  additions: number,
  deletions: number,
): PRSizeTier {
  const total = additions + deletions;
  if (total === 0) return "Empty";
  if (total <= 50) return "S";
  if (total <= 300) return "M";
  return "L";
}

/**
 * Returns qualifying human reviews for a PR:
 * non-bot, non-PENDING, non-self-review.
 */
function getQualifyingHumanReviews(pr: PullRequestRecord): ReviewRecord[] {
  return pr.reviews.filter(
    (r) =>
      !r.reviewerIsBot &&
      r.state !== "PENDING" &&
      (r.reviewer === UNKNOWN_USER ||
        pr.author === UNKNOWN_USER ||
        r.reviewer !== pr.author),
  );
}

function getObservedHumanReviews(
  pr: PullRequestRecord,
  humanReviews: ReviewRecord[],
): ReviewRecord[] {
  const prCreatedMs = new Date(pr.createdAt).getTime();
  return humanReviews.filter(
    (review) => new Date(review.createdAt).getTime() >= prCreatedMs,
  );
}

function computeReviewRoundCount(
  pr: PullRequestRecord,
  observedHumanReviews: ReviewRecord[],
): number | null {
  if (observedHumanReviews.length === 0 || pr.reviewLimitReached) {
    return null;
  }

  const reviewedRevisionOids = new Set<string>();
  for (const review of observedHumanReviews) {
    if (review.commitOid == null) {
      return null;
    }
    reviewedRevisionOids.add(review.commitOid);
  }

  return reviewedRevisionOids.size;
}

/**
 * Returns the PRs that are eligible for AI-vs-human burden comparison.
 * Traditional bot-authored PRs are excluded because they do not represent
 * human-authored or AI-assisted development work. AI tool accounts remain
 * eligible because normalization already marks them as non-bots.
 */
function getHumanReviewBurdenCohort(
  pullRequests: PullRequestRecord[],
): PullRequestRecord[] {
  return pullRequests.filter((pr) => !pr.authorIsBot);
}

/** Minimum PRs in a size-tier cell to report metrics. */
const MIN_STRATIFIED_SAMPLE = 3;

/**
 * Computes human review burden metrics for a set of PRs.
 */
function computeBurdenGroup(prs: PullRequestRecord[]): HumanReviewBurdenGroup {
  const prCount = prs.length;
  if (prCount === 0) {
    return {
      prCount: 0,
      humanReviewsPerPR: {
        median: null,
        p90: null,
        mean: null,
      },
      firstReviewLatencyMs: {
        median: null,
        p90: null,
        mean: null,
      },
      unreviewedRate: null,
      changeRequestRate: {
        median: null,
        mean: null,
      },
      reviewRounds: {
        median: null,
        p90: null,
        mean: null,
      },
    };
  }

  // Per-PR human review counts (includes 0 for unreviewed PRs)
  const reviewCounts: number[] = [];
  // Latencies for PRs that received at least one qualifying review
  const latencies: number[] = [];
  // Per-PR change request rates (only for PRs with qualifying reviews)
  const crRates: number[] = [];
  // Per-PR distinct reviewed revisions among qualifying post-creation reviews
  const reviewRoundCounts: number[] = [];

  let reviewedCount = 0;

  for (const pr of prs) {
    const humanReviews = getQualifyingHumanReviews(pr);
    reviewCounts.push(humanReviews.length);

    if (humanReviews.length === 0) continue;

    // First review latency — only reviews at or after PR creation qualify.
    // A PR is considered "reviewed" for unreviewedRate only when at least
    // one review has createdAt >= pr.createdAt (matching the spec's P_g).
    const prCreated = new Date(pr.createdAt).getTime();
    const observedHumanReviews = getObservedHumanReviews(pr, humanReviews);

    if (observedHumanReviews.length === 0) {
      // All human reviews are timestamped before PR creation.
      // This PR has qualifying reviews but none with valid timestamps,
      // so it is NOT counted as "reviewed" — it contributes no latency,
      // changeRequestRate, or reviewRounds datapoint.
      continue;
    }

    reviewedCount++;
    const earliestObservedReviewMs = Math.min(
      ...observedHumanReviews.map((review) =>
        new Date(review.createdAt).getTime(),
      ),
    );
    latencies.push(earliestObservedReviewMs - prCreated);

    // Change request rate (macro: per-PR)
    const crCount = humanReviews.filter(
      (r) => r.state === "CHANGES_REQUESTED",
    ).length;
    crRates.push(crCount / humanReviews.length);

    const reviewRoundCount = computeReviewRoundCount(pr, observedHumanReviews);
    if (reviewRoundCount != null) {
      reviewRoundCounts.push(reviewRoundCount);
    }
  }

  const unreviewedRate = (prCount - reviewedCount) / prCount;

  return {
    prCount,
    humanReviewsPerPR: distributionStats(reviewCounts),
    firstReviewLatencyMs: distributionStats(latencies),
    unreviewedRate,
    changeRequestRate:
      crRates.length > 0
        ? {
            median: percentile(
              [
                ...crRates,
              ].sort((a, b) => a - b),
              50,
            ),
            mean: crRates.reduce((s, v) => s + v, 0) / crRates.length,
          }
        : {
            median: null,
            mean: null,
          },
    reviewRounds: distributionStats(reviewRoundCounts),
  };
}

const ALL_SIZE_TIERS: PRSizeTier[] = [
  "S",
  "M",
  "L",
  "Empty",
];

/**
 * Computes human review burden analysis grouped by AI category and
 * stratified by PR size tier.
 */
function computeHumanReviewBurden(
  pullRequests: PullRequestRecord[],
): HumanReviewBurden {
  const comparisonPRs = getHumanReviewBurdenCohort(pullRequests);

  // Group PRs by AI category
  const byCategory: Record<AICategory, PullRequestRecord[]> = {
    "ai-authored": [],
    "ai-assisted": [],
    "human-only": [],
  };
  for (const pr of comparisonPRs) {
    byCategory[pr.aiCategory].push(pr);
  }

  // Unstratified
  const aiAuthored = computeBurdenGroup(byCategory["ai-authored"]);
  const aiAssisted = computeBurdenGroup(byCategory["ai-assisted"]);
  const humanOnly = computeBurdenGroup(byCategory["human-only"]);

  // Stratified by size tier
  const stratifiedBySize = {} as HumanReviewBurden["stratifiedBySize"];
  for (const tier of ALL_SIZE_TIERS) {
    const forTier = (cat: AICategory): HumanReviewBurdenGroup | null => {
      const prs = byCategory[cat].filter(
        (pr) => assignSizeTier(pr.additions, pr.deletions) === tier,
      );
      return prs.length >= MIN_STRATIFIED_SAMPLE
        ? computeBurdenGroup(prs)
        : null;
    };
    stratifiedBySize[tier] = {
      aiAuthored: forTier("ai-authored"),
      aiAssisted: forTier("ai-assisted"),
      humanOnly: forTier("human-only"),
    };
  }

  return {
    aiAuthored,
    aiAssisted,
    humanOnly,
    stratifiedBySize,
  };
}

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

  // Count PRs with an AI-specific co-author trailer in any commit message.
  let aiCoAuthoredPRs = 0;

  for (const pr of pullRequests) {
    if (hasAICoAuthor(pr.commitMessages)) {
      aiCoAuthoredPRs++;
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

  const humanReviewBurden = computeHumanReviewBurden(pullRequests);

  return {
    botReviewers,
    aiCoAuthoredPRs,
    totalPRs: pullRequests.length,
    botReviewPercentage,
    humanReviewBurden,
  };
}
