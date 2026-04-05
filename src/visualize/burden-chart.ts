import type {
  HumanReviewBurden,
  HumanReviewBurdenGroup,
  PRSizeTier,
} from "../types";
import { formatDuration } from "../utils/format";
import { group, line, rect, svgDoc, text } from "./svg-renderer";

/**
 * Category colors for AI burden comparison charts.
 * Chosen for sufficient contrast and colorblind accessibility (purple/blue/gray).
 */
const CATEGORY_COLORS = {
  aiAuthored: "#7c3aed",
  aiAssisted: "#2563eb",
  humanOnly: "#64748b",
} as const;

const CATEGORY_LABELS = {
  aiAuthored: "AI-authored",
  aiAssisted: "AI-assisted",
  humanOnly: "Human-only",
} as const;

type CategoryKey = keyof typeof CATEGORY_LABELS;
const CATEGORIES: CategoryKey[] = [
  "aiAuthored",
  "aiAssisted",
  "humanOnly",
];

interface MetricDef {
  key: string;
  label: string;
  unit: "count" | "duration" | "rate" | "rounds";
  extract: (g: HumanReviewBurdenGroup) => {
    median: number | null;
    p90: number | null;
  };
}

const METRICS: MetricDef[] = [
  {
    key: "humanReviewsPerPR",
    label: "Reviews / PR",
    unit: "count",
    extract: (g) => ({
      median: g.humanReviewsPerPR.median,
      p90: g.humanReviewsPerPR.p90,
    }),
  },
  {
    key: "firstReviewLatencyMs",
    label: "Time to 1st Review",
    unit: "duration",
    extract: (g) => ({
      median: g.firstReviewLatencyMs.median,
      p90: g.firstReviewLatencyMs.p90,
    }),
  },
  {
    key: "changeRequestRate",
    label: "Change Request Rate",
    unit: "rate",
    extract: (g) => ({
      median: g.changeRequestRate.median,
      p90: null,
    }),
  },
  {
    key: "reviewRounds",
    label: "Review Rounds",
    unit: "rounds",
    extract: (g) => ({
      median: g.reviewRounds.median,
      p90: g.reviewRounds.p90,
    }),
  },
];

/**
 * Formats a metric value for display based on its unit type.
 */
function formatValue(value: number | null, unit: MetricDef["unit"]): string {
  if (value == null) return "N/A";
  switch (unit) {
    case "duration":
      return formatDuration(value);
    case "rate":
      return `${(value * 100).toFixed(0)}%`;
    case "count":
    case "rounds":
      return value.toFixed(1);
  }
}

/**
 * Converts a metric value to hours for the duration unit, or returns
 * the raw value for other units. Used for chart scaling.
 */
function toChartValue(value: number | null, unit: MetricDef["unit"]): number {
  if (value == null) return 0;
  if (unit === "duration") return value / 3_600_000;
  return value;
}

/**
 * Formats a chart-axis value for display.
 */
function formatAxisValue(value: number, unit: MetricDef["unit"]): string {
  switch (unit) {
    case "duration": {
      // value is in hours (converted by toChartValue)
      const ms = value * 3_600_000;
      return formatDuration(ms);
    }
    case "rate":
      return `${(value * 100).toFixed(0)}%`;
    case "count":
    case "rounds":
      return value.toFixed(1);
  }
}

/**
 * Renders a single grouped bar chart comparing median values across
 * AI categories for one burden metric. P90 is shown as a whisker line.
 *
 * Returns an empty string if all categories have null median values.
 */
