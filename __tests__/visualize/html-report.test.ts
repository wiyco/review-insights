import { describe, expect, it, vi } from "vitest";
import type {
  AnalysisResult,
  PullRequestRecord,
  ReviewRecord,
  UserReviewStats,
} from "../../src/types";
import { generateHtmlReport } from "../../src/visualize/html-report";
import { EMPTY_BURDEN } from "../fixtures/empty-burden";

vi.mock("../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

function makeReview(overrides?: Partial<ReviewRecord>): ReviewRecord {
  return {
    reviewer: "reviewer-a",
    reviewerIsBot: false,
    author: "author-a",
    state: "APPROVED",
    createdAt: "2025-06-02T12:00:00Z",
    prNumber: 1,
    ...overrides,
  };
}

function makePR(overrides?: Partial<PullRequestRecord>): PullRequestRecord {
  return {
    number: 1,
    title: "Test PR",
    state: "MERGED",
    author: "author-a",
    authorIsBot: false,
    createdAt: "2025-06-01T00:00:00Z",
    mergedAt: "2025-06-02T00:00:00Z",
    closedAt: "2025-06-02T00:00:00Z",
    mergedBy: "merger",
    reviewLimitReached: false,
    reviews: [
      makeReview(),
    ],
    reviewRequests: [
      "reviewer-a",
    ],
    commitMessages: [
      "fix: something",
    ],
    additions: 10,
    deletions: 5,
    aiCategory: "human-only",
    ...overrides,
  };
}

function makeUserStats(overrides?: Partial<UserReviewStats>): UserReviewStats {
  return {
    login: "reviewer-a",
    reviewsGiven: 5,
    reviewsReceived: 3,
    approvals: 4,
    changeRequests: 1,
    comments: 2,
    dismissed: 0,
    avgTimeToFirstReviewMs: 3600000,
    medianTimeToFirstReviewMs: 3600000,
    ...overrides,
  };
}

function makeAnalysis(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return {
    userStats: [
      makeUserStats(),
    ],
    mergeCorrelations: [
      {
        login: "author-a",
        prsAuthored: 3,
        prsMerged: 2,
        avgReviewsBeforeMerge: 1.5,
        medianReviewsBeforeMerge: 1.5,
        zeroReviewMerges: 0,
      },
    ],
    bias: {
      matrix: new Map(),
      flaggedPairs: [],
      giniCoefficient: 0.25,
    },
    aiPatterns: {
      botReviewers: [],
      aiCoAuthoredPRs: 0,
      totalPRs: 1,
      botReviewPercentage: 0,
      humanReviewBurden: EMPTY_BURDEN,
    },
    pullRequests: [
      makePR(),
    ],
    dateRange: {
      since: "2025-06-01T00:00:00Z",
      until: "2025-07-01T00:00:00Z",
    },
    biasThreshold: 2.0,
    includeBots: false,
    partialData: false,
    partialDataReason: null,
    ...overrides,
  };
}

describe("generateHtmlReport", () => {
  it("produces valid HTML structure", () => {
    const html = generateHtmlReport(makeAnalysis());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</html>");
    expect(html).toContain("Review Insights Report");
  });

  it("renders KPI values", () => {
    const html = generateHtmlReport(makeAnalysis());
    // 1 PR, 5 reviews, 1 reviewer, 1 author
    expect(html).toContain(
      '<div class="value">1</div><div class="label">Pull Requests</div>',
    );
    expect(html).toContain(
      '<div class="value">5</div><div class="label">Unique PR Reviews</div>',
    );
    expect(html).toContain(
      '<div class="value">1</div><div class="label">Active Reviewers</div>',
    );
    expect(html).toContain("0.25");
  });

  it("renders tie-aware reviewer ranking context", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        userStats: [
          makeUserStats({
            login: "bob",
            reviewsGiven: 5,
          }),
          makeUserStats({
            login: "alice",
            reviewsGiven: 5,
          }),
          makeUserStats({
            login: "author-only",
            reviewsGiven: 0,
          }),
        ],
      }),
    );

    expect(html).toContain("<h2>Reviewer Ranking</h2>");
    expect(html).toContain("<strong>Top reviewers:</strong> alice, bob");
    expect(html).toContain("<strong>Max reviews given:</strong> 5");
    expect(html).toContain("<strong>Active reviewer population:</strong> 2");
    expect(html).toContain(
      "<strong>Tie size:</strong> 2 (100.0% of active reviewers)",
    );
    expect(html).toContain(
      "This ranking is a descriptive statistic over the observed active reviewer population. Ties are preserved; no inferential significance is implied.",
    );
  });

  it("shows an undefined ranking note when no active reviewers exist", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        userStats: [
          makeUserStats({
            login: "author-only",
            reviewsGiven: 0,
          }),
        ],
      }),
    );

    expect(html).toContain(
      "No active reviewers are present in the observed dataset, so the top-reviewer ranking is undefined.",
    );
  });

  it("renders date range in header", () => {
    const html = generateHtmlReport(makeAnalysis());
    expect(html).toContain("2025-06-01T00:00:00Z");
    expect(html).toContain("2025-07-01T00:00:00Z");
  });

  it("renders user stats table rows", () => {
    const html = generateHtmlReport(makeAnalysis());
    expect(html).toContain("<td>reviewer-a</td>");
    expect(html).toContain("<td>5</td>"); // reviewsGiven
    expect(html).toContain("<td>4</td>"); // approvals
  });

  it("renders median time-to-first-review column header and value", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        userStats: [
          makeUserStats({
            avgTimeToFirstReviewMs: 3600000,
            medianTimeToFirstReviewMs: 7200000,
          }),
        ],
      }),
    );
    expect(html).toContain("<th>Median Time to 1st Review</th>");
    // avg=1.0h then median=2.0h in adjacent cells
    expect(html).toMatch(/<td>1\.0h<\/td>\s*<td>2\.0h<\/td>/);
  });

  it("renders N/A for null medianTimeToFirstReviewMs", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        userStats: [
          makeUserStats({
            avgTimeToFirstReviewMs: null,
            medianTimeToFirstReviewMs: null,
          }),
        ],
      }),
    );
    expect(html).toContain("<th>Median Time to 1st Review</th>");
    // Both avg and median are null → two consecutive N/A cells
    expect(html).toMatch(/<td>N\/A<\/td>\s*<td>N\/A<\/td>/);
  });

  it("renders merge correlation rows", () => {
    const html = generateHtmlReport(makeAnalysis());
    expect(html).toContain("<td>author-a</td>");
    expect(html).toContain("<td>3</td>"); // prsAuthored
    expect(html).toContain("<td>1.5</td>"); // avgReviewsBeforeMerge
  });

  it("renders median reviews-before-merge column header and value", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        mergeCorrelations: [
          {
            login: "author-a",
            prsAuthored: 3,
            prsMerged: 2,
            avgReviewsBeforeMerge: 1.5,
            medianReviewsBeforeMerge: 2.0,
            zeroReviewMerges: 0,
          },
        ],
      }),
    );
    expect(html).toContain("<th>Median Reviews Before Merge</th>");
    // avg=1.5 then median=2.0 in adjacent cells
    expect(html).toMatch(/<td>1\.5<\/td>\s*<td>2\.0<\/td>/);
  });

  it("renders N/A for null medianReviewsBeforeMerge", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        mergeCorrelations: [
          {
            login: "author-a",
            prsAuthored: 1,
            prsMerged: 0,
            avgReviewsBeforeMerge: 0,
            medianReviewsBeforeMerge: null,
            zeroReviewMerges: 0,
          },
        ],
      }),
    );
    expect(html).toContain("<th>Median Reviews Before Merge</th>");
    expect(html).toContain("<td>N/A</td>");
  });

  it("shows 'no bias detected' when flaggedPairs is empty", () => {
    const html = generateHtmlReport(makeAnalysis());
    expect(html).toContain("No significant review bias detected.");
  });

  it("renders bias warnings when flaggedPairs exist", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        bias: {
          matrix: new Map(),
          flaggedPairs: [
            {
              reviewer: "alice",
              author: "bob",
              count: 15,
              zScore: 3.5,
            },
          ],
          giniCoefficient: 0.4,
        },
      }),
    );
    expect(html).toContain("alice");
    expect(html).toContain("bob");
    expect(html).toContain("3.50");
    expect(html).not.toContain("No significant review bias detected.");
  });

  it("renders bot reviewer table when bots exist", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        aiPatterns: {
          botReviewers: [
            {
              login: "dependabot[bot]",
              reviewCount: 10,
            },
          ],
          aiCoAuthoredPRs: 2,
          totalPRs: 5,
          botReviewPercentage: 20,
          humanReviewBurden: EMPTY_BURDEN,
        },
      }),
    );
    expect(html).toContain("dependabot[bot]");
    expect(html).toContain("Bot Reviewer");
  });

  it("shows 'no bot reviewers' message when none exist", () => {
    const html = generateHtmlReport(makeAnalysis());
    expect(html).toContain("No bot reviewers detected.");
  });

  it("notes when traditional bot-authored PRs are excluded from burden comparison", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        aiPatterns: {
          botReviewers: [],
          aiCoAuthoredPRs: 0,
          totalPRs: 3,
          botReviewPercentage: 0,
          humanReviewBurden: {
            ...EMPTY_BURDEN,
            humanOnly: {
              ...EMPTY_BURDEN.humanOnly,
              prCount: 2,
            },
          },
        },
      }),
    );

    expect(html).toContain(
      "Traditional bot-authored PRs are excluded from this comparison cohort (1 PR)",
    );
  });

  it("shows truncation warning for PRs that hit the review fetch limit", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        pullRequests: [
          makePR({
            number: 42,
            reviewLimitReached: true,
          }),
        ],
      }),
    );
    expect(html).toContain("Warning:");
    expect(html).toContain("#42");
    expect(html).toContain("truncated data");
  });

  it("shows truncation warning even when observation-window filtering reduced review count", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        pullRequests: [
          makePR({
            number: 42,
            reviewLimitReached: true,
            reviews: [
              makeReview({
                reviewer: "r1",
              }),
            ],
          }),
        ],
      }),
    );

    expect(html).toContain("Warning:");
    expect(html).toContain("#42");
    expect(html).toContain("truncated data");
  });

  it("does not show truncation warning when no PR hit the review fetch limit", () => {
    const html = generateHtmlReport(makeAnalysis());
    expect(html).not.toContain("truncated data");
  });

  it("surfaces partial-data state in the HTML report", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        partialData: true,
        partialDataReason: "pagination-time-limit",
      }),
    );
    expect(html).toContain("Data Completeness");
    expect(html).toContain(">Partial<");
    expect(html).toContain("partial PR data");
  });

  describe("XSS prevention", () => {
    it("escapes user login in stats table", () => {
      const html = generateHtmlReport(
        makeAnalysis({
          userStats: [
            makeUserStats({
              login: '<script>alert("xss")</script>',
            }),
          ],
        }),
      );
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;alert");
    });

    it("escapes user login in merge correlation table", () => {
      const xssPayload = '"><img src=x onerror=alert(1)>';
      const html = generateHtmlReport(
        makeAnalysis({
          mergeCorrelations: [
            {
              login: xssPayload,
              prsAuthored: 1,
              prsMerged: 1,
              avgReviewsBeforeMerge: 1,
              medianReviewsBeforeMerge: 1,
              zeroReviewMerges: 0,
            },
          ],
        }),
      );
      // The raw payload must not appear anywhere in the HTML (only its escaped form)
      expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
      expect(html).not.toContain('<td>"><img src=x onerror=alert(1)></td>');
    });

    it("escapes reviewer/author in bias flagged pairs", () => {
      const reviewerPayload = '<img src=x onerror=alert("r")>';
      const authorPayload = '<img src=x onerror=alert("a")>';
      const html = generateHtmlReport(
        makeAnalysis({
          bias: {
            matrix: new Map(),
            flaggedPairs: [
              {
                reviewer: reviewerPayload,
                author: authorPayload,
                count: 10,
                zScore: 3.0,
              },
            ],
            giniCoefficient: 0.5,
          },
        }),
      );
      // Escaped forms must appear in the HTML
      expect(html).toContain("&lt;img src=x onerror=alert(&quot;r&quot;)&gt;");
      expect(html).toContain("&lt;img src=x onerror=alert(&quot;a&quot;)&gt;");
      // Raw forms must not appear in <td> tags
      expect(html).not.toContain(`<td>${reviewerPayload}</td>`);
      expect(html).not.toContain(`<td>${authorPayload}</td>`);
    });

    it("escapes bot reviewer login", () => {
      const html = generateHtmlReport(
        makeAnalysis({
          aiPatterns: {
            botReviewers: [
              {
                login: "<svg onload=alert(1)>",
                reviewCount: 5,
              },
            ],
            aiCoAuthoredPRs: 0,
            totalPRs: 1,
            botReviewPercentage: 50,
            humanReviewBurden: EMPTY_BURDEN,
          },
        }),
      );
      expect(html).not.toContain("<svg onload");
      expect(html).toContain("&lt;svg onload");
    });

    it("escapes date range in header", () => {
      const html = generateHtmlReport(
        makeAnalysis({
          dateRange: {
            since: '<script>alert("since")</script>',
            until: '<script>alert("until")</script>',
          },
        }),
      );
      expect(html).not.toContain('<script>alert("since")');
      expect(html).toContain("&lt;script&gt;");
    });

    it("does not embed raw JSON data block", () => {
      const html = generateHtmlReport(makeAnalysis({}));
      expect(html).not.toContain('<script id="raw-data"');
    });
  });

  it("sorts merge correlations by prsAuthored descending", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        mergeCorrelations: [
          {
            login: "low",
            prsAuthored: 1,
            prsMerged: 1,
            avgReviewsBeforeMerge: 1,
            medianReviewsBeforeMerge: 1,
            zeroReviewMerges: 0,
          },
          {
            login: "high",
            prsAuthored: 10,
            prsMerged: 8,
            avgReviewsBeforeMerge: 2,
            medianReviewsBeforeMerge: 2,
            zeroReviewMerges: 0,
          },
        ],
      }),
    );
    const lowIdx = html.indexOf("<td>low</td>");
    const highIdx = html.indexOf("<td>high</td>");
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("sorts bot reviewers by reviewCount descending", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        aiPatterns: {
          botReviewers: [
            {
              login: "bot-low",
              reviewCount: 2,
            },
            {
              login: "bot-high",
              reviewCount: 10,
            },
          ],
          aiCoAuthoredPRs: 0,
          totalPRs: 5,
          botReviewPercentage: 20,
          humanReviewBurden: EMPTY_BURDEN,
        },
      }),
    );
    const lowIdx = html.indexOf("bot-low");
    const highIdx = html.indexOf("bot-high");
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("sorts bias warnings by zScore descending", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        bias: {
          matrix: new Map(),
          flaggedPairs: [
            {
              reviewer: "r-low",
              author: "a1",
              count: 5,
              zScore: 2.0,
            },
            {
              reviewer: "r-high",
              author: "a2",
              count: 10,
              zScore: 4.0,
            },
          ],
          giniCoefficient: 0.5,
        },
      }),
    );
    const lowIdx = html.indexOf("r-low");
    const highIdx = html.indexOf("r-high");
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("renders warn class for zeroReviewMerges > 0", () => {
    const html = generateHtmlReport(
      makeAnalysis({
        mergeCorrelations: [
          {
            login: "author-a",
            prsAuthored: 5,
            prsMerged: 3,
            avgReviewsBeforeMerge: 0.5,
            medianReviewsBeforeMerge: 0.5,
            zeroReviewMerges: 2,
          },
        ],
      }),
    );
    expect(html).toContain('class="warn"');
    expect(html).toContain("<td>2</td>");
  });

  it("shows truncation warning with ellipsis for more than 10 truncated PRs", () => {
    const pullRequests = Array.from(
      {
        length: 12,
      },
      (_, i) =>
        makePR({
          number: i + 1,
          reviewLimitReached: true,
        }),
    );

    const html = generateHtmlReport(
      makeAnalysis({
        pullRequests,
      }),
    );
    expect(html).toContain("Warning:");
    expect(html).toContain(", ...");
  });

  describe("edge cases", () => {
    it("handles empty data", () => {
      const html = generateHtmlReport(
        makeAnalysis({
          userStats: [],
          mergeCorrelations: [],
          pullRequests: [],
          bias: {
            matrix: new Map(),
            flaggedPairs: [],
            giniCoefficient: 0,
          },
          aiPatterns: {
            botReviewers: [],
            aiCoAuthoredPRs: 0,
            totalPRs: 0,
            botReviewPercentage: 0,
            humanReviewBurden: EMPTY_BURDEN,
          },
        }),
      );
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain(
        '<div class="value">0</div><div class="label">Pull Requests</div>',
      );
      expect(html).toContain("Avg Reviewers/PR");
    });

    it("handles avgTimeToFirstReviewMs as null", () => {
      const html = generateHtmlReport(
        makeAnalysis({
          userStats: [
            makeUserStats({
              avgTimeToFirstReviewMs: null,
            }),
          ],
        }),
      );
      expect(html).toContain("N/A");
    });

    it("includes bot PRs in KPIs when includeBots is true", () => {
      const html = generateHtmlReport(
        makeAnalysis({
          includeBots: true,
          pullRequests: [
            makePR(),
            makePR({
              number: 2,
              author: "dependabot[bot]",
              authorIsBot: true,
            }),
          ],
        }),
      );
      expect(html).toContain(
        '<div class="value">2</div><div class="label">Pull Requests</div>',
      );
    });

    it("excludes bot PRs from KPIs when includeBots is false", () => {
      const html = generateHtmlReport(
        makeAnalysis({
          includeBots: false,
          pullRequests: [
            makePR(),
            makePR({
              number: 2,
              author: "dependabot[bot]",
              authorIsBot: true,
            }),
          ],
        }),
      );
      expect(html).toContain(
        '<div class="value">1</div><div class="label">Pull Requests</div>',
      );
    });
  });
});
