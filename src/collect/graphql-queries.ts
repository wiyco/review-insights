/** Maximum number of reviews fetched per PR by the GraphQL query. */
export const MAX_REVIEWS_PER_PR = 100;

/** Maximum number of review requests fetched per PR by the GraphQL query. */
export const MAX_REVIEW_REQUESTS_PER_PR = 50;

/**
 * GraphQL query to fetch pull requests with reviews, review requests,
 * and commit messages for a repository.
 *
 * All values are passed via GraphQL variables — NEVER interpolated
 * into the query string.
 *
 * @see {@link https://docs.github.com/en/graphql/reference/objects#pullrequest} PullRequest
 * @see {@link https://docs.github.com/en/graphql/reference/objects#pullrequestreviewconnection} reviews
 * @see {@link https://docs.github.com/en/graphql/reference/objects#reviewrequest} reviewRequests
 * @see {@link https://docs.github.com/en/graphql/reference/objects#commit} commits
 * @see {@link https://docs.github.com/en/graphql/reference/objects#ratelimit} rateLimit
 */
export const PULL_REQUESTS_QUERY = `
  query PullRequests($owner: String!, $repo: String!, $after: String, $pageSize: Int!, $maxReviews: Int!, $maxReviewRequests: Int!) {
    rateLimit {
      remaining
      resetAt
      cost
    }
    repository(owner: $owner, name: $repo) {
      pullRequests(
        first: $pageSize
        after: $after
        orderBy: { field: CREATED_AT, direction: DESC }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          title
          state
          createdAt
          mergedAt
          closedAt
          author {
            login
            __typename
          }
          mergedBy {
            login
          }
          reviews(first: $maxReviews) {
            nodes {
              author {
                login
                __typename
              }
              state
              createdAt
            }
          }
          reviewRequests(first: $maxReviewRequests) {
            nodes {
              requestedReviewer {
                ... on User {
                  login
                }
                ... on Team {
                  name
                }
                ... on Mannequin {
                  login
                }
              }
            }
          }
          # NOTE: last:1 may return a merge commit for merged PRs.
          # Co-authored-by detection from commit messages may be affected.
          commits(last: 1) {
            nodes {
              commit {
                message
              }
            }
          }
        }
      }
    }
  }
`;

/** Variables passed to the PullRequests GraphQL query. */
export interface PullRequestsQueryVariables {
  owner: string;
  repo: string;
  after: string | null;
  pageSize: number;
  maxReviews: number;
  maxReviewRequests: number;
}

/**
 * Raw rate limit info returned by the GitHub GraphQL API.
 * @see {@link https://docs.github.com/en/graphql/reference/objects#ratelimit}
 */
export interface RawRateLimit {
  remaining: number;
  resetAt: string;
  cost: number;
}

/** Raw author object from GraphQL, includes __typename for bot detection. */
export interface RawAuthor {
  login: string;
  __typename: string;
}

/**
 * Raw review node from the GraphQL response.
 * @see {@link https://docs.github.com/en/graphql/reference/objects#pullrequestreview}
 */
export interface RawReview {
  author: RawAuthor | null;
  state: string;
  createdAt: string;
}

/**
 * Raw review request node (may be a User, Team, or Mannequin).
 * @see {@link https://docs.github.com/en/graphql/reference/objects#reviewrequest}
 */
export interface RawReviewRequest {
  requestedReviewer: {
    login?: string;
    name?: string;
  } | null;
}

/** Raw commit node containing the commit message. */
export interface RawCommitNode {
  commit: {
    message: string;
  };
}

/**
 * Raw pull request node as returned by the GraphQL query.
 * @see {@link https://docs.github.com/en/graphql/reference/objects#pullrequest}
 */
export interface RawPullRequestNode {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  author: RawAuthor | null;
  mergedBy: {
    login: string;
  } | null;
  reviews: {
    nodes: RawReview[];
  };
  reviewRequests: {
    nodes: RawReviewRequest[];
  };
  commits: {
    nodes: RawCommitNode[];
  };
}

/** Top-level shape of the PullRequests GraphQL query response. */
export interface PullRequestsQueryResponse {
  rateLimit: RawRateLimit;
  repository: {
    pullRequests: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: RawPullRequestNode[];
    };
  };
}
