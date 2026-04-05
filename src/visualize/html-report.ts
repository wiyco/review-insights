import { computeTopReviewerSummary } from "../analyze/top-reviewers";
import type { AnalysisResult } from "../types";
import { formatDuration } from "../utils/format";
import {
  getDataCompletenessLabel,
  getPartialDataWarning,
} from "../utils/partial-data";
import { escapeHtml } from "../utils/sanitize";
import { renderBarChart } from "./bar-chart";
import { renderBurdenSection } from "./burden-chart";
import { renderHeatmap } from "./heatmap";
import { renderTimeSeries } from "./time-series";

/**
 * Generates a complete self-contained HTML report with embedded SVG visualizations.
 * All user-derived content is escaped for safe rendering.
 */
export function generateHtmlReport(analysis: AnalysisResult): string {
  const {
    userStats,
    mergeCorrelations,
    bias,
    aiPatterns,
    pullRequests,
    dateRange,
    biasThreshold,
    includeBots,
    partialData,
    partialDataReason,
  } = analysis;

  // Filter out bot-authored PRs for KPIs and time-series (author filter only).
  // Reviewer filtering is NOT applied here — time-series shows full review
  // activity including bots, consistent with filtering.md ("N/A" for reviewer filter).
  const filteredPRs = includeBots
    ? pullRequests
    : pullRequests.filter((pr) => !pr.authorIsBot);
  const activeReviewerStats = userStats.filter((user) => user.reviewsGiven > 0);
  const topReviewerSummary = computeTopReviewerSummary(userStats);

  // Build SVGs
  const heatmapSvg = renderHeatmap(bias);
  const reviewsGivenSvg = renderBarChart(activeReviewerStats, "reviewsGiven");
  const reviewsReceivedSvg = renderBarChart(userStats, "reviewsReceived");
  const timeSeriesSvg = renderTimeSeries(filteredPRs, "weekly");

  // Summary stats
  const totalReviews = userStats.reduce((s, u) => s + u.reviewsGiven, 0);
  const totalPRs = filteredPRs.length;
  const uniqueReviewers = topReviewerSummary.reviewerCount;
  const uniqueAuthors = new Set(filteredPRs.map((pr) => pr.author)).size;
  const avgReviewsPerPR =
    totalPRs > 0 ? (totalReviews / totalPRs).toFixed(1) : "0";
  const tieShare =
    topReviewerSummary.reviewerCount > 0
      ? (
          (topReviewerSummary.topReviewers.length /
            topReviewerSummary.reviewerCount) *
          100
        ).toFixed(1)
      : null;

  const truncatedPRs = filteredPRs.filter((pr) => pr.reviewLimitReached);
  const dataCompleteness = getDataCompletenessLabel(
    partialData,
    partialDataReason,
  );
  const partialDataWarning = getPartialDataWarning(partialDataReason);

  const sinceStr = escapeHtml(String(dateRange.since));
  const untilStr = escapeHtml(String(dateRange.until));

  // Summary stats table rows
  const summaryRows = userStats
    .slice(0, 30)
    .map(
      (u) => `<tr>
        <td>${escapeHtml(u.login)}</td>
        <td>${u.reviewsGiven}</td>
        <td>${u.reviewsReceived}</td>
        <td>${u.approvals}</td>
        <td>${u.changeRequests}</td>
        <td>${u.comments}</td>
        <td>${u.avgTimeToFirstReviewMs != null ? formatDuration(u.avgTimeToFirstReviewMs) : "N/A"}</td>
        <td>${u.medianTimeToFirstReviewMs != null ? formatDuration(u.medianTimeToFirstReviewMs) : "N/A"}</td>
      </tr>`,
    )
    .join("\n");

  // Merge correlation table rows
  const mergeRows = mergeCorrelations
    .sort((a, b) => b.prsAuthored - a.prsAuthored)
    .slice(0, 30)
    .map(
      (m) => `<tr>
        <td>${escapeHtml(m.login)}</td>
        <td>${m.prsAuthored}</td>
        <td>${m.prsMerged}</td>
        <td>${m.avgReviewsBeforeMerge.toFixed(1)}</td>
        <td>${m.medianReviewsBeforeMerge != null ? m.medianReviewsBeforeMerge.toFixed(1) : "N/A"}</td>
        <td class="${m.zeroReviewMerges > 0 ? "warn" : ""}">${m.zeroReviewMerges}</td>
      </tr>`,
    )
    .join("\n");

  // AI patterns
  const botRows = aiPatterns.botReviewers
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .map(
      (b) =>
        `<tr><td>${escapeHtml(b.login)}</td><td>${b.reviewCount}</td></tr>`,
    )
    .join("\n");
  const burdenPRTotal =
    aiPatterns.humanReviewBurden.aiAuthored.prCount +
    aiPatterns.humanReviewBurden.aiAssisted.prCount +
    aiPatterns.humanReviewBurden.humanOnly.prCount;
  const excludedTraditionalBotPRs = Math.max(
    0,
    aiPatterns.totalPRs - burdenPRTotal,
  );

  // Bias warnings
  const biasWarnings = bias.flaggedPairs
    .sort((a, b) => b.zScore - a.zScore)
    .map(
      (fp) =>
        `<tr>
          <td>${escapeHtml(fp.reviewer)}</td>
          <td>${escapeHtml(fp.author)}</td>
          <td>${fp.count}</td>
          <td>${fp.zScore.toFixed(2)}</td>
        </tr>`,
    )
    .join("\n");

  const biasExplanation = `
    <p class="note">Bias is detected using a <strong>Z-Score</strong>, which measures how many standard deviations a reviewer-author pair's review count is above the mean.
    A high Z-Score indicates a significant outlier in review frequency between two individuals.</p>
    <p class="note">Pairs are flagged when their review count exceeds the mean by more than <strong>${biasThreshold.toFixed(1)}</strong> standard deviations (i.e. Z-Score &gt; ${biasThreshold.toFixed(1)}).</p>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Review Insights Report</title>
<style>
  :root {
    --bg: #f8f9fa;
    --card-bg: #ffffff;
    --header-bg: #1a1a2e;
    --header-fg: #e0e0e0;
    --accent: #2563eb;
    --text: #1e293b;
    --text-muted: #64748b;
    --border: #e2e8f0;
    --warn: #dc2626;
    --success: #16a34a;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  header { background: var(--header-bg); color: var(--header-fg); padding: 24px 32px; }
  header h1 { font-size: 24px; font-weight: 700; }
  header p { font-size: 14px; opacity: 0.8; margin-top: 4px; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
  .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .kpi { background: var(--card-bg); border-radius: 8px; padding: 20px; border: 1px solid var(--border); text-align: center; }
  .kpi .value { font-size: 28px; font-weight: 700; color: var(--accent); }
  .kpi.partial .value { color: var(--warn); }
  .kpi .label { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
  .card { background: var(--card-bg); border-radius: 8px; border: 1px solid var(--border); padding: 24px; margin-bottom: 24px; overflow-x: auto; }
  .card h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: var(--header-bg); border-bottom: 2px solid var(--accent); padding-bottom: 8px; }
  .card svg { max-width: 100%; height: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-weight: 600; color: var(--text); border-bottom: 2px solid var(--border); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  tr:hover td { background: #f8fafc; }
  .warn { color: var(--warn); font-weight: 600; }
  .note { font-size: 13px; color: var(--text-muted); margin-top: 8px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 800px) { .two-col { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1>Review Insights Report</h1>
  <p>${sinceStr} &mdash; ${untilStr}</p>
</header>
<div class="container">

  <!-- KPIs -->
  <div class="kpi-row">
    <div class="kpi"><div class="value">${totalPRs}</div><div class="label">Pull Requests</div></div>
    <div class="kpi"><div class="value">${totalReviews}</div><div class="label">Unique PR Reviews</div></div>
    <div class="kpi"><div class="value">${uniqueReviewers}</div><div class="label">Active Reviewers</div></div>
    <div class="kpi"><div class="value">${uniqueAuthors}</div><div class="label">PR Authors</div></div>
    <div class="kpi"><div class="value">${avgReviewsPerPR}</div><div class="label">Avg Reviewers/PR</div></div>
    <div class="kpi"><div class="value">${bias.giniCoefficient.toFixed(2)}</div><div class="label">Gini Coefficient</div></div>
    <div class="kpi${partialData ? " partial" : ""}"><div class="value">${dataCompleteness}</div><div class="label">Data Completeness</div></div>
  </div>

  ${
    partialDataWarning
      ? `<div class="card" style="border-color: var(--warn);">
    <p class="warn">Warning: ${escapeHtml(partialDataWarning)}</p>
  </div>`
      : ""
  }

  ${
    truncatedPRs.length > 0
      ? `<div class="card" style="border-color: var(--warn);">
    <p class="warn">Warning: ${truncatedPRs.length} PR(s) hit the review fetch limit and may have truncated data (PRs: ${truncatedPRs
      .slice(0, 10)
      .map((pr) => `#${pr.number}`)
      .join(
        ", ",
      )}${truncatedPRs.length > 10 ? ", ..." : ""}). Statistics for these PRs may be incomplete.</p>
  </div>`
      : ""
  }

  <!-- Summary Statistics -->
  <div class="card">
    <h2>Reviewer Ranking</h2>
    ${
      topReviewerSummary.topReviewers.length > 0
        ? `<p><strong>Top reviewers:</strong> ${escapeHtml(topReviewerSummary.topReviewers.join(", "))}</p>
    <p><strong>Max reviews given:</strong> ${topReviewerSummary.maxReviewsGiven}</p>
    <p><strong>Active reviewer population:</strong> ${topReviewerSummary.reviewerCount}</p>
    <p><strong>Tie size:</strong> ${topReviewerSummary.topReviewers.length} (${tieShare}% of active reviewers)</p>
    <p class="note">This ranking is a descriptive statistic over the observed active reviewer population. Ties are preserved; no inferential significance is implied.</p>`
        : '<p class="note">No active reviewers are present in the observed dataset, so the top-reviewer ranking is undefined.</p>'
    }
  </div>

  <!-- Summary Statistics -->
  <div class="card">
    <h2>Summary Statistics</h2>
    <table>
      <thead><tr><th>User</th><th title="Unique PRs reviewed">Given</th><th title="Total review submissions received (includes multiple reviews on the same PR)">Received</th><th>Approvals</th><th>Change Requests</th><th>Comments</th><th>Avg Time to 1st Review</th><th>Median Time to 1st Review</th></tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>
  </div>

  <!-- Heatmap -->
  <div class="card">
    <h2>Review Heatmap</h2>
    ${heatmapSvg}
  </div>

  <!-- Bar Charts -->
  <div class="two-col">
    <div class="card">
      <h2>Reviews Given</h2>
      ${reviewsGivenSvg}
    </div>
    <div class="card">
      <h2>Reviews Received</h2>
      ${reviewsReceivedSvg}
    </div>
  </div>

  <!-- Time Series -->
  <div class="card">
    <h2>Review Activity Over Time</h2>
    ${timeSeriesSvg}
  </div>

  <!-- Merge Correlations -->
  <div class="card">
    <h2>Merge Correlations</h2>
    <table>
      <thead><tr><th>User</th><th>PRs Authored</th><th>PRs Merged</th><th>Avg Reviews Before Merge</th><th>Median Reviews Before Merge</th><th>Zero-Review Merges</th></tr></thead>
      <tbody>${mergeRows}</tbody>
    </table>
  </div>

  <!-- AI Patterns -->
  <div class="card">
    <h2>AI &amp; Bot Patterns</h2>
    <p>AI co-authored PRs: <strong>${aiPatterns.aiCoAuthoredPRs}</strong> of ${aiPatterns.totalPRs} (${aiPatterns.botReviewPercentage.toFixed(1)}% of reviews by bots)</p>
    ${
      botRows.length > 0
        ? `<table style="margin-top:12px"><thead><tr><th>Bot Reviewer</th><th>Reviews</th></tr></thead><tbody>${botRows}</tbody></table>`
        : '<p class="note">No bot reviewers detected.</p>'
    }
  </div>

  <!-- Human Review Burden -->
  <div class="card">
    <h2>Human Review Burden by AI Involvement</h2>
    <p class="note" style="margin-bottom:12px;">Compares the review workload humans bear for AI-authored, AI-assisted, and human-only PRs. Lower values indicate less human effort required.</p>
    ${
      excludedTraditionalBotPRs > 0
        ? `<p class="note" style="margin-bottom:12px;">Traditional bot-authored PRs are excluded from this comparison cohort (${excludedTraditionalBotPRs} PR${excludedTraditionalBotPRs === 1 ? "" : "s"}), even when \`include-bots\` is enabled.</p>`
        : ""
    }
    ${renderBurdenSection(aiPatterns.humanReviewBurden)}
  </div>

  <!-- Bias Warnings -->
  <div class="card">
    <h2>Bias Warnings</h2>
    ${
      bias.flaggedPairs.length > 0
        ? `<p class="note">Pairs with unusually high review frequency (z-score flagged):</p>
           <table style="margin-top:12px"><thead><tr><th>Reviewer</th><th>Author</th><th>Count</th><th>Z-Score</th></tr></thead><tbody>${biasWarnings}</tbody></table>`
        : '<p class="note">No significant review bias detected.</p>'
    }
    <div style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 8px;">
      ${biasExplanation}
    </div>
  </div>

</div>

</body>
</html>`;
}