function renderMetricChart(
  metric: MetricDef,
  burden: HumanReviewBurden,
): string {
  const data = CATEGORIES.map((cat) => {
    const vals = metric.extract(burden[cat]);
    return {
      cat,
      median: vals.median,
      p90: vals.p90,
      medianChart: toChartValue(vals.median, metric.unit),
      p90Chart: toChartValue(vals.p90, metric.unit),
      n: burden[cat].prCount,
    };
  });

  // Skip chart if all medians are null (no data)
  if (data.every((d) => d.median == null)) return "";

  const paddingLeft = 10;
  const labelWidth = 100;
  const chartLeft = paddingLeft + labelWidth;
  const barAreaWidth = 300;
  const valueWidth = 80;
  const paddingRight = 10;
  const totalWidth = chartLeft + barAreaWidth + valueWidth + paddingRight;

  const titleHeight = 30;
  const barHeight = 20;
  const groupGap = 8;
  const barGap = 4;
  const groupHeight =
    CATEGORIES.length * barHeight + (CATEGORIES.length - 1) * barGap;
  const paddingTop = titleHeight + 10;
  const paddingBottom = 25;
  const totalHeight = paddingTop + groupHeight + groupGap + paddingBottom;

  // Determine max value for scaling (use p90 if available, else median).
  // When all values are zero, use a unit-specific default so the axis
  // shows a meaningful scale instead of repetitive "0" ticks.
  const computedMax = Math.max(
    ...data.map((d) => Math.max(d.medianChart, d.p90Chart)),
  );
  const defaultMax: Record<MetricDef["unit"], number> = {
    count: 1,
    rounds: 1,
    rate: 0.1,
    duration: 1, // 1 hour
  };
  const maxVal = computedMax > 0 ? computedMax : defaultMax[metric.unit];

  const parts: string[] = [];

  // Title
  parts.push(
    text(totalWidth / 2, 18, metric.label, {
      fontSize: 13,
      fontWeight: "600",
      anchor: "middle",
      fill: "#1e293b",
    }),
  );

  // Gridlines
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const x = chartLeft + (barAreaWidth * i) / gridSteps;
    parts.push(
      line(x, paddingTop - 5, x, paddingTop + groupHeight + 5, "#e2e8f0", 1),
    );
    const gridVal = (maxVal * i) / gridSteps;
    parts.push(
      text(
        x,
        paddingTop + groupHeight + 18,
        formatAxisValue(gridVal, metric.unit),
        {
          fontSize: 9,
          fill: "#94a3b8",
          anchor: "middle",
        },
      ),
    );
  }

  // Bars
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const y = paddingTop + i * (barHeight + barGap);
    const color = CATEGORY_COLORS[d.cat];

    // Category label
    parts.push(
      text(
        chartLeft - 6,
        y + barHeight / 2,
        `${CATEGORY_LABELS[d.cat]} (n=${d.n})`,
        {
          fontSize: 10,
          fill: "#475569",
          anchor: "end",
          dy: "0.35em",
        },
      ),
    );

    if (d.median != null) {
      // Median bar
      const rawW = (d.medianChart / maxVal) * barAreaWidth;
      const barW = rawW > 0 ? Math.max(1, rawW) : 0;
      const barRight = chartLeft + barW;
      parts.push(
        rect(chartLeft, y, barW, barHeight, color, {
          rx: 3,
          opacity: 0.8,
          title: `${CATEGORY_LABELS[d.cat]}: median=${formatValue(d.median, metric.unit)}${d.p90 != null ? `, p90=${formatValue(d.p90, metric.unit)}` : ""}`,
        }),
      );

      // P90 whisker (if different from median)
      if (d.p90 != null && d.p90Chart > d.medianChart) {
        const p90x = chartLeft + (d.p90Chart / maxVal) * barAreaWidth;
        const whiskerY = y + barHeight / 2;
        if (p90x > barRight) {
          const rawBarRight = chartLeft + rawW;
          parts.push(line(rawBarRight, whiskerY, p90x, whiskerY, color, 1.5));
          // Whisker cap
          parts.push(line(p90x, y + 3, p90x, y + barHeight - 3, color, 1.5));
        }
      }

      // Value label (median)
      parts.push(
        text(
          chartLeft + barAreaWidth + 6,
          y + barHeight / 2,
          formatValue(d.median, metric.unit),
          {
            fontSize: 10,
            fontWeight: "600",
            fill: "#1e293b",
            anchor: "start",
            dy: "0.35em",
          },
        ),
      );
    } else {
      parts.push(
        text(chartLeft + 6, y + barHeight / 2, "No data", {
          fontSize: 10,
          fill: "#94a3b8",
          anchor: "start",
          dy: "0.35em",
        }),
      );
    }
  }

  return svgDoc(totalWidth, totalHeight, group(parts.join("\n")));
}

/**
 * Renders the complete burden comparison visualization as an HTML string.
 * Includes:
 * 1. PR count cards per AI category
 * 2. Grouped bar charts for each burden metric (median + p90 whisker)
 * 3. Detailed metrics table with median, p90, and sample sizes
 * 4. Size-stratified breakdown table
 *
 * Returns a no-data note if all categories have zero PRs.
 */
