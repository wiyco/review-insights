import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_BURDEN } from "./fixtures/empty-burden";

const setOutput = vi.fn();
const setFailed = vi.fn();
const coreError = vi.fn();
const githubContext: {
  payload: {
    pull_request?: {
      number: number;
    };
  };
} = {
  payload: {
    pull_request: {
      number: 42,
    },
  },
};

const getConfig = vi.fn();
const getOctokit = vi.fn();
const fetchAllPullRequests = vi.fn();
const applyObservationWindow = vi.fn();
const computeUserStats = vi.fn();
const computeMergeCorrelations = vi.fn();
const computeTopReviewerSummary = vi.fn();
const detectBias = vi.fn();
const analyzeAIPatterns = vi.fn();
const processOutputModes = vi.fn();
const generateHtmlReport = vi.fn();
const mkdtemp = vi.fn();
const writeFile = vi.fn();
const rm = vi.fn();

vi.mock("@actions/core", () => ({
  setOutput,
  setFailed,
  error: coreError,
}));

vi.mock("@actions/github", () => ({
  getOctokit,
  context: githubContext,
}));

vi.mock("node:fs/promises", () => ({
  mkdtemp,
  writeFile,
  rm,
}));

vi.mock("node:os", () => ({
  tmpdir: () => "/tmp",
}));

vi.mock("../src/inputs", () => ({
  getConfig,
}));

vi.mock("../src/collect/fetcher", () => ({
  fetchAllPullRequests,
}));

vi.mock("../src/collect/observation-window", () => ({
  applyObservationWindow,
}));

vi.mock("../src/analyze/per-user-stats", () => ({
  computeUserStats,
}));

vi.mock("../src/analyze/merge-correlation", () => ({
  computeMergeCorrelations,
}));

vi.mock("../src/analyze/top-reviewers", () => ({
  computeTopReviewerSummary,
}));

vi.mock("../src/analyze/bias-detector", () => ({
  detectBias,
}));

vi.mock("../src/analyze/ai-patterns", () => ({
  analyzeAIPatterns,
}));

vi.mock("../src/output/process-output-modes", () => ({
  processOutputModes,
}));

vi.mock("../src/visualize/html-report", () => ({
  generateHtmlReport,
}));

