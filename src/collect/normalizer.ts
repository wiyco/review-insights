import type {
  AICategory,
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

export const UNKNOWN_USER = "ghost";

const BOT_LOGIN_SUFFIXES = [
  "[bot]",
  "-bot",
] as const;

const AI_TOOL_PREFIXES = [
  "openclaw-",
  "devin-ai-integration",
  "copilot-swe-agent",
] as const;

/**
 * Email patterns for AI co-author detection in commit trailers.
 * Only the email address is checked — the name field is ignored to
 * avoid brittleness from model name changes.
 */
const AI_COAUTHOR_EMAIL_PATTERNS = [
  "noreply@anthropic.com",
  "cursoragent@cursor.com",
  "+copilot@users.noreply.github.com",
  "+devin-ai-integration[bot]@users.noreply.github.com",
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
 * Determines whether an account is an AI tool account (e.g., OpenClaw).
 * Distinct from bot detection — AI tool accounts produce substantive code
 * changes that require genuine peer review.
 */
export function isAIToolAccount(login: string): boolean {
  const lower = login.toLowerCase();
  return AI_TOOL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Checks whether any commit message contains an AI co-author trailer.
 * Matches `Co-authored-by: <name> <email>` where email matches a known
 * AI tool pattern.
 */
export function hasAICoAuthor(commitMessages: string[]): boolean {
  const pattern = /co-authored-by:\s*[^<]*<([^>]+)>/gi;
  for (const msg of commitMessages) {
    pattern.lastIndex = 0;
    for (
      let match = pattern.exec(msg);
      match !== null;
      match = pattern.exec(msg)
    ) {
      const email = match[1].toLowerCase();
      if (
        AI_COAUTHOR_EMAIL_PATTERNS.some((p) =>
          p.startsWith("+") ? email.endsWith(p) : email === p,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Classifies a PR into an AI category based on author and commit trailers.
 */
function classifyAICategory(
  login: string,
  commitMessages: string[],
): AICategory {
  if (isAIToolAccount(login)) {
    return "ai-authored";
  }
  if (hasAICoAuthor(commitMessages)) {
    return "ai-assisted";
  }
  return "human-only";
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
    const authorIsBot = isAIToolAccount(author) ? false : isBot(node.author);
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
    const aiCategory = classifyAICategory(author, commitMessages);

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
      additions: node.additions,
      deletions: node.deletions,
      aiCategory,
    };
  });
}
