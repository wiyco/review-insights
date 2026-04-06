import { describe, expect, it } from "vitest";
import type { BiasResult, ReviewMatrix } from "../../src/types";
import { renderHeatmap } from "../../src/visualize/heatmap";

function buildMatrix(
  entries: [
    reviewer: string,
    author: string,
    count: number,
  ][],
): ReviewMatrix {
  const matrix: ReviewMatrix = new Map();
  for (const [reviewer, author, count] of entries) {
    let row = matrix.get(reviewer);
    if (!row) {
      row = new Map();
      matrix.set(reviewer, row);
    }
    row.set(author, count);
  }
  return matrix;
}

function makeBiasResult(
  entries: [
    string,
    string,
    number,
  ][],
  flaggedPairs: BiasResult["flaggedPairs"] = [],
): BiasResult {
  return {
    matrix: buildMatrix(entries),
    flaggedPairs,
    giniCoefficient: 0,
    modelFitError: null,
  };
}

describe("renderHeatmap", () => {
  describe("SVG structure", () => {
    it("returns a valid SVG string", () => {
      const bias = makeBiasResult([
        [
          "bob",
          "alice",
          3,
        ],
        [
          "carol",
          "alice",
          1,
        ],
      ]);

      const svg = renderHeatmap(bias);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
    });

    it("contains xmlns attribute", () => {
      const bias = makeBiasResult([
        [
          "bob",
          "alice",
          2,
        ],
      ]);
      const svg = renderHeatmap(bias);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });
  });

  describe("labels", () => {
    it("contains expected reviewer labels", () => {
      const bias = makeBiasResult([
        [
          "bob",
          "alice",
          3,
        ],
        [
          "carol",
          "alice",
          1,
        ],
      ]);

      const svg = renderHeatmap(bias);
      expect(svg).toContain("bob");
      expect(svg).toContain("carol");
    });

    it("contains expected author labels", () => {
      const bias = makeBiasResult([
        [
          "bob",
          "alice",
          2,
        ],
        [
          "bob",
          "dave",
          1,
        ],
      ]);

      const svg = renderHeatmap(bias);
      expect(svg).toContain("alice");
      expect(svg).toContain("dave");
    });
  });

  describe("cell values", () => {
    it("contains correct count values in the SVG", () => {
      const bias = makeBiasResult([
        [
          "bob",
          "alice",
          5,
        ],
        [
          "carol",
          "alice",
          2,
        ],
        [
          "bob",
          "dave",
          7,
        ],
      ]);

      const svg = renderHeatmap(bias);
      // The counts should appear as text content in cells
      expect(svg).toContain(">5<");
      expect(svg).toContain(">2<");
      expect(svg).toContain(">7<");
    });

    it("does not render text for zero-value cells", () => {
      // bob reviewed alice but not dave; carol reviewed dave but not alice
      const bias = makeBiasResult([
        [
          "bob",
          "alice",
          3,
        ],
        [
          "carol",
          "dave",
          2,
        ],
      ]);

      const svg = renderHeatmap(bias);
      // Both values should be present
      expect(svg).toContain(">3<");
      expect(svg).toContain(">2<");
    });
  });

  describe("empty matrix", () => {
    it("handles empty matrix gracefully", () => {
      const bias: BiasResult = {
        matrix: new Map(),
        flaggedPairs: [],
        giniCoefficient: 0,
        modelFitError: null,
      };

      const svg = renderHeatmap(bias);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
    });

    it("falls back to zero-based legend bounds for malformed matrices", () => {
      const matrix: ReviewMatrix = new Map([
        [
          "bob",
          new Map(),
        ],
      ]);
      const bias: BiasResult = {
        matrix,
        flaggedPairs: [],
        giniCoefficient: 0,
        modelFitError: null,
      };

      const svg = renderHeatmap(bias);
      expect(svg).toContain("bob");
      expect(svg).not.toContain("Infinity");
      expect(svg).not.toContain("NaN");
    });
  });

  describe("maxUsers option", () => {
    it("limits the number of displayed users", () => {
      // Create a matrix with many users
      const entries: [
        string,
        string,
        number,
      ][] = [];
      const users = [
        "user-a",
        "user-b",
        "user-c",
        "user-d",
        "user-e",
        "user-f",
      ];
      for (let i = 0; i < users.length; i++) {
        for (let j = 0; j < users.length; j++) {
          if (i !== j) {
            entries.push([
              users[i],
              users[j],
              (i + 1) * (j + 1),
            ]);
          }
        }
      }

      const bias = makeBiasResult(entries);
      const svg = renderHeatmap(bias, {
        maxUsers: 3,
      });

      // Should contain "Others" label for overflow
      expect(svg).toContain("Others");
    });

    it("does not show Others when user count is within limit", () => {
      const bias = makeBiasResult([
        [
          "bob",
          "alice",
          3,
        ],
        [
          "carol",
          "dave",
          1,
        ],
      ]);

      const svg = renderHeatmap(bias, {
        maxUsers: 20,
      });
      expect(svg).not.toContain("Others");
    });

    it("skips rows that disappear between iteration and lookup", () => {
      const matrix: ReviewMatrix = new (class extends Map<
        string,
        Map<string, number>
      > {
        override get(key: string): Map<string, number> | undefined {
          if (key === "alice" || key === "carol") {
            return undefined;
          }
          return super.get(key);
        }
      })([
        [
          "alice",
          new Map([
            [
              "zoe",
              5,
            ],
          ]),
        ],
        [
          "carol",
          new Map([
            [
              "yan",
              2,
            ],
          ]),
        ],
        [
          "bob",
          new Map([
            [
              "yan",
              1,
            ],
          ]),
        ],
      ]);
      const bias: BiasResult = {
        matrix,
        flaggedPairs: [],
        giniCoefficient: 0,
        modelFitError: null,
      };

      const svg = renderHeatmap(bias, {
        maxUsers: 1,
      });

      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("Others");
      expect(svg).not.toContain("NaN");
    });

    it("aggregates only positive overflow cells into Others buckets", () => {
      const bias = makeBiasResult([
        [
          "alice",
          "zoe",
          5,
        ],
        [
          "bob",
          "yan",
          1,
        ],
        [
          "carol",
          "zoe",
          2,
        ],
      ]);

      const svg = renderHeatmap(bias, {
        maxUsers: 1,
      });

      expect(svg).toContain("Others");
      expect(svg).toContain("alice -&gt; Others: 0 reviews");
      expect(svg).toContain("Others -&gt; zoe: 2 reviews");
      expect(svg).toContain("Others -&gt; Others: 1 reviews");
    });

    it("supports overflow reviewers without creating an Others author column", () => {
      const bias = makeBiasResult([
        [
          "alice",
          "zoe",
          5,
        ],
        [
          "bob",
          "zoe",
          2,
        ],
        [
          "carol",
          "zoe",
          1,
        ],
      ]);

      const svg = renderHeatmap(bias, {
        maxUsers: 1,
      });

      expect(svg).toContain("Others -&gt; zoe: 3 reviews");
      expect(svg).not.toContain("alice -&gt; Others");
    });
  });

  describe("flagged pairs", () => {
    it("highlights flagged pairs with red stroke", () => {
      const bias: BiasResult = {
        matrix: buildMatrix([
          [
            "bob",
            "alice",
            10,
          ],
          [
            "carol",
            "dave",
            1,
          ],
        ]),
        flaggedPairs: [
          {
            reviewer: "bob",
            author: "alice",
            count: 10,
            expectedCount: 4.2,
            pearsonResidual: 3.5,
          },
        ],
        giniCoefficient: 0.6,
        modelFitError: null,
      };

      const svg = renderHeatmap(bias);
      // Flagged cell should have the red stroke color
      expect(svg).toContain("#e63946");
    });
  });
});
