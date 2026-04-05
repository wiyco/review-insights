import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { renderBarChart } from "../../src/visualize/bar-chart";

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
    partialData: false,
    partialDataReason: null,
  };
}

describe("writeJobSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      core.summary as unknown as {
        _addedContent: string[];
      }
    )._addedContent.length = 0;
  });

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

  it("shows N/A for top reviewers when no active reviewers exist", async () => {
    const analysis = makeAnalysis();
    analysis.userStats = [
      {
        login: "author-only",
        reviewsGiven: 0,
        reviewsReceived: 4,
        approvals: 0,
        changeRequests: 0,
        comments: 0,
        dismissed: 0,
        avgTimeToFirstReviewMs: 3600000,
        medianTimeToFirstReviewMs: 3600000,
      },
    ];

    await writeJobSummary(analysis);

    expect(core.summary.addTable).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining([
          "Top reviewers",
          "N/A",
        ]),
        expect.arrayContaining([
          "Max reviews given",
          "N/A",
        ]),
      ]),
    );

    const barChartCalls = vi.mocked(renderBarChart).mock.calls;
    expect(barChartCalls[barChartCalls.length - 1]).toEqual([
      [],
      "reviewsGiven",
      {
        maxUsers: 10,
      },
    ]);
  });

  it("shows the full tie set for top reviewers", async () => {
    const analysis = makeAnalysis();
    analysis.userStats = [
      {
        ...analysis.userStats[0],
        login: "bob",
        reviewsGiven: 10,
      },
      {
        ...analysis.userStats[1],
        login: "alice",
        reviewsGiven: 10,
      },
      {
        login: "carol",
        reviewsGiven: 4,
        reviewsReceived: 1,
        approvals: 2,
        changeRequests: 0,
        comments: 0,
        dismissed: 0,
        avgTimeToFirstReviewMs: 1800000,
        medianTimeToFirstReviewMs: 1800000,
      },
    ];

    await writeJobSummary(analysis);

    expect(core.summary.addTable).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining([
          "Top reviewers",
          "alice, bob (10 reviews each)",
        ]),
        expect.arrayContaining([
          "Max reviews given",
          "10",
        ]),
      ]),
    );
  });

  it("renders the reviews-given chart from the active reviewer population", async () => {
    const analysis = makeAnalysis();
    analysis.userStats = [
      {
        ...analysis.userStats[0],
        login: "alice",
        reviewsGiven: 10,
      },
      {
        login: "author-only",
        reviewsGiven: 0,
        reviewsReceived: 4,
        approvals: 0,
        changeRequests: 0,
        comments: 0,
        dismissed: 0,
        avgTimeToFirstReviewMs: 3600000,
        medianTimeToFirstReviewMs: 3600000,
      },
      {
        ...analysis.userStats[1],
        login: "bob",
        reviewsGiven: 7,
      },
    ];

    await writeJobSummary(analysis);

    const barChartCalls = vi.mocked(renderBarChart).mock.calls;
    expect(barChartCalls[barChartCalls.length - 1]).toEqual([
      [
        analysis.userStats[0],
        analysis.userStats[2],
      ],
      "reviewsGiven",
      {
        maxUsers: 10,
      },
    ]);
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

  it("surfaces partial-data state in the summary", async () => {
    const analysis = makeAnalysis();
    analysis.partialData = true;
    analysis.partialDataReason = "pagination-time-limit";

    await writeJobSummary(analysis);

    expect(core.summary.addTable).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining([
          "Data completeness",
          "Partial",
        ]),
      ]),
    );

    const addedContent = (
      core.summary as unknown as {
        _addedContent: string[];
      }
    )._addedContent;
    const hasPartialWarning = addedContent.some((c) =>
      c.includes("partial PR data"),
    );
    expect(hasPartialWarning).toBe(true);
  });

  it("surfaces the delay-budget partial-data warning in the summary", async () => {
    const analysis = makeAnalysis();
    analysis.partialData = true;
    analysis.partialDataReason = "pagination-delay-budget-exceeded";

    await writeJobSummary(analysis);

    const addedContent = (
      core.summary as unknown as {
        _addedContent: string[];
      }
    )._addedContent;
    const hasDelayBudgetWarning = addedContent.some((c) =>
      c.includes("required rate-limit delay would exceed the remaining"),
    );
    expect(hasDelayBudgetWarning).toBe(true);
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
