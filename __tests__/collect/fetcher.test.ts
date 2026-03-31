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
        makePageResponse(
          page1Nodes as PullRequestsQueryResponse["repository"]["pullRequests"]["nodes"],
          true,
          "cursor-page1",
        ),
        makePageResponse(
          page2Nodes as PullRequestsQueryResponse["repository"]["pullRequests"]["nodes"],
          false,
          null,
        ),
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
    it("stops fetching when maxPRs is reached", async () => {
      const octokit = makeOctokit([
        makePageResponse(
          fixtureData.repository.pullRequests.nodes,
          true,
          "cursor-1",
        ),
      ]);

      const config = makeConfig({
        maxPRs: 3,
      });
      const result = await fetchAllPullRequests(octokit as never, config);

      // Should stop after collecting 3 PRs even though hasNextPage was true
      expect(result.pullRequests.length).toBe(3);
      expect(octokit.graphql).toHaveBeenCalledTimes(1);
    });

    it("adjusts pageSize to not exceed maxPRs", async () => {
      const octokit = makeOctokit([
        makePageResponse(
          fixtureData.repository.pullRequests.nodes.slice(0, 2),
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
          pageSize: 2,
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
    it("stops pagination when wall-clock time exceeds the limit", async () => {
      // First call to Date.now() captures startTime; second checks elapsed.
      const baseTime = 1_000_000_000;
      let callCount = 0;
      vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        // 1st call: startTime capture. Return base.
        // 2nd+ calls: elapsed check. Jump past 10 minutes.
        if (callCount <= 1) return baseTime;
        return baseTime + 11 * 60 * 1000;
      });

      const page1Nodes = fixtureData.repository.pullRequests.nodes.slice(0, 3);

      const octokit = makeOctokit([
        makePageResponse(
          page1Nodes as PullRequestsQueryResponse["repository"]["pullRequests"]["nodes"],
          true,
          "cursor-page1",
        ),
        makePageResponse(
          fixtureData.repository.pullRequests.nodes.slice(
            3,
            5,
          ) as PullRequestsQueryResponse["repository"]["pullRequests"]["nodes"],
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

      vi.spyOn(Date, "now").mockRestore();
    });
  });

  describe("date boundary", () => {
    it("skips PRs created after config.until", async () => {
      const nodesWithFuturePR = [
        {
          ...fixtureData.repository.pullRequests.nodes[0],
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
      const nodesWithOldPR = [
        ...fixtureData.repository.pullRequests.nodes.slice(0, 2),
        {
          ...fixtureData.repository.pullRequests.nodes[2],
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
