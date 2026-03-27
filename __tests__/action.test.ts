import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_BURDEN } from "./fixtures/empty-burden";
import type {
  ActionConfig,
  AIPatternResult,
  BiasResult,
  MergeCorrelation,
  PullRequestRecord,
  UserReviewStats,
} from "../src/types";

const state = vi.hoisted(() => ({
  config: {} as ActionConfig,
  pullRequests: [] as PullRequestRecord[],
  userStats: [] as UserReviewStats[],
  mergeCorrelations: [] as MergeCorrelation[],
  bias: {
    matrix: new Map(),
    flaggedPairs: [],
    giniCoefficient: 0,
  } as BiasResult,
  aiPatterns: {} as AIPatternResult,
  octokit: {},
  context: {
    payload: {},
  } as {
    payload: Record<string, unknown>;
  },
  tmpDir: "D:\\tmp\\review-insights-test",
  htmlReport: "<html>report</html>",
  mkdtemp: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  coreError: vi.fn(),
  getOctokit: vi.fn(),
  getConfig: vi.fn(),
  fetchAllPullRequests: vi.fn(),
  computeUserStats: vi.fn(),
  computeMergeCorrelations: vi.fn(),
  detectBias: vi.fn(),
  analyzeAIPatterns: vi.fn(),
  generateHtmlReport: vi.fn(),
  writeJobSummary: vi.fn(),
  postPRComment: vi.fn(),
  uploadReportArtifact: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarning: vi.fn(),
  loggerDebug: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdtemp: state.mkdtemp,
  writeFile: state.writeFile,
  rm: state.rm,
}));

vi.mock("node:os", () => ({
  tmpdir: vi.fn(() => "D:\\tmp"),
}));

vi.mock("@actions/core", () => ({
  setOutput: state.setOutput,
  setFailed: state.setFailed,
  error: state.coreError,
}));

vi.mock("@actions/github", () => ({
  getOctokit: state.getOctokit,
  context: state.context,
}));

vi.mock("../src/inputs", () => ({
  getConfig: state.getConfig,
}));

vi.mock("../src/collect/fetcher", () => ({
  fetchAllPullRequests: state.fetchAllPullRequests,
}));

vi.mock("../src/analyze/per-user-stats", () => ({
  computeUserStats: state.computeUserStats,
}));

vi.mock("../src/analyze/merge-correlation", () => ({
  computeMergeCorrelations: state.computeMergeCorrelations,
}));

vi.mock("../src/analyze/bias-detector", () => ({
  detectBias: state.detectBias,
}));

vi.mock("../src/analyze/ai-patterns", () => ({
  analyzeAIPatterns: state.analyzeAIPatterns,
}));

vi.mock("../src/visualize/html-report", () => ({
  generateHtmlReport: state.generateHtmlReport,
}));

vi.mock("../src/output/job-summary", () => ({
  writeJobSummary: state.writeJobSummary,
}));

vi.mock("../src/output/pr-comment", () => ({
  postPRComment: state.postPRComment,
}));

vi.mock("../src/output/artifact", () => ({
  uploadReportArtifact: state.uploadReportArtifact,
}));

vi.mock("../src/utils/logger", () => ({
  logger: {
    info: state.loggerInfo,
    warning: state.loggerWarning,
    debug: state.loggerDebug,
    error: state.loggerError,
  },
}));

import { runAction } from "../src/action";

function makeDefaultConfig(
  overrides: Partial<ActionConfig> = {},
): ActionConfig {
  return {
    token: "token",
    owner: "my-org",
    repo: "my-repo",
    since: "2025-01-01T00:00:00.000Z",
    until: "2025-06-01T00:00:00.000Z",
    outputModes: [
      "summary",
    ],
    biasThreshold: 2.0,
    includeBots: false,
    maxPRs: 500,
    ...overrides,
  };
}

