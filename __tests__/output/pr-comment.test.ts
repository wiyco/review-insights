import { describe, expect, it, vi } from "vitest";
import { postPRComment } from "../../src/output/pr-comment";
import type { AnalysisResult } from "../../src/types";
import { EMPTY_BURDEN } from "../fixtures/empty-burden";

vi.mock("../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../src/utils/rate-limit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/utils/rate-limit")>();
  return {
    ...actual,
    retry: vi.fn((fn: () => Promise<unknown>) => fn()),
  };
});

function makeOctokit(
  existingComments: {
    id: number;
    body: string;
  }[] = [],
) {
  const createComment = vi.fn();
  const updateComment = vi.fn();
  const paginate = vi.fn().mockResolvedValue(existingComments);
  return {
    mock: {
      createComment,
      updateComment,
      paginate,
    },
    octokit: {
      paginate,
      rest: {
        issues: {
          listComments: "listComments",
          createComment,
          updateComment,
        },
      },
    },
  };
}

function makeAnalysis(): AnalysisResult {
  return {
    userStats: [
      {
        login: "alice",
        reviewsGiven: 10,
        reviewsReceived: 5,
        approvals: 8,
        changeRequests: 2,
        comments: 3,
        dismissed: 0,
        avgTimeToFirstReviewMs: 3600000,
        medianTimeToFirstReviewMs: 3600000,
      },
      {
        login: "bob",
        reviewsGiven: 7,
        reviewsReceived: 3,
        approvals: 5,
        changeRequests: 1,
        comments: 2,
        dismissed: 0,
        avgTimeToFirstReviewMs: 7200000,
        medianTimeToFirstReviewMs: 7200000,
      },
    ],
    mergeCorrelations: [],
    bias: {
      matrix: new Map(),
      flaggedPairs: [],
      giniCoefficient: 0.3,
    },
    aiPatterns: {
      botReviewers: [],
      coAuthoredPRs: 0,
      totalPRs: 10,
      botReviewPercentage: 0,
      humanReviewBurden: EMPTY_BURDEN,
    },
    pullRequests: [],
    dateRange: {
      since: "2025-01-01T00:00:00Z",
      until: "2025-06-01T00:00:00Z",
    },
    biasThreshold: 2.0,
    includeBots: false,
  };
}

