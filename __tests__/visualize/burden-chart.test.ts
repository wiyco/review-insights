import { describe, expect, it } from "vitest";
import type {
  HumanReviewBurden,
  HumanReviewBurdenGroup,
} from "../../src/types";
import { renderBurdenSection } from "../../src/visualize/burden-chart";
import { EMPTY_BURDEN, EMPTY_BURDEN_GROUP } from "../fixtures/empty-burden";

function makeBurdenGroup(
  overrides?: Partial<HumanReviewBurdenGroup>,
): HumanReviewBurdenGroup {
  return {
    prCount: 10,
    humanReviewsPerPR: {
      median: 2,
      p90: 4,
      mean: 2.5,
    },
    firstReviewLatencyMs: {
      median: 3_600_000,
      p90: 14_400_000,
      mean: 5_400_000,
    },
    unreviewedRate: 0.1,
    changeRequestRate: {
      median: 0.3,
      mean: 0.35,
    },
    reviewRounds: {
      median: 1,
      p90: 3,
      mean: 1.5,
    },
    ...overrides,
  };
}

function makeBurden(overrides?: Partial<HumanReviewBurden>): HumanReviewBurden {
  return {
    aiAuthored: makeBurdenGroup({
      prCount: 15,
    }),
    aiAssisted: makeBurdenGroup({
      prCount: 8,
    }),
    humanOnly: makeBurdenGroup({
      prCount: 30,
    }),
    stratifiedBySize: {
      S: {
        aiAuthored: makeBurdenGroup({
          prCount: 5,
        }),
        aiAssisted: null,
        humanOnly: makeBurdenGroup({
          prCount: 12,
        }),
      },
      M: {
        aiAuthored: makeBurdenGroup({
          prCount: 7,
        }),
        aiAssisted: makeBurdenGroup({
          prCount: 4,
        }),
        humanOnly: makeBurdenGroup({
          prCount: 10,
        }),
      },
      L: {
        aiAuthored: makeBurdenGroup({
          prCount: 3,
        }),
        aiAssisted: null,
        humanOnly: makeBurdenGroup({
          prCount: 8,
        }),
      },
      Empty: {
        aiAuthored: null,
        aiAssisted: null,
        humanOnly: null,
      },
    },
    ...overrides,
  };
}

