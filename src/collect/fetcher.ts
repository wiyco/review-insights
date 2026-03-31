import type { GitHub } from "@actions/github/lib/utils";
import type { ActionConfig, CollectionResult } from "../types";
import { logger } from "../utils/logger";
import { PAGINATION_TIME_LIMIT_MINUTES } from "../utils/partial-data";
import {
  calculateDelay,
  checkRateLimit,
  retry,
  sleep,
} from "../utils/rate-limit";
import {
  MAX_REVIEW_REQUESTS_PER_PR,
  MAX_REVIEWS_PER_PR,
  PULL_REQUESTS_QUERY,
  type PullRequestsQueryResponse,
  type PullRequestsQueryVariables,
  type RawPullRequestNode,
} from "./graphql-queries";
import { normalizePullRequests } from "./normalizer";

type Octokit = InstanceType<typeof GitHub>;

const PAGE_SIZE = 50;

/** Maximum wall-clock time (ms) the entire pagination loop is allowed to run. */
const MAX_PAGINATION_TIME_MS = PAGINATION_TIME_LIMIT_MINUTES * 60 * 1000;

/**
 * Fetches all pull requests within the configured date range using
 * cursor-based pagination. Stops when:
 * - maxPRs is reached
 * - PR createdAt is before config.since
 * - No more pages
 * - Wall-clock time exceeds MAX_PAGINATION_TIME_MS (returns partial results)
 */
export async function fetchAllPullRequests(
  octokit: Octokit,
  config: ActionConfig,
): Promise<CollectionResult> {
  const allNodes: RawPullRequestNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;
  let partialData = false;
  const startTime = Date.now();

  logger.info(
    `Fetching pull requests for ${config.owner}/${config.repo} ` +
      `(since: ${config.since}, until: ${config.until}, max: ${config.maxPRs})`,
  );

  const sinceDate = new Date(config.since);
  const untilDate = new Date(config.until);

  while (hasNextPage && allNodes.length < config.maxPRs) {
    pageCount++;
    const variables: PullRequestsQueryVariables = {
      owner: config.owner,
      repo: config.repo,
      after: cursor,
      pageSize: Math.min(PAGE_SIZE, config.maxPRs - allNodes.length),
      maxReviews: MAX_REVIEWS_PER_PR,
      maxReviewRequests: MAX_REVIEW_REQUESTS_PER_PR,
    };

    const response = await retry(async () => {
      return octokit.graphql<PullRequestsQueryResponse>(PULL_REQUESTS_QUERY, {
        ...variables,
      });
    });

    const { rateLimit, repository } = response;
    checkRateLimit(rateLimit);

    const { pageInfo, nodes } = repository.pullRequests;
    logger.debug(
      `Page ${pageCount}: fetched ${nodes.length} PRs ` +
        `(rate limit remaining: ${rateLimit.remaining}, cost: ${rateLimit.cost})`,
    );

    let reachedDateBoundary = false;

    for (const node of nodes) {
      const createdAt = new Date(node.createdAt);

      // Skip PRs created after our "until" date
      if (createdAt > untilDate) {
        continue;
      }

      // Stop if we've gone past our "since" date (results are ordered DESC)
      if (createdAt < sinceDate) {
        reachedDateBoundary = true;
        break;
      }

      allNodes.push(node);

      if (allNodes.length >= config.maxPRs) {
        break;
      }
    }

    if (reachedDateBoundary) {
      logger.info(
        `Reached date boundary (${config.since}). Stopping pagination.`,
      );
      break;
    }

    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;

    // Space requests apart to be a good API citizen.
    // When remaining is 0, calculateDelay waits until reset to avoid futile 403s.
    if (hasNextPage && allNodes.length < config.maxPRs) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= MAX_PAGINATION_TIME_MS) {
        partialData = true;
        logger.warning(
          `Pagination time limit reached (${Math.ceil(elapsed / 60_000)} minutes). ` +
            `Returning ${allNodes.length} PRs collected so far.`,
        );
        break;
      }

      const delay = calculateDelay(rateLimit);
      await sleep(delay);
    }
  }

  logger.info(
    `Fetched ${allNodes.length} pull requests across ${pageCount} page(s).`,
  );

  return {
    pullRequests: normalizePullRequests(allNodes),
    partialData,
    partialDataReason: partialData ? "pagination-time-limit" : null,
  };
}
