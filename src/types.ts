/**
 * Possible states of a pull request review.
 * @see {@link https://docs.github.com/en/graphql/reference/enums#pullrequestreviewstate}
 */
export type ReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

/**
 * Possible states of a pull request.
 * @see {@link https://docs.github.com/en/graphql/reference/enums#pullrequeststate}
 */
export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";

/**
 * A single review submission on a pull request.
 * @see {@link https://docs.github.com/en/graphql/reference/objects#pullrequestreview}
 */
export interface ReviewRecord {
  reviewer: string;
  reviewerIsBot: boolean;
  author: string;
  state: ReviewState;
  createdAt: string;
  prNumber: number;
}

/**
 * Normalized pull request with associated reviews and metadata.
 * @see {@link https://docs.github.com/en/graphql/reference/objects#pullrequest}
 */
export interface PullRequestRecord {
  number: number;
  title: string;
  state: PullRequestState;
  author: string;
  authorIsBot: boolean;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  mergedBy: string | null;
  /** True when the fetched review connection hit the per-PR GraphQL cap; otherwise false on normalized records. */
  reviewLimitReached: boolean;
  reviews: ReviewRecord[];
  reviewRequests: string[];
  commitMessages: string[];
  additions: number;
  deletions: number;
  aiCategory: AICategory;
}

/** Aggregated review statistics for a single user. */
export interface UserReviewStats {
  login: string;
  /** Number of unique PRs this user reviewed (each PR counted at most once). */
  reviewsGiven: number;
  /** Total review submissions received on this user's PRs (includes multiple reviews on the same PR). */
  reviewsReceived: number;
  approvals: number;
  changeRequests: number;
  comments: number;
  dismissed: number;
  avgTimeToFirstReviewMs: number | null;
  medianTimeToFirstReviewMs: number | null;
}

/** Tie-aware summary of the active reviewer population. */
export interface TopReviewerSummary {
  reviewerCount: number;
  maxReviewsGiven: number | null;
  topReviewers: string[];
}

/** Per-author merge statistics. */
export interface MergeCorrelation {
  login: string;
  prsAuthored: number;
  prsMerged: number;
  avgReviewsBeforeMerge: number;
  medianReviewsBeforeMerge: number | null;
  zeroReviewMerges: number;
}

/** Nested map of reviewer -> author -> review count. */
export type ReviewMatrix = Map<string, Map<string, number>>;

/** A reviewer-author pair flagged for unusually high review frequency. */
export interface FlaggedPair {
  reviewer: string;
  author: string;
  count: number;
  zScore: number;
}

/** Results of the bias detection analysis. */
export interface BiasResult {
  matrix: ReviewMatrix;
  flaggedPairs: FlaggedPair[];
  giniCoefficient: number;
}

/** Classification of a PR's AI involvement level. */
export type AICategory = "ai-authored" | "ai-assisted" | "human-only";

/** PR size tier based on total changed lines (additions + deletions). */
export type PRSizeTier = "S" | "M" | "L" | "Empty";

/** A bot account that has submitted reviews. */
export interface BotReviewer {
  login: string;
  reviewCount: number;
}

/** Distribution statistics with outlier-resistant percentiles. */
export interface DistributionStats {
  median: number | null;
  p90: number | null;
  mean: number | null;
}

/** Human review burden metrics for a single PR group. */
export interface HumanReviewBurdenGroup {
  prCount: number;
  humanReviewsPerPR: DistributionStats;
  firstReviewLatencyMs: DistributionStats;
  unreviewedRate: number | null;
  changeRequestRate: {
    median: number | null;
    mean: number | null;
  };
  reviewRounds: DistributionStats;
}

/** Human review burden analysis across AI category groups and size tiers. */
export interface HumanReviewBurden {
  aiAuthored: HumanReviewBurdenGroup;
  aiAssisted: HumanReviewBurdenGroup;
  humanOnly: HumanReviewBurdenGroup;
  stratifiedBySize: Record<
    PRSizeTier,
    {
      aiAuthored: HumanReviewBurdenGroup | null;
      aiAssisted: HumanReviewBurdenGroup | null;
      humanOnly: HumanReviewBurdenGroup | null;
    }
  >;
}

/** Results of the AI/bot pattern analysis. */
export interface AIPatternResult {
  botReviewers: BotReviewer[];
  aiCoAuthoredPRs: number;
  totalPRs: number;
  botReviewPercentage: number;
  humanReviewBurden: HumanReviewBurden;
}

/** Why the collected PR dataset is partial, if applicable. */
export type PartialDataReason =
  | "pagination-time-limit"
  | "pagination-delay-budget-exceeded";

/** Supported output destinations for the report. */
export type OutputMode = "summary" | "comment" | "artifact";

/** Validated action configuration derived from workflow inputs. */
export interface ActionConfig {
  token: string;
  owner: string;
  repo: string;
  since: string;
  until: string;
  outputModes: OutputMode[];
  biasThreshold: number;
  includeBots: boolean;
  maxPRs: number;
}

/** ISO 8601 date range for the analysis period. */
export interface DateRange {
  since: string;
  until: string;
}

/** Result of the collection phase before downstream analysis. */
export interface CollectionResult {
  pullRequests: PullRequestRecord[];
  partialData: boolean;
  partialDataReason: PartialDataReason | null;
}

/** Complete output of all analysis modules. */
export interface AnalysisResult {
  userStats: UserReviewStats[];
  mergeCorrelations: MergeCorrelation[];
  bias: BiasResult;
  aiPatterns: AIPatternResult;
  pullRequests: PullRequestRecord[];
  dateRange: DateRange;
  biasThreshold: number;
  includeBots: boolean;
  partialData: boolean;
  partialDataReason: PartialDataReason | null;
}