export function renderBurdenSection(burden: HumanReviewBurden): string {
  const totalPRs =
    burden.aiAuthored.prCount +
    burden.aiAssisted.prCount +
    burden.humanOnly.prCount;

  if (totalPRs === 0) {
    return '<p class="note">No PR data available for human review burden analysis.</p>';
  }

  const parts: string[] = [];

  // --- 1. PR distribution cards ---
  parts.push(
    '<div style="display:flex;gap:16px;flex-wrap:wrap;margin:16px 0;">',
  );
  for (const cat of CATEGORIES) {
    const g = burden[cat];
    const pct = ((g.prCount / totalPRs) * 100).toFixed(1);
    const color = CATEGORY_COLORS[cat];
    parts.push(
      `<div style="flex:1;min-width:140px;padding:12px 16px;border-radius:6px;border:2px solid ${color};text-align:center;">` +
        `<div style="font-size:22px;font-weight:700;color:${color};">${g.prCount}</div>` +
        `<div style="font-size:12px;color:#64748b;">${CATEGORY_LABELS[cat]}</div>` +
        `<div style="font-size:11px;color:#94a3b8;">${pct}%</div>` +
        `</div>`,
    );
  }
  parts.push("</div>");

  // --- 2. Grouped bar charts ---
  const charts = METRICS.map((m) => renderMetricChart(m, burden)).filter(
    (s) => s !== "",
  );
  if (charts.length > 0) {
    parts.push(
      '<p class="note" style="margin:12px 0 4px;">Bars show <strong>median</strong> (typical burden). Whisker lines extend to <strong>p90</strong> where available (worst-case burden). Change Request Rate shows median only. Higher values = more human effort.</p>',
    );
    parts.push(
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px;margin:8px 0 16px;">',
    );
    for (const chart of charts) {
      parts.push(`<div>${chart}</div>`);
    }
    parts.push("</div>");
  }

  // --- 3. Detailed metrics table ---
  parts.push(renderMetricsTable(burden));

  // --- 4. Size-stratified table ---
  parts.push(renderStratifiedTable(burden));

  return parts.join("\n");
}

/**
 * Renders a detailed comparison table of all burden metrics across categories.
 * Shows median, p90, and unreviewedRate side by side with sample sizes.
 */
function renderMetricsTable(burden: HumanReviewBurden): string {
  const rows: string[] = [];

  // Header
  rows.push('<table style="margin-top:16px;">');
  rows.push("<thead><tr>");
  rows.push("<th>Metric</th>");
  for (const cat of CATEGORIES) {
    rows.push(
      `<th style="text-align:center;" colspan="2">${CATEGORY_LABELS[cat]}<br><span style="font-weight:400;font-size:11px;">n=${burden[cat].prCount}</span></th>`,
    );
  }
  rows.push("</tr>");
  rows.push("<tr>");
  rows.push("<th></th>");
  for (const _cat of CATEGORIES) {
    rows.push('<th style="text-align:center;font-size:12px;">Median</th>');
    rows.push('<th style="text-align:center;font-size:12px;">P90</th>');
  }
  rows.push("</tr></thead>");

  rows.push("<tbody>");

  // Metric rows
  for (const m of METRICS) {
    rows.push("<tr>");
    rows.push(`<td style="font-weight:600;">${m.label}</td>`);
    for (const cat of CATEGORIES) {
      const vals = m.extract(burden[cat]);
      rows.push(
        `<td style="text-align:center;">${formatValue(vals.median, m.unit)}</td>`,
      );
      rows.push(
        `<td style="text-align:center;color:#64748b;">${formatValue(vals.p90, m.unit)}</td>`,
      );
    }
    rows.push("</tr>");
  }

  // Unreviewed rate row (survivorship bias indicator)
  rows.push("<tr>");
  rows.push(
    '<td style="font-weight:600;">Unreviewed Rate <span style="font-size:11px;color:#94a3b8;">*</span></td>',
  );
  for (const cat of CATEGORIES) {
    const rate = burden[cat].unreviewedRate;
    const display = rate != null ? `${(rate * 100).toFixed(1)}%` : "N/A";
    // Highlight high unreviewed rates as a warning
    const style =
      rate != null && rate > 0.2
        ? "text-align:center;color:#dc2626;font-weight:600;"
        : "text-align:center;";
    rows.push(`<td style="${style}" colspan="2">${display}</td>`);
  }
  rows.push("</tr>");

  rows.push("</tbody></table>");
  rows.push(
    '<p class="note">* Unreviewed Rate: fraction of PRs that received no qualifying human review (i.e., no non-bot, non-PENDING, non-self review with a timestamp at or after PR creation). Reported alongside latency to expose survivorship bias — high rates mean the latency metric only reflects the PRs that were actually reviewed on time.</p>',
  );

  return rows.join("\n");
}

