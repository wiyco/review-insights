import type { PullRequestRecord } from "../types";
import { requiredAt } from "../utils/array";
import { line, polyline, rect, svgDoc, text } from "./svg-renderer";

/**
 * Returns an ISO 8601 week string "YYYY-Www" for a given date.
 * Week 1 is the week containing the year's first Thursday.
 */
function toWeekKey(d: Date): string {
  const target = new Date(d.valueOf());
  // ISO weeks start on Monday; adjust Sunday (0) to 7
  const dayNum = target.getUTCDay() || 7;
  // Set to the nearest Thursday (ISO week-defining day)
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  // Use the Thursday's year (handles year-boundary edge cases)
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Returns a "YYYY-MM" key for a given date.
 */
function toMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Generates all period keys between startKey and endKey inclusive.
 */
function generatePeriodKeys(
  start: Date,
  end: Date,
  interval: "weekly" | "monthly",
): string[] {
  const keys: string[] = [];
  const keyFn = interval === "weekly" ? toWeekKey : toMonthKey;
  const cursor = new Date(start);

  // Align cursor
  if (interval === "monthly") {
    cursor.setUTCDate(1);
  }

  while (cursor <= end) {
    keys.push(keyFn(cursor));
    if (interval === "weekly") {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    } else {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  keys.push(keyFn(end));
  return Array.from(new Set(keys));
}

function requireBucketValue(
  buckets: ReadonlyMap<string, number>,
  key: string,
  seriesLabel: string,
): number {
  const value = buckets.get(key);
  if (value == null) {
    throw new Error(
      `Missing ${seriesLabel} time-series bucket for key: ${key}`,
    );
  }
  return value;
}

function toAreaPolygonPoints(
  points: readonly [
    number,
    number,
  ][],
  baselineY: number,
): string {
  let firstX = 0;
  let lastX = 0;
  let isFirst = true;
  const linePoints: string[] = [];

  for (const [px, py] of points) {
    if (isFirst) {
      firstX = px;
      isFirst = false;
    }
    lastX = px;
    linePoints.push(`${px},${py}`);
  }

  return `${firstX},${baselineY} ${linePoints.join(" ")} ${lastX},${baselineY}`;
}

/**
 * Renders a time-series line chart showing total reviews and PRs opened over time.
 */
export function renderTimeSeries(
  pullRequests: PullRequestRecord[],
  interval: "weekly" | "monthly",
): string {
  const [firstPullRequest] = pullRequests;
  if (firstPullRequest == null) {
    return svgDoc(
      600,
      80,
      text(300, 40, "No data available", {
        fontSize: 14,
        fill: "#888",
        anchor: "middle",
      }),
    );
  }

  const keyFn = interval === "weekly" ? toWeekKey : toMonthKey;

  // Determine date range from data
  let startDate = new Date(firstPullRequest.createdAt);
  let endDate = new Date(firstPullRequest.createdAt);
  for (const pr of pullRequests) {
    const prDate = new Date(pr.createdAt);
    if (prDate < startDate) startDate = prDate;
    if (prDate > endDate) endDate = prDate;
    for (const review of pr.reviews) {
      if (review.state === "PENDING") continue;
      const rDate = new Date(review.createdAt);
      if (rDate < startDate) startDate = rDate;
      if (rDate > endDate) endDate = rDate;
    }
  }
  const periodKeys = generatePeriodKeys(startDate, endDate, interval);

  // Bucket data
  const reviewBuckets = new Map<string, number>();
  const prBuckets = new Map<string, number>();
  for (const k of periodKeys) {
    reviewBuckets.set(k, 0);
    prBuckets.set(k, 0);
  }

  for (const pr of pullRequests) {
    const prKey = keyFn(new Date(pr.createdAt));
    const prCount = requireBucketValue(prBuckets, prKey, "PR");
    prBuckets.set(prKey, prCount + 1);
    for (const review of pr.reviews) {
      if (review.state === "PENDING") continue;
      const rKey = keyFn(new Date(review.createdAt));
      const reviewCount = requireBucketValue(reviewBuckets, rKey, "review");
      reviewBuckets.set(rKey, reviewCount + 1);
    }
  }

  const reviewValues = periodKeys.map((k) =>
    requireBucketValue(reviewBuckets, k, "review"),
  );
  const prValues = periodKeys.map((k) =>
    requireBucketValue(prBuckets, k, "PR"),
  );

  // Chart dimensions
  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 60;
  const paddingBottom = 80;
  const maxChartWidth = 2000;
  const chartWidth = Math.min(
    maxChartWidth,
    Math.max(500, periodKeys.length * 50),
  );
  const chartHeight = 260;
  const totalWidth = paddingLeft + chartWidth + paddingRight;
  const totalHeight = paddingTop + chartHeight + paddingBottom;

  const allValues = [
    ...reviewValues,
    ...prValues,
  ];
  const maxY = Math.max(...allValues, 1);

  // Map data to pixel coordinates
  function toPoint(
    index: number,
    value: number,
  ): [
    number,
    number,
  ] {
    const x =
      paddingLeft + (index / Math.max(periodKeys.length - 1, 1)) * chartWidth;
    const y = paddingTop + chartHeight - (value / maxY) * chartHeight;
    return [
      x,
      y,
    ];
  }

  const reviewPoints: [
    number,
    number,
  ][] = reviewValues.map((v, i) => toPoint(i, v));
  const prPoints: [
    number,
    number,
  ][] = prValues.map((v, i) => toPoint(i, v));

  const parts: string[] = [];

  // Title
  parts.push(
    text(totalWidth / 2, 24, "Review Activity Over Time", {
      fontSize: 16,
      fontWeight: "bold",
      anchor: "middle",
      fill: "#1a1a2e",
    }),
  );

  // Y-axis gridlines
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const yVal = Math.round((maxY * i) / ySteps);
    const yPos = paddingTop + chartHeight - (i / ySteps) * chartHeight;
    parts.push(
      line(paddingLeft, yPos, paddingLeft + chartWidth, yPos, "#e5e7eb", 1),
    );
    parts.push(
      text(paddingLeft - 10, yPos + 4, String(yVal), {
        fontSize: 10,
        fill: "#888",
        anchor: "end",
      }),
    );
  }

  // X-axis labels
  const maxLabels = 20;
  const labelStep = Math.max(1, Math.ceil(periodKeys.length / maxLabels));
  for (let i = 0; i < periodKeys.length; i += labelStep) {
    const label = requiredAt(periodKeys, i, "time-series label");
    const lx =
      paddingLeft + (i / Math.max(periodKeys.length - 1, 1)) * chartWidth;
    parts.push(
      text(lx, paddingTop + chartHeight + 20, label, {
        fontSize: 10,
        fill: "#888",
        anchor: "end",
        rotate: -45,
      }),
    );
  }

  // Filled area under review line
  if (reviewPoints.length > 1) {
    const pts = toAreaPolygonPoints(reviewPoints, paddingTop + chartHeight);
    parts.push(`<polygon points="${pts}" fill="#2563eb" opacity="0.1"/>`);
  }

  // Filled area under PR line
  if (prPoints.length > 1) {
    const pts = toAreaPolygonPoints(prPoints, paddingTop + chartHeight);
    parts.push(`<polygon points="${pts}" fill="#16a34a" opacity="0.1"/>`);
  }

  // Lines
  if (reviewPoints.length > 1) {
    parts.push(polyline(reviewPoints, "#2563eb"));
  }
  if (prPoints.length > 1) {
    parts.push(polyline(prPoints, "#16a34a"));
  }

  // Dots on data points
  for (const [px, py] of reviewPoints) {
    parts.push(`<circle cx="${px}" cy="${py}" r="3" fill="#2563eb"/>`);
  }
  for (const [px, py] of prPoints) {
    parts.push(`<circle cx="${px}" cy="${py}" r="3" fill="#16a34a"/>`);
  }

  // Axes
  parts.push(
    line(
      paddingLeft,
      paddingTop,
      paddingLeft,
      paddingTop + chartHeight,
      "#333",
      1,
    ),
  );
  parts.push(
    line(
      paddingLeft,
      paddingTop + chartHeight,
      paddingLeft + chartWidth,
      paddingTop + chartHeight,
      "#333",
      1,
    ),
  );

  // Legend
  const legendX = paddingLeft + 10;
  const legendY = paddingTop + chartHeight + 55;
  parts.push(
    rect(legendX, legendY, 14, 14, "#2563eb", {
      rx: 2,
    }),
  );
  parts.push(
    text(legendX + 20, legendY + 11, "Reviews", {
      fontSize: 12,
      fill: "#333",
    }),
  );
  parts.push(
    rect(legendX + 100, legendY, 14, 14, "#16a34a", {
      rx: 2,
    }),
  );
  parts.push(
    text(legendX + 120, legendY + 11, "PRs Opened", {
      fontSize: 12,
      fill: "#333",
    }),
  );

  return svgDoc(totalWidth, totalHeight, parts.join("\n"));
}
