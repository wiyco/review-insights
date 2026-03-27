import { describe, expect, it, vi } from "vitest";
import type { AnalysisResult } from "../../src/types";
import { EMPTY_BURDEN } from "../fixtures/empty-burden";

vi.mock("@actions/core", () => {
  const addedContent: string[] = [];
  return {
    summary: {
      addHeading: vi.fn().mockReturnThis(),
      addRaw: vi.fn(function (this: unknown, content: string) {
        addedContent.push(content);
        return this;
      }),
      addTable: vi.fn().mockReturnThis(),
      write: vi.fn().mockResolvedValue(undefined),
      _addedContent: addedContent,
    },
  };
});

vi.mock("../../src/visualize/heatmap", () => ({
  renderHeatmap: vi.fn().mockReturnValue('<svg class="heatmap"></svg>'),
}));

vi.mock("../../src/visualize/bar-chart", () => ({
  renderBarChart: vi.fn().mockReturnValue('<svg class="bar-chart"></svg>'),
}));

import * as core from "@actions/core";
import { writeJobSummary } from "../../src/output/job-summary";

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
      aiCoAuthoredPRs: 0,
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

describe("writeJobSummary", () => {
  it("calls summary.write()", async () => {
    const analysis = makeAnalysis();

    await writeJobSummary(analysis);

    expect(core.summary.write).toHaveBeenCalledOnce();
  });

  it('calls addHeading with "Review Insights Report"', async () => {
    const analysis = makeAnalysis();

    await writeJobSummary(analysis);

    expect(core.summary.addHeading).toHaveBeenCalledWith(
      "Review Insights Report",
      expect.anything(),
    );
  });

  it("addRaw is called with SVG content", async () => {
    const analysis = makeAnalysis();

    await writeJobSummary(analysis);

    const addedContent = (
      core.summary as unknown as {
        _addedContent: string[];
      }
    )._addedContent;
    const hasSvg = addedContent.some((c) => c.includes("<svg"));
    expect(hasSvg).toBe(true);
  });

  it("addTable is called with data", async () => {
    const analysis = makeAnalysis();

    await writeJobSummary(analysis);

    expect(core.summary.addTable).toHaveBeenCalled();
  });

  it("excludes bot-authored PRs from totalPRs when includeBots is false", async () => {
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

    await writeJobSummary(analysis);

    expect(core.summary.addTable).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining([
          "Total PRs analyzed",
          "1",
        ]),
      ]),
    );
  });

  it("includes bot-authored PRs in totalPRs when includeBots is true", async () => {
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

    await writeJobSummary(analysis);

    expect(core.summary.addTable).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining([
          "Total PRs analyzed",
          "2",
        ]),
      ]),
    );
  });

  it("shows N/A for top reviewer when userStats is empty", async () => {
    const analysis = makeAnalysis();
    analysis.userStats = [];

    await writeJobSummary(analysis);

    expect(core.summary.addTable).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining([
          "Top reviewer",
          "N/A",
        ]),
      ]),
    );
  });

  it("shows bias detected when flaggedPairs exist", async () => {
    const analysis = makeAnalysis();
    analysis.bias = {
      matrix: new Map(),
      flaggedPairs: [
        {
          reviewer: "alice",
          author: "bob",
          count: 10,
          zScore: 3.0,
        },
      ],
      giniCoefficient: 0.5,
    };

    await writeJobSummary(analysis);

    expect(core.summary.addTable).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining([
          "Bias detected",
          "Yes (1 pairs)",
        ]),
      ]),
    );
  });

  it("contains escaped date range in raw content", async () => {
    const analysis = makeAnalysis();

    await writeJobSummary(analysis);

    const addedContent = (
      core.summary as unknown as {
        _addedContent: string[];
      }
    )._addedContent;
    const hasDateRange = addedContent.some(
      (c) =>
        c.includes("2025-01-01T00:00:00Z") &&
        c.includes("2025-06-01T00:00:00Z"),
    );
    expect(hasDateRange).toBe(true);
  });
});
