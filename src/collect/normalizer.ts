import type {
  PullRequestRecord,
  PullRequestState,
  ReviewRecord,
  ReviewState,
} from "../types";
import { logger } from "../utils/logger";
import {
  MAX_REVIEWS_PER_PR,
  type RawPullRequestNode,
  type RawReview,
} from "./graphql-queries";

const UNKNOWN_USER = "ghost";

const BOT_LOGIN_SUFFIXES = [
  "[bot]",
  "-bot",
] as const;

const VALID_REVIEW_STATES: ReadonlySet<ReviewState> = new Set<ReviewState>([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
  "PENDING",
]);

function isValidReviewState(value: string): value is ReviewState {
  return VALID_REVIEW_STATES.has(value as ReviewState);
}

/**
 * Determines whether an author represents a bot account.
 * Accepts either a raw GraphQL author object or a plain login string.
 */
export function isBot(
  author:
    | string
    | {
        login: string;
        __typename?: string;
      }
    | null,
): boolean {
  if (!author) {
    return false;
  }

  const login = typeof author === "string" ? author : author.login;
  const typename = typeof author === "object" ? author.__typename : undefined;

  // Check __typename from GraphQL
  if (typename === "Bot") {
    return true;
  }

  // Check common bot login suffixes (e.g. "dependabot[bot]", "snyk-bot")
  const lower = login.toLowerCase();
  return BOT_LOGIN_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/**
 * Normalizes a raw GraphQL review node into a ReviewRecord.
 */
export function normalizeReview(
  rawReview: RawReview,
  prNumber: number,
  prAuthor: string,
): ReviewRecord {
  const state = isValidReviewState(rawReview.state)
    ? rawReview.state
    : (() => {
        logger.warning(
          `Unknown review state "${rawReview.state}" on PR #${prNumber}; treating as COMMENTED.`,
        );
        return "COMMENTED" as const;
      })();

  return {
    reviewer: rawReview.author?.login ?? UNKNOWN_USER,
    reviewerIsBot: isBot(rawReview.author),
    author: prAuthor,
    state,
    createdAt: rawReview.createdAt,
    prNumber,
  };
}

/**
 * Normalizes raw GraphQL pull request nodes into PullRequestRecord[].
 */
export function normalizePullRequests(
  rawNodes: RawPullRequestNode[],
): PullRequestRecord[] {
  return rawNodes.map((node) => {
    const author = node.author?.login ?? UNKNOWN_USER;
    const authorIsBot = isBot(node.author);
    const state: PullRequestState = node.state;

    if (node.reviews.nodes.length >= MAX_REVIEWS_PER_PR) {
      logger.warning(
        `PR #${node.number} has ${MAX_REVIEWS_PER_PR}+ reviews; some may be truncated by the GraphQL query limit.`,
      );
    }

    const reviews = node.reviews.nodes.map((review) =>
      normalizeReview(review, node.number, author),
    );

    const reviewRequests = node.reviewRequests.nodes
      .map(
        (rr) =>
          rr.requestedReviewer?.login ?? rr.requestedReviewer?.name ?? null,
      )
      .filter((name): name is string => name !== null);

    const commitMessages = node.commits.nodes.map((c) => c.commit.message);

    return {
      number: node.number,
      title: node.title,
      state,
      author,
      authorIsBot,
      createdAt: node.createdAt,
      mergedAt: node.mergedAt,
      closedAt: node.closedAt,
      mergedBy: node.mergedBy?.login ?? null,
      reviews,
      reviewRequests,
      commitMessages,
    };
  });
}
