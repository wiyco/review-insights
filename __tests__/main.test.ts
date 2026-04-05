import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_BURDEN } from "./fixtures/empty-burden";

const setOutput = vi.fn();
const setFailed = vi.fn();
const coreError = vi.fn();

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
  context: {
    payload: {
      pull_request: {
        number: 42,
      },
    },
  },
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

describe("main", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

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
    await import("../src/main");

    await new Promise((resolve) => setTimeout(resolve, 0));

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
});
