import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllPullRequests } from "../../src/collect/fetcher";
import type { PullRequestsQueryResponse } from "../../src/collect/graphql-queries";
import type { ActionConfig } from "../../src/types";
import fixtureDataJson from "../fixtures/sample-graphql-response.json";

const fixtureData = fixtureDataJson as unknown as PullRequestsQueryResponse;

// Mock the logger to suppress output during tests
vi.mock("../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock rate-limit utilities to avoid real delays
vi.mock("../../src/utils/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  calculateDelay: vi.fn(() => 0),
  retry: vi.fn((fn: () => Promise<unknown>) => fn()),
  sleep: vi.fn(() => Promise.resolve()),
}));

function makeConfig(overrides?: Partial<ActionConfig>): ActionConfig {
  return {
    token: "fake-token",
    owner: "test-owner",
    repo: "test-repo",
    since: "2025-05-01T00:00:00Z",
    until: "2025-07-01T00:00:00Z",
    outputModes: [
      "summary",
    ],
    biasThreshold: 2.0,
    includeBots: true,
    maxPRs: 500,
    ...overrides,
  };
}

function makeOctokit(responses: PullRequestsQueryResponse[]): {
  graphql: ReturnType<typeof vi.fn>;
} {
  const graphqlMock = vi.fn();
  for (const response of responses) {
    graphqlMock.mockResolvedValueOnce(response);
  }
  return {
    graphql: graphqlMock,
  };
}

function makePageResponse(
  nodes: PullRequestsQueryResponse["repository"]["pullRequests"]["nodes"],
  hasNextPage: boolean,
  endCursor: string | null,
  remaining = 4900,
): PullRequestsQueryResponse {
  return {
    rateLimit: {
      remaining,
      resetAt: "2025-06-15T12:00:00Z",
      cost: 5,
    },
    repository: {
      pullRequests: {
        pageInfo: {
          hasNextPage,
          endCursor,
        },
        nodes,
      },
    },
  };
}

