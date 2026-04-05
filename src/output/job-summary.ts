import * as core from "@actions/core";
import { computeTopReviewerSummary } from "../analyze/top-reviewers";
import type { AnalysisResult } from "../types";
import {
  getDataCompletenessLabel,
  getPartialDataWarning,
} from "../utils/partial-data";
import { escapeHtml } from "../utils/sanitize";
import { renderBarChart } from "../visualize/bar-chart";
import { renderHeatmap } from "../visualize/heatmap";

function getSummaryStatusBanner(
  partialDataReason: AnalysisResult["partialDataReason"],
): string | null {
  switch (partialDataReason) {
    case "max-prs-limit-reached":
      return "Capped by max-prs. Additional PRs existed within the requested date range, so this report covers only the newest collected subset.";
    case "pagination-time-limit":
    case "pagination-delay-budget-exceeded":
      return "Partial dataset. Pagination stopped before the full requested date range could be collected.";
    default:
      return null;
  }
}

/**
 * Writes a GitHub Actions job summary with key analysis metrics,
 * an inline heatmap SVG, and a top-reviewers bar chart.
 */
export async function writeJobSummary(analysis: AnalysisResult): Promise<void> {
  const {
    userStats,
    bias,
    pullRequests,
    dateRange,
    includeBots,
    partialData,
    partialDataReason,
  } = analysis;

  const filteredPRs = includeBots
    ? pullRequests
    : pullRequests.filter((pr) => !pr.authorIsBot);
  const activeReviewerStats = userStats.filter((user) => user.reviewsGiven > 0);
  const totalPRs = filteredPRs.length;
  const topReviewerSummary = computeTopReviewerSummary(userStats);
  const dataCompleteness = getDataCompletenessLabel(
    partialData,
    partialDataReason,
  );
  const partialDataWarning = getPartialDataWarning(partialDataReason);
  const summaryStatusBanner = getSummaryStatusBanner(partialDataReason);
  const biasDetected = bias.flaggedPairs.length > 0;

  // Build heatmap and bar chart SVGs
  const heatmapSvg = renderHeatmap(bias, {
    maxUsers: 12,
    cellSize: 32,
  });
  const barChartSvg = renderBarChart(activeReviewerStats, "reviewsGiven", {
    maxUsers: 10,
  });

  const summary = core.summary
    .addHeading("Review Insights Report", 2)
    .addRaw(
      `<p><strong>Date range:</strong> ${escapeHtml(dateRange.since)} &mdash; ${escapeHtml(dateRange.until)}</p>`,
    );

  if (summaryStatusBanner) {
    summary.addRaw(
      `<p><strong>Status:</strong> ${escapeHtml(summaryStatusBanner)}</p>`,
    );
  }

  if (partialDataWarning) {
    summary.addRaw(
      `<p><strong>Warning:</strong> ${escapeHtml(partialDataWarning)}</p>`,
    );
  }

  await summary
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
        String(topReviewerSummary.reviewerCount),
      ],
      [
        "Top reviewers",
        topReviewerSummary.topReviewers.length > 0
          ? `${escapeHtml(topReviewerSummary.topReviewers.join(", "))} (${topReviewerSummary.maxReviewsGiven} reviews each)`
          : "N/A",
      ],
      [
        "Max reviews given",
        topReviewerSummary.maxReviewsGiven != null
          ? String(topReviewerSummary.maxReviewsGiven)
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
      [
        "Data completeness",
        dataCompleteness,
      ],
    ])
    .addHeading("Review Heatmap", 3)
    .addRaw(heatmapSvg)
    .addHeading("Top Reviewers", 3)
    .addRaw(barChartSvg)
    .write();
}
