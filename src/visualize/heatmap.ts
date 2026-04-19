import type { BiasResult } from "../types";
import { colorScale, rect, svgDoc, text, truncateLabel } from "./svg-renderer";

/** Configuration options for the heatmap renderer. */
interface HeatmapOpts {
  maxUsers?: number;
  cellSize?: number;
}

/**
 * Renders a reviewer-x-author heatmap as a complete SVG string.
 * Rows = reviewers, Columns = authors.
 * Flagged pairs are highlighted with a red border.
 */
export function renderHeatmap(bias: BiasResult, opts?: HeatmapOpts): string {
  if (bias.matrix.size === 0) {
    return svgDoc(
      400,
      80,
      text(200, 40, "No data available", {
        fontSize: 14,
        fill: "#666",
        anchor: "middle",
      }),
    );
  }

  const maxUsers = opts?.maxUsers ?? 20;
  const cellSize = opts?.cellSize ?? 40;

  // Collect all users and their total review counts
  const reviewerTotals = new Map<string, number>();
  const authorTotals = new Map<string, number>();

  for (const [reviewer, authors] of bias.matrix) {
    let total = 0;
    for (const [author, count] of authors) {
      total += count;
      authorTotals.set(author, (authorTotals.get(author) ?? 0) + count);
    }
    reviewerTotals.set(reviewer, total);
  }

  // Sort users by total review involvement and trim to maxUsers
  const sortedReviewers = [
    ...reviewerTotals.entries(),
  ]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const sortedAuthors = [
    ...authorTotals.entries(),
  ]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const trimmedReviewers = sortedReviewers.slice(0, maxUsers);
  const trimmedAuthors = sortedAuthors.slice(0, maxUsers);
  const hasOtherReviewers = sortedReviewers.length > maxUsers;
  const hasOtherAuthors = sortedAuthors.length > maxUsers;
  const overflowReviewers = hasOtherReviewers
    ? sortedReviewers.slice(maxUsers)
    : [];
  const overflowAuthors = hasOtherAuthors ? sortedAuthors.slice(maxUsers) : [];

  const reviewerLabels = [
    ...trimmedReviewers,
    ...(hasOtherReviewers
      ? [
          "Others",
        ]
      : []),
  ];
  const authorLabels = [
    ...trimmedAuthors,
    ...(hasOtherAuthors
      ? [
          "Others",
        ]
      : []),
  ];

  // Precompute a cell value lookup map so every access is O(1).
  // For "Others" rows/columns, aggregate overflow users once up front.
  const cellValues = new Map<string, number>();

  function cellKey(reviewer: string, author: string): string {
    return `${reviewer}::${author}`;
  }

  // Seed all trimmed reviewer × trimmed author cells directly
  for (const reviewer of trimmedReviewers) {
    const row = bias.matrix.get(reviewer);
    if (!row) continue;
    for (const author of trimmedAuthors) {
      const v = row.get(author) ?? 0;
      if (v > 0) cellValues.set(cellKey(reviewer, author), v);
    }
    // trimmed reviewer × "Others" column
    if (hasOtherAuthors) {
      let sum = 0;
      for (const oa of overflowAuthors) sum += row.get(oa) ?? 0;
      if (sum > 0) cellValues.set(cellKey(reviewer, "Others"), sum);
    }
  }

  // "Others" row × each author column (and "Others"/"Others")
  if (hasOtherReviewers) {
    const othersRowTotals = new Map<string, number>();
    for (const or of overflowReviewers) {
      const row = bias.matrix.get(or);
      if (!row) continue;
      for (const author of trimmedAuthors) {
        const v = row.get(author) ?? 0;
        if (v > 0)
          othersRowTotals.set(author, (othersRowTotals.get(author) ?? 0) + v);
      }
      if (hasOtherAuthors) {
        for (const oa of overflowAuthors) {
          const v = row.get(oa) ?? 0;
          if (v > 0)
            othersRowTotals.set(
              "Others",
              (othersRowTotals.get("Others") ?? 0) + v,
            );
        }
      }
    }
    for (const [author, sum] of othersRowTotals) {
      cellValues.set(cellKey("Others", author), sum);
    }
  }

  function getCellValue(reviewer: string, author: string): number {
    return cellValues.get(cellKey(reviewer, author)) ?? 0;
  }

  // Build flagged pair set for fast lookup
  const flaggedSet = new Set<string>();
  for (const fp of bias.flaggedPairs) {
    flaggedSet.add(`${fp.reviewer}::${fp.author}`);
  }

  function isFlagged(reviewer: string, author: string): boolean {
    if (reviewer === "Others" || author === "Others") return false;
    return flaggedSet.has(`${reviewer}::${author}`);
  }

  // Compute global min/max for color scaling
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const rl of reviewerLabels) {
    for (const al of authorLabels) {
      const v = getCellValue(rl, al);
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }
  if (!Number.isFinite(minVal)) minVal = 0;
  if (!Number.isFinite(maxVal)) maxVal = 0;

  const rows = reviewerLabels.length;
  const cols = authorLabels.length;
  const labelMaxLen = 12;
  const labelPadding = 100;
  const topPadding = 100;
  const legendHeight = 40;
  const padding = 20;

  const gridWidth = cols * cellSize;
  const gridHeight = rows * cellSize;
  const totalWidth = labelPadding + gridWidth + padding + 120;
  const totalHeight = topPadding + gridHeight + padding + legendHeight;

  const parts: string[] = [];

  // Title
  parts.push(
    text(totalWidth / 2, 20, "Review Heatmap: Reviewer x Author", {
      fontSize: 16,
      fontWeight: "bold",
      anchor: "middle",
      fill: "#1a1a2e",
    }),
  );

  // Column (author) labels - rotated 45 degrees
  for (const [c, author] of authorLabels.entries()) {
    const lx = labelPadding + c * cellSize + cellSize / 2;
    const ly = topPadding - 8;
    parts.push(
      text(lx, ly, truncateLabel(author, labelMaxLen), {
        fontSize: 11,
        anchor: "end",
        rotate: -45,
        fill: "#333",
      }),
    );
  }

  // Row (reviewer) labels
  for (const [r, reviewer] of reviewerLabels.entries()) {
    const ly = topPadding + r * cellSize + cellSize / 2 + 4;
    parts.push(
      text(labelPadding - 8, ly, truncateLabel(reviewer, labelMaxLen), {
        fontSize: 11,
        anchor: "end",
        fill: "#333",
      }),
    );
  }

  // Cells
  for (const [r, reviewer] of reviewerLabels.entries()) {
    for (const [c, author] of authorLabels.entries()) {
      const val = getCellValue(reviewer, author);
      const cx = labelPadding + c * cellSize;
      const cy = topPadding + r * cellSize;
      const fill = colorScale(val, minVal, maxVal);
      const flagged = isFlagged(reviewer, author);

      parts.push(
        rect(cx, cy, cellSize, cellSize, fill, {
          stroke: flagged ? "#e63946" : "#fff",
          strokeWidth: flagged ? 3 : 1,
          rx: 2,
          title: `${reviewer} -> ${author}: ${val} reviews`,
        }),
      );

      // Count label in cell
      if (val > 0) {
        const brightness = (val - minVal) / (maxVal - minVal || 1);
        const textFill = brightness > 0.55 ? "#fff" : "#333";
        parts.push(
          text(cx + cellSize / 2, cy + cellSize / 2 + 4, String(val), {
            fontSize: 11,
            anchor: "middle",
            fill: textFill,
            fontWeight: "bold",
          }),
        );
      }
    }
  }

  // Color legend bar
  const legendY = topPadding + gridHeight + padding + 10;
  const legendX = labelPadding;
  const legendWidth = Math.min(gridWidth, 260);
  const legendSteps = 20;
  const stepW = legendWidth / legendSteps;

  parts.push(
    text(legendX, legendY - 4, "Low", {
      fontSize: 10,
      fill: "#666",
      anchor: "start",
    }),
  );
  parts.push(
    text(legendX + legendWidth, legendY - 4, "High", {
      fontSize: 10,
      fill: "#666",
      anchor: "end",
    }),
  );

  for (let i = 0; i < legendSteps; i++) {
    const t = i / (legendSteps - 1);
    const v = minVal + t * (maxVal - minVal);
    parts.push(
      rect(
        legendX + i * stepW,
        legendY,
        stepW + 1,
        12,
        colorScale(v, minVal, maxVal),
      ),
    );
  }

  // Axis labels
  parts.push(
    text(labelPadding + gridWidth / 2, topPadding - 60, "Author", {
      fontSize: 12,
      fontWeight: "bold",
      anchor: "middle",
      fill: "#555",
    }),
  );

  return svgDoc(totalWidth, totalHeight + 10, parts.join("\n"));
}