describe("fetchAllPullRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("basic fetching", () => {
    it("returns normalized pull requests from fixture data", async () => {
      const octokit = makeOctokit([
        fixtureData,
      ]);
      const config = makeConfig();

      const result = await fetchAllPullRequests(octokit as never, config);

      expect(result.pullRequests.length).toBe(5);
      expect(result.partialData).toBe(false);
      expect(result.partialDataReason).toBeNull();
      expect(octokit.graphql).toHaveBeenCalledTimes(1);
    });

    it("passes correct variables to graphql", async () => {
      const octokit = makeOctokit([
        fixtureData,
      ]);
      const config = makeConfig({
        owner: "my-org",
        repo: "my-repo",
      });

      await fetchAllPullRequests(octokit as never, config);

      expect(octokit.graphql).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          owner: "my-org",
          repo: "my-repo",
          after: null,
          pageSize: expect.any(Number),
        }),
      );
    });
  });

  describe("pagination", () => {
    it("fetches multiple pages when hasNextPage is true", async () => {
      const page1Nodes = fixtureData.repository.pullRequests.nodes.slice(0, 3);
      const page2Nodes = fixtureData.repository.pullRequests.nodes.slice(3, 5);

      const octokit = makeOctokit([
        makePageResponse(page1Nodes, true, "cursor-page1"),
        makePageResponse(page2Nodes, false, null),
      ]);

      const config = makeConfig();
      const result = await fetchAllPullRequests(octokit as never, config);

      expect(octokit.graphql).toHaveBeenCalledTimes(2);
      expect(result.pullRequests.length).toBe(5);
      expect(result.partialData).toBe(false);

      // Second call should use the cursor from the first page
      expect(octokit.graphql).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({
          after: "cursor-page1",
        }),
      );
    });

    it("stops when hasNextPage is false", async () => {
      const octokit = makeOctokit([
        makePageResponse(
          fixtureData.repository.pullRequests.nodes,
          false,
          null,
        ),
      ]);

      const config = makeConfig();
      await fetchAllPullRequests(octokit as never, config);

      expect(octokit.graphql).toHaveBeenCalledTimes(1);
    });
  });

  describe("maxPRs limit", () => {
    it("marks the dataset as capped when additional in-range PRs exist after maxPRs", async () => {
      const octokit = makeOctokit([
        makePageResponse(
          fixtureData.repository.pullRequests.nodes,
          false,
          null,
        ),
      ]);

      const config = makeConfig({
        maxPRs: 3,
      });
      const result = await fetchAllPullRequests(octokit as never, config);

      expect(result.pullRequests.length).toBe(3);
      expect(result.partialData).toBe(true);
      expect(result.partialDataReason).toBe("max-prs-limit-reached");
      expect(octokit.graphql).toHaveBeenCalledTimes(1);
    });

    it("marks the dataset as capped when maxPRs is reached exactly and more pages exist", async () => {
      const octokit = makeOctokit([
        makePageResponse(
          fixtureData.repository.pullRequests.nodes.slice(0, 3),
          true,
          "cursor-1",
        ),
      ]);

      const config = makeConfig({
        maxPRs: 3,
      });
      const result = await fetchAllPullRequests(octokit as never, config);

      expect(result.pullRequests.length).toBe(3);
      expect(result.partialData).toBe(true);
      expect(result.partialDataReason).toBe("max-prs-limit-reached");
      expect(octokit.graphql).toHaveBeenCalledTimes(1);
    });

    it("does not mark the dataset as capped when the extra sentinel PR is outside the date range", async () => {
      const sentinel = fixtureData.repository.pullRequests.nodes[3];
      if (sentinel === undefined) {
        throw new Error("Missing sentinel PR fixture");
      }

      const octokit = makeOctokit([
        makePageResponse(
          [
            ...fixtureData.repository.pullRequests.nodes.slice(0, 3),
            {
              ...sentinel,
              createdAt: "2025-04-01T00:00:00Z",
            },
          ],
          true,
          "cursor-1",
        ),
      ]);

      const config = makeConfig({
        maxPRs: 3,
      });
      const result = await fetchAllPullRequests(octokit as never, config);

      expect(result.pullRequests.length).toBe(3);
      expect(result.partialData).toBe(false);
      expect(result.partialDataReason).toBeNull();
      expect(octokit.graphql).toHaveBeenCalledTimes(1);
    });

    it("requests one extra PR on the final page to detect maxPRs truncation", async () => {
      const octokit = makeOctokit([
        makePageResponse(
          fixtureData.repository.pullRequests.nodes.slice(0, 3),
          false,
          null,
        ),
      ]);

      const config = makeConfig({
        maxPRs: 2,
      });
      await fetchAllPullRequests(octokit as never, config);

      expect(octokit.graphql).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          pageSize: 3,
        }),
      );
    });
  });

  describe("rate limit checking", () => {
    it("calls checkRateLimit with the response rate limit info", async () => {
      const { checkRateLimit } = await import("../../src/utils/rate-limit");

      const octokit = makeOctokit([
        fixtureData,
      ]);
      const config = makeConfig();

      await fetchAllPullRequests(octokit as never, config);

      expect(checkRateLimit).toHaveBeenCalledWith({
        remaining: 4950,
        resetAt: "2025-06-15T12:00:00Z",
        cost: 5,
      });
    });
  });

  describe("pagination time limit", () => {
    it("stops before issuing the next request when the loop starts over budget", async () => {
      const { logger } = await import("../../src/utils/logger");

      const baseTime = 1_000_000_000;
      let callCount = 0;
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        if (callCount <= 3) return baseTime;
        return baseTime + 11 * 60 * 1000;
      });

      try {
        const page1Nodes = fixtureData.repository.pullRequests.nodes.slice(
          0,
          3,
        );

        const octokit = makeOctokit([
          makePageResponse(page1Nodes, true, "cursor-page1"),
          makePageResponse(
            fixtureData.repository.pullRequests.nodes.slice(3, 5),
            false,
            null,
          ),
        ]);

        const result = await fetchAllPullRequests(
          octokit as never,
          makeConfig(),
        );

        expect(octokit.graphql).toHaveBeenCalledTimes(1);
        expect(result.pullRequests.length).toBe(3);
        expect(result.partialData).toBe(true);
        expect(result.partialDataReason).toBe("pagination-time-limit");
        expect(logger.warning).toHaveBeenCalledWith(
          "Pagination time limit reached after 11m 0s. Returning 3 PRs collected so far.",
        );
      } finally {
        nowSpy.mockRestore();
      }
    });

    it("stops pagination when wall-clock time exceeds the limit", async () => {
      const { logger } = await import("../../src/utils/logger");

      // 1st call captures startTime, 2nd checks the initial loop budget,
      // 3rd checks elapsed after the first page is fetched.
      const baseTime = 1_000_000_000;
      let callCount = 0;
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return baseTime;
        return baseTime + 11 * 60 * 1000;
      });

      try {
        const page1Nodes = fixtureData.repository.pullRequests.nodes.slice(
          0,
          3,
        );

        const octokit = makeOctokit([
          makePageResponse(page1Nodes, true, "cursor-page1"),
          makePageResponse(
            fixtureData.repository.pullRequests.nodes.slice(3, 5),
            false,
            null,
          ),
        ]);

        const config = makeConfig();
        const result = await fetchAllPullRequests(octokit as never, config);

        // Should only have fetched the first page before hitting the time limit
        expect(octokit.graphql).toHaveBeenCalledTimes(1);
        expect(result.pullRequests.length).toBe(3);
        expect(result.partialData).toBe(true);
        expect(result.partialDataReason).toBe("pagination-time-limit");
        expect(logger.warning).toHaveBeenCalledWith(
          "Pagination time limit reached after 11m 0s. Returning 3 PRs collected so far.",
        );
      } finally {
        nowSpy.mockRestore();
      }
    });

    it("stops before sleeping past the remaining wall-clock budget", async () => {
      const { calculateDelay, sleep } = await import(
        "../../src/utils/rate-limit"
      );
      const { logger } = await import("../../src/utils/logger");

      const baseTime = 1_000_000_000;
      let callCount = 0;
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        if (callCount === 1) return baseTime;
        return baseTime + 9 * 60 * 1000 + 30_000;
      });

      try {
        vi.mocked(calculateDelay).mockReturnValueOnce(45_000);

        const page1Nodes = fixtureData.repository.pullRequests.nodes.slice(
          0,
          3,
        );
        const octokit = makeOctokit([
          makePageResponse(page1Nodes, true, "cursor-page1"),
          makePageResponse(
            fixtureData.repository.pullRequests.nodes.slice(3, 5),
            false,
            null,
          ),
        ]);

        const result = await fetchAllPullRequests(
          octokit as never,
          makeConfig(),
        );

        expect(octokit.graphql).toHaveBeenCalledTimes(1);
        expect(result.pullRequests.length).toBe(3);
        expect(result.partialData).toBe(true);
        expect(result.partialDataReason).toBe(
          "pagination-delay-budget-exceeded",
        );
        expect(calculateDelay).toHaveBeenCalledOnce();
        expect(sleep).not.toHaveBeenCalled();
        expect(logger.warning).toHaveBeenCalledWith(
          "Skipping a 45s rate-limit delay because only 30s remain in the 10-minute collection budget. Returning 3 PRs collected so far.",
        );
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  describe("date boundary", () => {
    it("skips PRs created after config.until", async () => {
      const futurePr = fixtureData.repository.pullRequests.nodes[0];
      if (futurePr === undefined) {
        throw new Error("Missing future PR fixture");
      }

      const nodesWithFuturePR = [
        {
          ...futurePr,
          createdAt: "2025-08-01T00:00:00Z",
        },
        ...fixtureData.repository.pullRequests.nodes.slice(1, 3),
      ];

      const octokit = makeOctokit([
        makePageResponse(nodesWithFuturePR, false, null),
      ]);

      const config = makeConfig({
        until: "2025-07-01T00:00:00Z",
      });
      const result = await fetchAllPullRequests(octokit as never, config);

      // The future PR should be skipped
      expect(result.pullRequests.length).toBe(2);
    });

    it("stops when PR createdAt is before config.since", async () => {
      const oldPr = fixtureData.repository.pullRequests.nodes[2];
      if (oldPr === undefined) {
        throw new Error("Missing old PR fixture");
      }

      const nodesWithOldPR = [
        ...fixtureData.repository.pullRequests.nodes.slice(0, 2),
        {
          ...oldPr,
          createdAt: "2025-04-01T00:00:00Z",
        },
      ];

      const octokit = makeOctokit([
        makePageResponse(nodesWithOldPR, true, "cursor-1"),
      ]);

      const config = makeConfig({
        since: "2025-05-01T00:00:00Z",
      });
      const result = await fetchAllPullRequests(octokit as never, config);

      // Should stop before the old PR and not request another page
      expect(result.pullRequests.length).toBe(2);
      expect(octokit.graphql).toHaveBeenCalledTimes(1);
    });
  });
});