describe("postPRComment", () => {
  it("creates a new comment when no existing comment is found", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();

    await postPRComment(octokit as never, "my-org", "my-repo", 42, analysis);

    expect(mock.createComment).toHaveBeenCalledOnce();
    expect(mock.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "my-org",
        repo: "my-repo",
        issue_number: 42,
        body: expect.stringContaining("review-insights-report"),
      }),
    );
    expect(mock.updateComment).not.toHaveBeenCalled();
  });

  it("updates an existing comment when the marker is found", async () => {
    const existing = [
      {
        id: 999,
        body: "<!-- review-insights-report -->\nold content",
      },
    ];
    const { mock, octokit } = makeOctokit(existing);
    const analysis = makeAnalysis();

    await postPRComment(octokit as never, "my-org", "my-repo", 42, analysis);

    expect(mock.updateComment).toHaveBeenCalledOnce();
    expect(mock.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "my-org",
        repo: "my-repo",
        comment_id: 999,
      }),
    );
    expect(mock.createComment).not.toHaveBeenCalled();
  });

  it("comment body contains the marker <!-- review-insights-report -->", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("<!-- review-insights-report -->");
  });

  it("comment body contains user stats with login names", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("alice");
    expect(body).toContain("bob");
  });

  it("comment body contains date range", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("2025-01-01T00:00:00Z");
    expect(body).toContain("2025-06-01T00:00:00Z");
  });

  it("comment body contains Gini coefficient", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("0.30");
  });

  it("throws a helpful message on permission error (403 non-rate-limit)", async () => {
    const { mock, octokit } = makeOctokit([]);
    mock.createComment.mockRejectedValue({
      status: 403,
      message: "Resource not accessible by integration",
    });
    const analysis = makeAnalysis();

    await expect(
      postPRComment(octokit as never, "my-org", "my-repo", 1, analysis),
    ).rejects.toThrow("pull-requests: write");
  });

  it("re-throws rate limit 403 errors without wrapping", async () => {
    const { mock, octokit } = makeOctokit([]);
    const rateLimitError = {
      status: 403,
      message: "You have exceeded a secondary rate limit",
    };
    mock.createComment.mockRejectedValue(rateLimitError);
    const analysis = makeAnalysis();

    await expect(
      postPRComment(octokit as never, "my-org", "my-repo", 1, analysis),
    ).rejects.toBe(rateLimitError);
  });

  it("re-throws non-403 errors as-is", async () => {
    const { mock, octokit } = makeOctokit([]);
    const serverError = {
      status: 500,
      message: "Internal Server Error",
    };
    mock.createComment.mockRejectedValue(serverError);
    const analysis = makeAnalysis();

    await expect(
      postPRComment(octokit as never, "my-org", "my-repo", 1, analysis),
    ).rejects.toBe(serverError);
  });

  it("does not treat null errors as permission errors", async () => {
    const { mock, octokit } = makeOctokit([]);
    mock.createComment.mockRejectedValue(null);
    const analysis = makeAnalysis();

    await expect(
      postPRComment(octokit as never, "my-org", "my-repo", 1, analysis),
    ).rejects.toBeNull();
  });

  it("does not treat string errors as permission errors", async () => {
    const { mock, octokit } = makeOctokit([]);
    mock.createComment.mockRejectedValue("some string error");
    const analysis = makeAnalysis();

    await expect(
      postPRComment(octokit as never, "my-org", "my-repo", 1, analysis),
    ).rejects.toBe("some string error");
  });

  it("comment body shows ellipsis for more than 10 truncated PRs", async () => {
    const { mock, octokit } = makeOctokit([]);
    const reviews = Array.from(
      {
        length: 100,
      },
      (_, i) => ({
        reviewer: `r${i}`,
        reviewerIsBot: false,
        author: "alice",
        state: "APPROVED" as const,
        createdAt: "2025-06-02T12:00:00Z",
        prNumber: 1,
      }),
    );
    const analysis = makeAnalysis();
    analysis.pullRequests = Array.from(
      {
        length: 12,
      },
      (_, i) => ({
        number: i + 1,
        title: "PR",
        state: "MERGED" as const,
        author: "alice",
        authorIsBot: false,
        createdAt: "2025-06-01T00:00:00Z",
        mergedAt: "2025-06-02T00:00:00Z",
        closedAt: "2025-06-02T00:00:00Z",
        mergedBy: null,
        reviews,
        reviewRequests: [],
        commitMessages: [],
        additions: 10,
        deletions: 5,
        aiCategory: "human-only",
      }),
    );

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain(", ...");
  });

  it("re-throws 403 with 'abuse detection' message (rate limit, not permission)", async () => {
    const { mock, octokit } = makeOctokit([]);
    const error = {
      status: 403,
      message: "You triggered an abuse detection mechanism",
    };
    mock.createComment.mockRejectedValue(error);
    const analysis = makeAnalysis();

    await expect(
      postPRComment(octokit as never, "my-org", "my-repo", 1, analysis),
    ).rejects.toBe(error);
  });

  it("comment body contains truncation warning for PRs with many reviews", async () => {
    const { mock, octokit } = makeOctokit([]);
    const reviews = Array.from(
      {
        length: 100,
      },
      (_, i) => ({
        reviewer: `r${i}`,
        reviewerIsBot: false,
        author: "alice",
        state: "APPROVED" as const,
        createdAt: "2025-06-02T12:00:00Z",
        prNumber: 42,
      }),
    );
    const analysis = makeAnalysis();
    analysis.pullRequests = [
      {
        number: 42,
        title: "PR",
        state: "MERGED",
        author: "alice",
        authorIsBot: false,
        createdAt: "2025-06-01T00:00:00Z",
        mergedAt: "2025-06-02T00:00:00Z",
        closedAt: "2025-06-02T00:00:00Z",
        mergedBy: null,
        reviews,
        reviewRequests: [],
        commitMessages: [],
        additions: 10,
        deletions: 5,
        aiCategory: "human-only",
      },
    ];

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("Warning:");
    expect(body).toContain("#42");
  });

  it("sorts bias warnings by zScore descending in comment body", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();
    analysis.bias = {
      matrix: new Map(),
      flaggedPairs: [
        {
          reviewer: "low",
          author: "a1",
          count: 5,
          zScore: 2.0,
        },
        {
          reviewer: "high",
          author: "a2",
          count: 10,
          zScore: 4.0,
        },
      ],
      giniCoefficient: 0.5,
    };

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    const highIdx = body.indexOf("high");
    const lowIdx = body.indexOf("low");
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("comment body contains bias warnings when flaggedPairs exist", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();
    analysis.bias = {
      matrix: new Map(),
      flaggedPairs: [
        {
          reviewer: "alice",
          author: "bob",
          count: 15,
          zScore: 3.5,
        },
      ],
      giniCoefficient: 0.5,
    };

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("Bias Warnings");
    expect(body).toContain("alice");
    expect(body).toContain("3.50");
  });

  it("comment body shows N/A for avgTimeToFirstReviewMs null", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();
    analysis.userStats[0].avgTimeToFirstReviewMs = null;

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("N/A");
  });

  it("comment body contains Median 1st Review column header and formatted value", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();
    analysis.userStats = [
      {
        ...analysis.userStats[0],
        avgTimeToFirstReviewMs: 3600000,
        medianTimeToFirstReviewMs: 7200000,
      },
    ];

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("Median 1st Review");
    // avg=1.0h then median=2.0h in the same row, pipe-separated
    expect(body).toMatch(/1\.0h \| 2\.0h/);
  });

  it("comment body shows N/A for null medianTimeToFirstReviewMs", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();
    analysis.userStats = [
      {
        ...analysis.userStats[0],
        avgTimeToFirstReviewMs: null,
        medianTimeToFirstReviewMs: null,
      },
    ];

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("Median 1st Review");
    // Both avg and median null → row contains two N/A values
    expect(body).toMatch(/N\/A \| N\/A/);
  });

  it("excludes bot-authored PRs from totalPRs when includeBots is false", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();
    analysis.includeBots = false;
    analysis.pullRequests = [
      {
        number: 1,
        title: "Human PR",
        state: "MERGED",
        author: "alice",
        authorIsBot: false,
        createdAt: "2025-06-01T00:00:00Z",
        mergedAt: "2025-06-02T00:00:00Z",
        closedAt: "2025-06-02T00:00:00Z",
        mergedBy: null,
        reviews: [],
        reviewRequests: [],
        commitMessages: [],
        additions: 10,
        deletions: 5,
        aiCategory: "human-only",
      },
      {
        number: 2,
        title: "Bot PR",
        state: "MERGED",
        author: "dependabot[bot]",
        authorIsBot: true,
        createdAt: "2025-06-01T00:00:00Z",
        mergedAt: "2025-06-02T00:00:00Z",
        closedAt: "2025-06-02T00:00:00Z",
        mergedBy: null,
        reviews: [],
        reviewRequests: [],
        commitMessages: [],
        additions: 10,
        deletions: 5,
        aiCategory: "human-only",
      },
    ];

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("| Total PRs analyzed | 1 |");
  });

  it("includes bot-authored PRs in totalPRs when includeBots is true", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();
    analysis.includeBots = true;
    analysis.pullRequests = [
      {
        number: 1,
        title: "Human PR",
        state: "MERGED",
        author: "alice",
        authorIsBot: false,
        createdAt: "2025-06-01T00:00:00Z",
        mergedAt: "2025-06-02T00:00:00Z",
        closedAt: "2025-06-02T00:00:00Z",
        mergedBy: null,
        reviews: [],
        reviewRequests: [],
        commitMessages: [],
        additions: 10,
        deletions: 5,
        aiCategory: "human-only",
      },
      {
        number: 2,
        title: "Bot PR",
        state: "MERGED",
        author: "dependabot[bot]",
        authorIsBot: true,
        createdAt: "2025-06-01T00:00:00Z",
        mergedAt: "2025-06-02T00:00:00Z",
        closedAt: "2025-06-02T00:00:00Z",
        mergedBy: null,
        reviews: [],
        reviewRequests: [],
        commitMessages: [],
        additions: 10,
        deletions: 5,
        aiCategory: "human-only",
      },
    ];

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("| Total PRs analyzed | 2 |");
  });

  it("excludes bot-authored PRs from truncation warning when includeBots is false", async () => {
    const { mock, octokit } = makeOctokit([]);
    const reviews = Array.from(
      {
        length: 100,
      },
      (_, i) => ({
        reviewer: `r${i}`,
        reviewerIsBot: false,
        author: "bot",
        state: "APPROVED" as const,
        createdAt: "2025-06-02T12:00:00Z",
        prNumber: 99,
      }),
    );
    const analysis = makeAnalysis();
    analysis.includeBots = false;
    analysis.pullRequests = [
      {
        number: 99,
        title: "Bot PR with many reviews",
        state: "MERGED",
        author: "dependabot[bot]",
        authorIsBot: true,
        createdAt: "2025-06-01T00:00:00Z",
        mergedAt: "2025-06-02T00:00:00Z",
        closedAt: "2025-06-02T00:00:00Z",
        mergedBy: null,
        reviews,
        reviewRequests: [],
        commitMessages: [],
        additions: 10,
        deletions: 5,
        aiCategory: "human-only",
      },
    ];

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).not.toContain("Warning:");
  });

  it("comment body shows N/A for top reviewer when userStats is empty", async () => {
    const { mock, octokit } = makeOctokit([]);
    const analysis = makeAnalysis();
    analysis.userStats = [];

    await postPRComment(octokit as never, "my-org", "my-repo", 1, analysis);

    const body = mock.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("N/A");
  });
});
