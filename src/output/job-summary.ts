import * as core from "@actions/core";
import type { AnalysisResult } from "../types";
import { escapeHtml } from "../utils/sanitize";
import { renderBarChart } from "../visualize/bar-chart";
import { renderHeatmap } from "../visualize/heatmap";

/**
 * Writes a GitHub Actions job summary with key analysis metrics,
 * an inline heatmap SVG, and a top-reviewers bar chart.
 */
export async function writeJobSummary(analysis: AnalysisResult): Promise<void> {
  const { userStats, bias, pullRequests, dateRange, includeBots } = analysis;

  const filteredPRs = includeBots
    ? pullRequests
    : pullRequests.filter((pr) => !pr.authorIsBot);
  const totalPRs = filteredPRs.length;
  const uniqueReviewers = userStats.filter((u) => u.reviewsGiven > 0).length;

  const topReviewer = userStats.length > 0 ? userStats[0] : null;

  const biasDetected = bias.flaggedPairs.length > 0;

  // Build heatmap and bar chart SVGs
  const heatmapSvg = renderHeatmap(bias, {
    maxUsers: 12,
    cellSize: 32,
  });
  const barChartSvg = renderBarChart(userStats, "reviewsGiven", {
    maxUsers: 10,
  });

  await core.summary
    .addHeading("Review Insights Report", 2)
    .addRaw(
      `<p><strong>Date range:</strong> ${escapeHtml(dateRange.since)} &mdash; ${escapeHtml(dateRange.until)}</p>`,
    )
    .addTable([
      [
        {
          data: "Metric",
          header: true,
        },
        {
          data: "Value",
          header: true,
        },
      ],
      [
        "Total PRs analyzed",
        String(totalPRs),
      ],
      [
        "Unique reviewers",
        String(uniqueReviewers),
      ],
      [
        "Top reviewer",
        topReviewer
          ? `${escapeHtml(topReviewer.login)} (${topReviewer.reviewsGiven} reviews)`
          : "N/A",
      ],
      [
        "Bias detected",
        biasDetected ? `Yes (${bias.flaggedPairs.length} pairs)` : "No",
      ],
      [
        "Gini coefficient",
        bias.giniCoefficient.toFixed(2),
      ],
    ])
    .addHeading("Review Heatmap", 3)
    .addRaw(heatmapSvg)
    .addHeading("Top Reviewers", 3)
    .addRaw(barChartSvg)
    .write();
}