function makeDefaultPullRequests(): PullRequestRecord[] {
  return [
    {
      number: 1,
      title: "PR #1",
      state: "MERGED",
      author: "alice",
      authorIsBot: false,
      createdAt: "2025-05-01T10:00:00Z",
      mergedAt: "2025-05-02T10:00:00Z",
      closedAt: "2025-05-02T10:00:00Z",
      mergedBy: null,
      reviews: [],
      reviewRequests: [],
      commitMessages: [],
      additions: 10,
      deletions: 5,
      aiCategory: "human-only",
    },
  ];
}

function makeDefaultUserStats(): UserReviewStats[] {
  return [
    {
      login: "alice",
      reviewsGiven: 2,
      reviewsReceived: 1,
      approvals: 1,
      changeRequests: 0,
      comments: 0,
      dismissed: 0,
      avgTimeToFirstReviewMs: null,
      medianTimeToFirstReviewMs: null,
    },
  ];
}

describe("runAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    state.config = makeDefaultConfig();
    state.pullRequests = makeDefaultPullRequests();
    state.userStats = makeDefaultUserStats();
    state.mergeCorrelations = [];
    state.bias = {
      matrix: new Map(),
      flaggedPairs: [],
      giniCoefficient: 0,
    };
    state.aiPatterns = {
      botReviewers: [],
      aiCoAuthoredPRs: 0,
      totalPRs: state.pullRequests.length,
      botReviewPercentage: 0,
      humanReviewBurden: EMPTY_BURDEN,
    };
    state.context.payload = {};

    state.mkdtemp.mockResolvedValue(state.tmpDir);
    state.writeFile.mockResolvedValue(undefined);
    state.rm.mockResolvedValue(undefined);
    state.getOctokit.mockReturnValue(state.octokit);
    state.getConfig.mockReturnValue(state.config);
    state.fetchAllPullRequests.mockResolvedValue(state.pullRequests);
    state.computeUserStats.mockReturnValue(state.userStats);
    state.computeMergeCorrelations.mockReturnValue(state.mergeCorrelations);
    state.detectBias.mockReturnValue(state.bias);
    state.analyzeAIPatterns.mockReturnValue(state.aiPatterns);
    state.generateHtmlReport.mockReturnValue(state.htmlReport);
    state.writeJobSummary.mockResolvedValue(undefined);
    state.postPRComment.mockResolvedValue(undefined);
    state.uploadReportArtifact.mockResolvedValue("12345");
  });

  it("fails when comment is the only output mode outside pull_request context", async () => {
    state.config = makeDefaultConfig({
      outputModes: [
        "comment",
      ],
    });
    state.getConfig.mockReturnValue(state.config);

    await expect(runAction()).rejects.toThrow("All output modes failed: comment");

    expect(state.postPRComment).not.toHaveBeenCalled();
    expect(state.setOutput).not.toHaveBeenCalled();
    expect(state.rm).toHaveBeenCalledWith(state.tmpDir, {
      recursive: true,
      force: true,
    });
  });

  it("fails when artifact is the only output mode and upload is not confirmed", async () => {
    state.config = makeDefaultConfig({
      outputModes: [
        "artifact",
      ],
    });
    state.getConfig.mockReturnValue(state.config);
    state.uploadReportArtifact.mockResolvedValue(null);

    await expect(runAction()).rejects.toThrow(
      "All output modes failed: artifact",
    );

    expect(state.setOutput).not.toHaveBeenCalled();
  });

  it("succeeds when at least one output mode succeeds", async () => {
    state.config = makeDefaultConfig({
      outputModes: [
        "summary",
        "comment",
      ],
    });
    state.getConfig.mockReturnValue(state.config);

    await expect(runAction()).resolves.toBeUndefined();

    expect(state.writeJobSummary).toHaveBeenCalledOnce();
    expect(state.postPRComment).not.toHaveBeenCalled();
    expect(state.setOutput).toHaveBeenCalledWith(
      "report-path",
      "D:\\tmp\\review-insights-test\\review-insights-report.html",
    );
    expect(state.setOutput).toHaveBeenCalledWith("total-prs-analyzed", 1);
    expect(state.setOutput).toHaveBeenCalledWith("top-reviewer", "alice");
    expect(state.setOutput).toHaveBeenCalledWith("bias-detected", "false");
  });
});