vi.mock("../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

async function importMain(): Promise<void> {
  await import("../src/main");
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("main", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    githubContext.payload.pull_request = {
      number: 42,
    };

    getConfig.mockReturnValue({
      token: "fake-token",
      owner: "test-owner",
      repo: "test-repo",
      since: "2025-01-01T00:00:00Z",
      until: "2025-06-01T00:00:00Z",
      outputModes: [
        "summary",
      ],
      biasThreshold: 2,
      includeBots: false,
      maxPRs: 500,
    });

    getOctokit.mockReturnValue({
      graphql: vi.fn(),
    });

    const pullRequests = [
      {
        number: 1,
        title: "Test PR",
        state: "MERGED" as const,
        author: "alice",
        authorIsBot: false,
        createdAt: "2025-05-01T00:00:00Z",
        mergedAt: "2025-05-02T00:00:00Z",
        closedAt: "2025-05-02T00:00:00Z",
        mergedBy: "bob",
        reviews: [],
        reviewRequests: [],
        commitMessages: [],
        additions: 10,
        deletions: 5,
        aiCategory: "human-only" as const,
      },
    ];

    fetchAllPullRequests.mockResolvedValue({
      pullRequests,
      partialData: true,
      partialDataReason: "pagination-time-limit",
    });
    applyObservationWindow.mockReturnValue(pullRequests);
    computeUserStats.mockReturnValue([
      {
        login: "bob",
        reviewsGiven: 1,
        reviewsReceived: 0,
        approvals: 1,
        changeRequests: 0,
        comments: 0,
        dismissed: 0,
        avgTimeToFirstReviewMs: 1000,
        medianTimeToFirstReviewMs: 1000,
      },
    ]);
    computeMergeCorrelations.mockReturnValue([]);
    computeTopReviewerSummary.mockReturnValue({
      reviewerCount: 1,
      maxReviewsGiven: 1,
      topReviewers: [
        "bob",
      ],
    });
    detectBias.mockReturnValue({
      matrix: new Map(),
      flaggedPairs: [],
      giniCoefficient: 0.2,
      modelFitError: null,
    });
    analyzeAIPatterns.mockReturnValue({
      botReviewers: [],
      aiCoAuthoredPRs: 0,
      totalPRs: 1,
      botReviewPercentage: 0,
      humanReviewBurden: EMPTY_BURDEN,
    });
    generateHtmlReport.mockReturnValue("<html></html>");
    processOutputModes.mockResolvedValue(1);
    mkdtemp.mockResolvedValue("/tmp/review-insights-abc");
    writeFile.mockResolvedValue(undefined);
    rm.mockResolvedValue(undefined);
  });

  it("sets the partial-data output and passes the state through analysis", async () => {
    await importMain();

    expect(setOutput).toHaveBeenCalledWith("partial-data", "true");
    expect(processOutputModes).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis: expect.objectContaining({
          partialData: true,
          partialDataReason: "pagination-time-limit",
        }),
      }),
    );
    expect(setFailed).not.toHaveBeenCalled();
  });

  it("sets all success outputs from the computed analysis", async () => {
    const reportPath = path.join(
      "/tmp/review-insights-abc",
      "review-insights-report.html",
    );

    detectBias.mockReturnValue({
      matrix: new Map(),
      flaggedPairs: [
        {
          author: "alice",
          reviewer: "bob",
          count: 2,
          expectedCount: 0.8,
          pearsonResidual: 2.3,
        },
      ],
      giniCoefficient: 0.2,
      modelFitError: null,
    });

    await importMain();

    expect(setOutput).toHaveBeenCalledWith("report-path", reportPath);
    expect(setOutput).toHaveBeenCalledWith("total-prs-analyzed", 1);
    expect(setOutput).toHaveBeenCalledWith(
      "top-reviewers",
      JSON.stringify([
        "bob",
      ]),
    );
    expect(setOutput).toHaveBeenCalledWith("max-reviews-given", "1");
    expect(setOutput).toHaveBeenCalledWith("bias-detected", "true");
    expect(setOutput).toHaveBeenCalledWith("partial-data", "true");
    expect(processOutputModes).toHaveBeenCalledWith(
      expect.objectContaining({
        reportPath,
        pullRequestNumber: 42,
        analysis: expect.objectContaining({
          dateRange: {
            since: "2025-01-01T00:00:00Z",
            until: "2025-06-01T00:00:00Z",
          },
          biasThreshold: 2,
          includeBots: false,
        }),
      }),
    );
  });

  it("logs bias-model unavailability even when the error message is empty", async () => {
    detectBias.mockReturnValue({
      matrix: new Map(),
      flaggedPairs: [],
      giniCoefficient: 0.2,
      modelFitError: "",
    });

    await importMain();

    const { logger } = await import("../src/utils/logger");
    expect(logger.warning).toHaveBeenCalledWith("Bias warnings unavailable: ");
  });

  it("counts bot-authored PRs when includeBots is enabled", async () => {
    const pullRequests = [
      {
        number: 1,
        title: "Human PR",
        state: "MERGED" as const,
        author: "alice",
        authorIsBot: false,
        createdAt: "2025-05-01T00:00:00Z",
        mergedAt: "2025-05-02T00:00:00Z",
        closedAt: "2025-05-02T00:00:00Z",
        mergedBy: "bob",
        reviews: [],
        reviewRequests: [],
        commitMessages: [],
        additions: 10,
        deletions: 5,
        aiCategory: "human-only" as const,
      },
      {
        number: 2,
        title: "Bot PR",
        state: "MERGED" as const,
        author: "renovate[bot]",
        authorIsBot: true,
        createdAt: "2025-05-03T00:00:00Z",
        mergedAt: "2025-05-04T00:00:00Z",
        closedAt: "2025-05-04T00:00:00Z",
        mergedBy: "bob",
        reviews: [],
        reviewRequests: [],
        commitMessages: [],
        additions: 20,
        deletions: 10,
        aiCategory: "human-only" as const,
      },
    ];

    getConfig.mockReturnValue({
      token: "fake-token",
      owner: "test-owner",
      repo: "test-repo",
      since: "2025-01-01T00:00:00Z",
      until: "2025-06-01T00:00:00Z",
      outputModes: [
        "summary",
      ],
      biasThreshold: 2,
      includeBots: true,
      maxPRs: 500,
    });
    fetchAllPullRequests.mockResolvedValue({
      pullRequests,
      partialData: false,
      partialDataReason: null,
    });
    applyObservationWindow.mockReturnValue(pullRequests);

    await importMain();

    expect(computeUserStats).toHaveBeenCalledWith(pullRequests, true);
    expect(computeMergeCorrelations).toHaveBeenCalledWith(pullRequests, true);
    expect(detectBias).toHaveBeenCalledWith(pullRequests, 2, true);
    expect(setOutput).toHaveBeenCalledWith("total-prs-analyzed", 2);
    expect(setOutput).toHaveBeenCalledWith("partial-data", "false");
  });

  it("passes an undefined pull request number outside pull_request events", async () => {
    githubContext.payload.pull_request = undefined;

    await importMain();

    expect(processOutputModes).toHaveBeenCalledWith(
      expect.objectContaining({
        pullRequestNumber: undefined,
      }),
    );
  });

  it("cleans up the temporary directory and reports non-Error write failures", async () => {
    writeFile.mockRejectedValue("disk full");

    await importMain();

    expect(rm).toHaveBeenCalledWith("/tmp/review-insights-abc", {
      recursive: true,
      force: true,
    });
    expect(coreError).not.toHaveBeenCalled();
    expect(setFailed).toHaveBeenCalledWith("disk full");
  });

  it("cleans up the temporary directory and reports Error output failures", async () => {
    const err = new Error("publish failed");
    processOutputModes.mockRejectedValue(err);

    await importMain();

    expect(rm).toHaveBeenCalledWith("/tmp/review-insights-abc", {
      recursive: true,
      force: true,
    });
    expect(coreError).toHaveBeenCalledWith(err);
    expect(setFailed).toHaveBeenCalledWith("publish failed");
  });
});