/**
 * Renders a size-stratified breakdown table controlling for PR size confounding.
 * Only shows size tiers that have data in at least one category.
 */
function renderStratifiedTable(burden: HumanReviewBurden): string {
  const sizeTiers: PRSizeTier[] = [
    "S",
    "M",
    "L",
    "Empty",
  ];
  const sizeLabels: Record<PRSizeTier, string> = {
    S: "Small (1\u201350)",
    M: "Medium (51\u2013300)",
    L: "Large (301+)",
    Empty: "Empty (0)",
  };

  // Only include tiers with data in at least one category
  const activeTiers = sizeTiers.filter((tier) => {
    const cell = burden.stratifiedBySize[tier];
    return (
      (cell.aiAuthored != null && cell.aiAuthored.prCount > 0) ||
      (cell.aiAssisted != null && cell.aiAssisted.prCount > 0) ||
      (cell.humanOnly != null && cell.humanOnly.prCount > 0)
    );
  });

  if (activeTiers.length === 0) {
    return '<p class="note" style="margin-top:16px;">No size-stratified data available (fewer than 3 PRs per size tier).</p>';
  }

  const rows: string[] = [];
  rows.push(
    '<h3 style="font-size:15px;font-weight:600;margin:20px 0 8px;color:#1e293b;">Size-Stratified Comparison</h3>',
  );
  rows.push(
    '<p class="note" style="margin-bottom:8px;">Controls for PR size confounding. Compare values <em>within</em> the same size tier to isolate the effect of AI involvement. Cells with fewer than 3 PRs show "—".</p>',
  );

  rows.push("<table>");
  rows.push("<thead><tr>");
  rows.push("<th>Size Tier</th><th>Metric</th>");
  for (const cat of CATEGORIES) {
    rows.push(`<th style="text-align:center;">${CATEGORY_LABELS[cat]}</th>`);
  }
  rows.push("</tr></thead><tbody>");

  for (const tier of activeTiers) {
    const cell = burden.stratifiedBySize[tier];
    const metricsToShow: {
      label: string;
      unit: MetricDef["unit"];
      extract: (g: HumanReviewBurdenGroup) => number | null;
    }[] = [
      {
        label: "Reviews / PR (med)",
        unit: "count",
        extract: (g) => g.humanReviewsPerPR.median,
      },
      {
        label: "1st Review Latency (med)",
        unit: "duration",
        extract: (g) => g.firstReviewLatencyMs.median,
      },
      {
        label: "Change Req. Rate (med)",
        unit: "rate",
        extract: (g) => g.changeRequestRate.median,
      },
      {
        label: "Review Rounds (med)",
        unit: "rounds",
        extract: (g) => g.reviewRounds.median,
      },
    ];

    for (let mi = 0; mi < metricsToShow.length; mi++) {
      const m = metricsToShow[mi];
      rows.push("<tr>");
      if (mi === 0) {
        rows.push(
          `<td rowspan="${metricsToShow.length}" style="font-weight:600;vertical-align:top;">${sizeLabels[tier]}</td>`,
        );
      }
      rows.push(`<td style="font-size:13px;">${m.label}</td>`);

      for (const cat of CATEGORIES) {
        const grp = cell[cat];
        if (grp == null) {
          rows.push('<td style="text-align:center;color:#cbd5e1;">—</td>');
        } else {
          const val = m.extract(grp);
          const n = grp.prCount;
          rows.push(
            `<td style="text-align:center;">${formatValue(val, m.unit)} <span style="font-size:10px;color:#94a3b8;">(n=${n})</span></td>`,
          );
        }
      }
      rows.push("</tr>");
    }
  }

  rows.push("</tbody></table>");
  return rows.join("\n");
}
