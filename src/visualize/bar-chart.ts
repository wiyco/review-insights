import type { UserReviewStats } from "../types";
import { line, rect, svgDoc, text } from "./svg-renderer";

/** Metric keys available for bar chart rendering. */
type BarMetric = "reviewsGiven" | "reviewsReceived" | "approvals";

/** Configuration options for the bar chart renderer. */
interface BarChartOpts {
  maxUsers?: number;
  barHeight?: number;
}

const METRIC_COLORS: Record<BarMetric, string> = {
  reviewsGiven: "#2563eb",
  reviewsReceived: "#16a34a",
  approvals: "#ea580c",
};

const METRIC_TITLES: Record<BarMetric, string> = {
  reviewsGiven: "Reviews Given (unique PRs)",
  reviewsReceived: "Reviews Received (total submissions)",
  approvals: "Approvals",
};

/**
 * Renders a horizontal bar chart for a given metric as a complete SVG string.
 */
export function renderBarChart(
  stats: UserReviewStats[],
  metric: BarMetric,
  opts?: BarChartOpts,
): string {
  const maxUsers = opts?.maxUsers ?? 15;
  const barHeight = opts?.barHeight ?? 28;

  // Sort and trim
  const sorted = [
    ...stats,
  ]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, maxUsers);

  if (sorted.length === 0) {
    return svgDoc(
      400,
      80,
      text(200, 40, "No data available", {
        fontSize: 14,
        fill: "#888",
        anchor: "middle",
      }),
    );
  }

  const barColor = METRIC_COLORS[metric];
  const title = METRIC_TITLES[metric];

  const labelWidth = 120;
  const valueWidth = 50;
  const paddingTop = 50;
  const paddingRight = 30;
  const paddingBottom = 30;
  const paddingLeft = 10;
  const barGap = 6;
  const maxBarWidth = 400;

  const chartHeight = sorted.length * (barHeight + barGap) - barGap;
  const totalWidth =
    paddingLeft + labelWidth + maxBarWidth + valueWidth + paddingRight;
  const totalHeight = paddingTop + chartHeight + paddingBottom;

  const maxValue = Math.max(...sorted.map((s) => s[metric]), 1);

  const parts: string[] = [];

  // Title
  parts.push(
    text(totalWidth / 2, 24, title, {
      fontSize: 16,
      fontWeight: "bold",
      anchor: "middle",
      fill: "#1a1a2e",
    }),
  );

  // Gridlines
  const gridSteps = 5;
  const barAreaX = paddingLeft + labelWidth;
  for (let i = 0; i <= gridSteps; i++) {
    const gx = barAreaX + (maxBarWidth * i) / gridSteps;
    parts.push(
      line(gx, paddingTop - 5, gx, paddingTop + chartHeight, "#e5e7eb", 1),
    );
    const gridVal = Math.round((maxValue * i) / gridSteps);
    parts.push(
      text(gx, paddingTop - 10, String(gridVal), {
        fontSize: 10,
        fill: "#999",
        anchor: "middle",
      }),
    );
  }

  // Axis line
  parts.push(
    line(
      barAreaX,
      paddingTop,
      barAreaX,
      paddingTop + chartHeight,
      "#cbd5e1",
      1,
    ),
  );

  // Bars
  for (const [i, user] of sorted.entries()) {
    const val = user[metric];
    const by = paddingTop + i * (barHeight + barGap);
    const bw = (val / maxValue) * maxBarWidth;

    // Label
    const label =
      user.login.length > 14 ? `${user.login.slice(0, 13)}\u2026` : user.login;
    parts.push(
      text(paddingLeft + labelWidth - 8, by + barHeight / 2 + 4, label, {
        fontSize: 12,
        anchor: "end",
        fill: "#333",
      }),
    );

    // Bar
    const barWidth = val > 0 ? Math.max(bw, 2) : 0;
    parts.push(
      rect(barAreaX, by, barWidth, barHeight, barColor, {
        rx: 3,
        opacity: 0.85,
        title: `${user.login}: ${val}`,
      }),
    );

    // Value
    parts.push(
      text(barAreaX + barWidth + 6, by + barHeight / 2 + 4, String(val), {
        fontSize: 11,
        fill: "#555",
        fontWeight: "bold",
      }),
    );
  }

  return svgDoc(totalWidth, totalHeight, parts.join("\n"));
}
