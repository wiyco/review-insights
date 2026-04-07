import { computeTopReviewerSummary } from "../analyze/top-reviewers";
import type { AnalysisResult } from "../types";
import { formatDuration } from "../utils/format";
import {
  getDataCompletenessLabel,
  getPartialDataWarning,
} from "../utils/partial-data";
import { getReviewFetchLimitWarning } from "../utils/review-fetch-limit";
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

  // Build the PR population used by PR-level KPIs, truncation warnings, and
  // the time series. Reviewer-derived KPIs use userStats instead; userStats
  // already applies the qualifying-review rules for per-user metrics.
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

  const dataCompleteness = getDataCompletenessLabel(
    partialData,
    partialDataReason,
  );
  const partialDataWarning = getPartialDataWarning(partialDataReason);
  const reviewFetchLimitWarning = getReviewFetchLimitWarning(filteredPRs);

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
        <td>${m.avgReviewsBeforeMerge != null ? m.avgReviewsBeforeMerge.toFixed(1) : "N/A"}</td>
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
  const excludedTraditionalBotPRs = pullRequests.filter(
    (pr) => pr.authorIsBot,
  ).length;
  const unclassifiedAIMetadataPRs = pullRequests.filter(
    (pr) => !pr.authorIsBot && pr.aiCategory == null,
  ).length;
  const unobservableSizePRs = pullRequests.filter(
    (pr) =>
      !pr.authorIsBot &&
      pr.aiCategory != null &&
      (pr.additions == null || pr.deletions == null),
  ).length;
  const biasModelFitError = bias.modelFitError;
  const biasWarningUnavailable = biasModelFitError != null;
  const biasUnavailableNotice =
    biasModelFitError == null
      ? ""
      : `<p class="warn">Bias warnings unavailable: ${escapeHtml(biasModelFitError)}</p>
           <p class="note">The review matrix and Gini coefficient are still reported because they do not depend on a successful quasi-independence fit.</p>`;

  // Bias warnings
  const biasWarnings = bias.flaggedPairs
    .sort((a, b) => b.pearsonResidual - a.pearsonResidual)
    .map(
      (fp) =>
        `<tr>
          <td>${escapeHtml(fp.reviewer)}</td>
          <td>${escapeHtml(fp.author)}</td>
          <td>${fp.count}</td>
          <td>${fp.expectedCount.toFixed(2)}</td>
          <td>${fp.pearsonResidual.toFixed(2)}</td>
        </tr>`,
    )
    .join("\n");

  const biasExplanation = `
    <p class="note">Bias is detected using a <strong>Pearson residual</strong> from a reviewer-author quasi-independence model on the observed interaction graph. The model matches each reviewer's total outgoing reviews and each author's total incoming reviews, so high-volume people are not flagged merely for being active.</p>
    <p class="note">Pairs are flagged when their observed review count exceeds the model's expected count by more than <strong>${biasThreshold.toFixed(1)}</strong> residual units (i.e. Residual &gt; ${biasThreshold.toFixed(1)}). This is an exploratory diagnostic, not a multiplicity-adjusted significance test.</p>
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
    reviewFetchLimitWarning
      ? `<div class="card" style="border-color: var(--warn);">
    <p class="warn">Warning: ${escapeHtml(reviewFetchLimitWarning)}</p>
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
        ? `<p class="note" style="margin-bottom:12px;">Traditional bot-authored PRs are excluded from this comparison cohort (${excludedTraditionalBotPRs} PR${excludedTraditionalBotPRs === 1 ? "" : "s"}).</p>`
        : ""
    }
    ${
      unclassifiedAIMetadataPRs > 0
        ? `<p class="note" style="margin-bottom:12px;">PRs with AI classification that is not observable at the cutoff are excluded from this comparison cohort (${unclassifiedAIMetadataPRs} PR${unclassifiedAIMetadataPRs === 1 ? "" : "s"}). This avoids using commit metadata that may have changed after the analysis window.</p>`
        : ""
    }
    ${
      unobservableSizePRs > 0
        ? `<p class="note" style="margin-bottom:12px;">Size-stratified cells exclude PRs whose size at the cutoff is not observable (${unobservableSizePRs} PR${unobservableSizePRs === 1 ? "" : "s"}).</p>`
        : ""
    }
    ${renderBurdenSection(aiPatterns.humanReviewBurden)}
  </div>

  <!-- Bias Warnings -->
  <div class="card">
    <h2>Bias Warnings</h2>
    ${
      biasWarningUnavailable
        ? biasUnavailableNotice
        : bias.flaggedPairs.length > 0
          ? `<p class="note">Pairs whose observed review frequency materially exceeds the activity-adjusted expectation:</p>
           <table style="margin-top:12px"><thead><tr><th>Reviewer</th><th>Author</th><th>Count</th><th>Expected</th><th>Residual</th></tr></thead><tbody>${biasWarnings}</tbody></table>`
          : '<p class="note">No reviewer-author pair exceeds the configured activity-adjusted bias threshold.</p>'
    }
    <div style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 8px;">
      ${biasExplanation}
    </div>
  </div>

</div>

</body>
</html>`;
}