function getSvgLines(html: string) {
  return Array.from(
    html.matchAll(
      /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" stroke="([^"]+)"(?: stroke-width="([^"]+)")?\/>/g,
    ),
    ([, x1, y1, x2, y2, stroke, strokeWidth]) => ({
      x1: Number(x1),
      y1: Number(y1),
      x2: Number(x2),
      y2: Number(y2),
      stroke,
      strokeWidth: strokeWidth == null ? null : Number(strokeWidth),
    }),
  );
}

describe("renderBurdenSection", () => {
  it("returns no-data message when all categories have zero PRs", () => {
    const html = renderBurdenSection(EMPTY_BURDEN);
    expect(html).toContain("No PR data available");
    expect(html).not.toContain("<svg");
  });

  it("renders PR count cards for each category", () => {
    const html = renderBurdenSection(makeBurden());
    expect(html).toContain("AI-authored");
    expect(html).toContain("AI-assisted");
    expect(html).toContain("Human-only");
    expect(html).toContain(">15<"); // aiAuthored count
    expect(html).toContain(">8<"); // aiAssisted count
    expect(html).toContain(">30<"); // humanOnly count
  });

  it("renders percentage in PR distribution cards", () => {
    const html = renderBurdenSection(makeBurden());
    // 15/(15+8+30) = 28.3%
    expect(html).toContain("28.3%");
  });

  it("renders SVG charts for metrics with data", () => {
    const html = renderBurdenSection(makeBurden());
    expect(html).toContain("<svg");
    expect(html).toContain("Reviews / PR");
    expect(html).toContain("Time to 1st Review");
    expect(html).toContain("Change Request Rate");
    expect(html).toContain("Review Rounds");
  });

  it("shows metric explanation notes", () => {
    const html = renderBurdenSection(makeBurden());
    expect(html).toContain("median");
    expect(html).toContain("p90");
    expect(html).toContain("worst-case");
    expect(html).toContain("distinct reviewed revisions observed");
    expect(html).toContain("submitted at or after PR creation");
    expect(html).toContain("missing a commit SHA");
  });

  it("renders detailed metrics table with median and p90 columns", () => {
    const html = renderBurdenSection(makeBurden());
    expect(html).toContain("Median");
    expect(html).toContain("P90");
    // Duration formatting: 3_600_000ms = 1.0h
    expect(html).toContain("1.0h");
  });

  it("renders unreviewed rate row", () => {
    const html = renderBurdenSection(makeBurden());
    expect(html).toContain("Unreviewed Rate");
    expect(html).toContain("survivorship bias");
    expect(html).toContain("no qualifying human review");
    // 0.1 = 10.0%
    expect(html).toContain("10.0%");
  });

  it("highlights high unreviewed rate with warning style", () => {
    const html = renderBurdenSection(
      makeBurden({
        aiAuthored: makeBurdenGroup({
          prCount: 10,
          unreviewedRate: 0.5,
        }),
      }),
    );
    // 50% unreviewedRate > 20% threshold → warn color
    expect(html).toContain("color:#dc2626");
    expect(html).toContain("50.0%");
  });

  it("renders size-stratified table", () => {
    const html = renderBurdenSection(makeBurden());
    expect(html).toContain("Size-Stratified Comparison");
    expect(html).toContain("descriptive within-tier associations");
    expect(html).not.toContain("isolate the effect of AI involvement");
    expect(html).toContain("Small (1\u201350)");
    expect(html).toContain("Medium (51\u2013300)");
    expect(html).toContain("Large (301+)");
  });

  it("shows dash for null cells in stratified table", () => {
    const html = renderBurdenSection(makeBurden());
    // aiAssisted is null for S tier
    expect(html).toContain("—");
  });

  it("shows sample size in stratified cells", () => {
    const html = renderBurdenSection(makeBurden());
    expect(html).toContain("(n=5)");
    expect(html).toContain("(n=12)");
  });

  it("omits size tiers with no data in any category", () => {
    const html = renderBurdenSection(makeBurden());
    // Empty tier has all null → should not appear
    expect(html).not.toContain("Empty (0)");
  });

  it("renders Empty size tier when it has data", () => {
    const html = renderBurdenSection(
      makeBurden({
        stratifiedBySize: {
          S: {
            aiAuthored: null,
            aiAssisted: null,
            humanOnly: null,
          },
          M: {
            aiAuthored: null,
            aiAssisted: null,
            humanOnly: null,
          },
          L: {
            aiAuthored: null,
            aiAssisted: null,
            humanOnly: null,
          },
          Empty: {
            aiAuthored: makeBurdenGroup({
              prCount: 5,
            }),
            aiAssisted: null,
            humanOnly: makeBurdenGroup({
              prCount: 8,
            }),
          },
        },
      }),
    );
    expect(html).toContain("Empty (0)");
    expect(html).toContain("(n=5)");
    expect(html).toContain("(n=8)");
  });

  it("includes active size tiers even when only later categories have data", () => {
    const html = renderBurdenSection(
      makeBurden({
        stratifiedBySize: {
          S: {
            aiAuthored: null,
            aiAssisted: makeBurdenGroup({
              prCount: 4,
            }),
            humanOnly: null,
          },
          M: {
            aiAuthored: null,
            aiAssisted: null,
            humanOnly: makeBurdenGroup({
              prCount: 6,
            }),
          },
          L: {
            aiAuthored: null,
            aiAssisted: null,
            humanOnly: null,
          },
          Empty: {
            aiAuthored: null,
            aiAssisted: null,
            humanOnly: null,
          },
        },
      }),
    );

    expect(html).toContain("Small (1\u201350)");
    expect(html).toContain("Medium (51\u2013300)");
    expect(html).toContain("(n=4)");
    expect(html).toContain("(n=6)");
  });

  it("shows no-stratified-data message when all tiers are empty", () => {
    const html = renderBurdenSection(
      makeBurden({
        aiAuthored: makeBurdenGroup({
          prCount: 5,
        }),
        humanOnly: makeBurdenGroup({
          prCount: 10,
        }),
        stratifiedBySize: {
          S: {
            aiAuthored: null,
            aiAssisted: null,
            humanOnly: null,
          },
          M: {
            aiAuthored: null,
            aiAssisted: null,
            humanOnly: null,
          },
          L: {
            aiAuthored: null,
            aiAssisted: null,
            humanOnly: null,
          },
          Empty: {
            aiAuthored: null,
            aiAssisted: null,
            humanOnly: null,
          },
        },
      }),
    );
    expect(html).toContain("No size-stratified data available");
  });

  it("handles category with all null metrics gracefully", () => {
    const html = renderBurdenSection(
      makeBurden({
        aiAuthored: EMPTY_BURDEN_GROUP,
        aiAssisted: EMPTY_BURDEN_GROUP,
        humanOnly: makeBurdenGroup({
          prCount: 20,
        }),
      }),
    );
    expect(html).toContain("N/A");
    expect(html).toContain(">20<");
  });

  it("formats duration values correctly", () => {
    const html = renderBurdenSection(
      makeBurden({
        humanOnly: makeBurdenGroup({
          prCount: 10,
          firstReviewLatencyMs: {
            median: 172_800_000, // 2 days
            p90: 345_600_000, // 4 days
            mean: 200_000_000,
          },
        }),
      }),
    );
    expect(html).toContain("2.0d");
  });

  it("formats rate values as percentages", () => {
    const html = renderBurdenSection(makeBurden());
    // changeRequestRate median=0.3 → 30%
    expect(html).toContain("30%");
  });

  it("skips chart when all medians are null for a metric", () => {
    const nullLatency = makeBurdenGroup({
      firstReviewLatencyMs: {
        median: null,
        p90: null,
        mean: null,
      },
    });
    const html = renderBurdenSection(
      makeBurden({
        aiAuthored: {
          ...nullLatency,
          prCount: 5,
        },
        aiAssisted: {
          ...nullLatency,
          prCount: 3,
        },
        humanOnly: {
          ...nullLatency,
          prCount: 10,
        },
      }),
    );
    // Other charts should still render
    expect(html).toContain("Reviews / PR");
    // Table still shows N/A for latency
    expect(html).toContain("Time to 1st Review");
  });

  it("renders only categories with data in SVG tooltips", () => {
    const html = renderBurdenSection(makeBurden());
    expect(html).toContain("<title>");
    expect(html).toContain("median=");
  });

  it("uses meaningful axis scale when all values are zero", () => {
    const zeroGroup = makeBurdenGroup({
      prCount: 10,
      humanReviewsPerPR: {
        median: 0,
        p90: 0,
        mean: 0,
      },
      firstReviewLatencyMs: {
        median: 0,
        p90: 0,
        mean: 0,
      },
      changeRequestRate: {
        median: 0,
        mean: 0,
      },
      reviewRounds: {
        median: 0,
        p90: 0,
        mean: 0,
      },
    });
    const html = renderBurdenSection(
      makeBurden({
        aiAuthored: zeroGroup,
        aiAssisted: zeroGroup,
        humanOnly: zeroGroup,
      }),
    );
    // Count/rounds axis should reach 1.0 (not repetitive 0.0 ticks)
    expect(html).toContain(">1.0<");
    // Rate axis should reach 10% (not repetitive 0% ticks)
    expect(html).toContain(">10%<");
    // Duration axis should reach 1h (default max), not all "0s" ticks
    expect(html).toContain(">1.0h<");
  });

  it("formats sub-hour duration axis ticks in minutes", () => {
    // 30 min median, 45 min p90 → axis max < 1h → ticks should be in minutes
    const html = renderBurdenSection(
      makeBurden({
        aiAuthored: makeBurdenGroup({
          prCount: 10,
          firstReviewLatencyMs: {
            median: 1_800_000,
            p90: 2_700_000,
            mean: 2_000_000,
          },
        }),
        aiAssisted: EMPTY_BURDEN_GROUP,
        humanOnly: EMPTY_BURDEN_GROUP,
      }),
    );
    // Axis ticks for sub-hour values should use "m" suffix
    expect(html).toMatch(/>\d+m</);
    // Should not have ambiguous repeated "0h" labels
    const zeroHourMatches = html.match(/>0h</g);
    // At most one "0h" at the origin is acceptable
    expect((zeroHourMatches ?? []).length).toBeLessThanOrEqual(1);
  });

  it("does not render backward whiskers when median bars are clamped to 1px", () => {
    const html = renderBurdenSection(
      makeBurden({
        aiAuthored: makeBurdenGroup({
          prCount: 5,
          humanReviewsPerPR: {
            median: 1,
            p90: 2,
            mean: 1.5,
          },
        }),
        aiAssisted: EMPTY_BURDEN_GROUP,
        humanOnly: makeBurdenGroup({
          prCount: 20,
          humanReviewsPerPR: {
            median: 1000,
            p90: 1000,
            mean: 1000,
          },
        }),
      }),
    );

    const backwardHorizontalLines = getSvgLines(html).filter(
      (line) => line.y1 === line.y2 && line.x1 > line.x2,
    );

    expect(backwardHorizontalLines).toEqual([]);
  });
});
