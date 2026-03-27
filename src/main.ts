import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { analyzeAIPatterns } from "./analyze/ai-patterns";
import { detectBias } from "./analyze/bias-detector";
import { computeMergeCorrelations } from "./analyze/merge-correlation";
import { computeUserStats } from "./analyze/per-user-stats";
import { fetchAllPullRequests } from "./collect/fetcher";
import { applyObservationWindow } from "./collect/observation-window";
import { getConfig } from "./inputs";
import { uploadReportArtifact } from "./output/artifact";
import { writeJobSummary } from "./output/job-summary";
import { postPRComment } from "./output/pr-comment";
import type { AnalysisResult } from "./types";
import { logger } from "./utils/logger";
import { generateHtmlReport } from "./visualize/html-report";

/** Main entry point: fetches PR data, runs analysis, and publishes results. */
async function run(): Promise<void> {
  // 1. Parse inputs
  const config = getConfig();

  // 2. Create octokit
  const octokit = github.getOctokit(config.token);

  logger.info(
    `Starting review-insights for ${config.owner}/${config.repo} (${config.since} to ${config.until})`,
  );

  // 3. Fetch PR data
  const fetchedPullRequests = await fetchAllPullRequests(octokit, config);
  logger.info(`Fetched ${fetchedPullRequests.length} pull requests`);

  // 4. Freeze the dataset at config.until so reruns over the same date range
  // observe the same review/merge state instead of drifting over time.
  const pullRequests = applyObservationWindow(
    fetchedPullRequests,
    config.until,
  );

  // 5. Run analysis modules
  //    All functions are pure & synchronous (CPU-bound, no I/O), so
  //    sequential and Promise.all execution are equivalent on a single
  //    thread. True parallelism would require worker_threads, but the
  //    data-serialisation overhead outweighs the gain for in-memory analysis.
  const userStats = computeUserStats(pullRequests, config.includeBots);
  const mergeCorrelations = computeMergeCorrelations(
    pullRequests,
    config.includeBots,
  );
  const bias = detectBias(
    pullRequests,
    config.biasThreshold,
    config.includeBots,
  );
  const aiPatterns = analyzeAIPatterns(pullRequests);

  // 6. Build AnalysisResult
  const analysis: AnalysisResult = {
    userStats,
    mergeCorrelations,
    bias,
    aiPatterns,
    pullRequests,
    dateRange: {
      since: config.since,
      until: config.until,
    },
    biasThreshold: config.biasThreshold,
    includeBots: config.includeBots,
  };

  // 7. Generate HTML report and write to temp file
  const htmlReport = generateHtmlReport(analysis);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "review-insights-"));
  const reportPath = path.join(tmpDir, "review-insights-report.html");
  try {
    await fs.writeFile(reportPath, htmlReport, "utf-8");
    logger.info(`HTML report written to ${reportPath}`);

    // 8. Process output modes — each mode is independent; one failure
    //    must not prevent the remaining modes from executing.
    const outputErrors: Array<{
      mode: string;
      error: unknown;
    }> = [];
    for (const mode of config.outputModes) {
      try {
        switch (mode) {
          case "summary":
            logger.info("Writing job summary");
            await writeJobSummary(analysis);
            break;

          case "comment": {
            const pr = github.context.payload.pull_request;
            const prNumber: number | undefined = pr?.number;
            if (prNumber !== undefined) {
              logger.info(`Posting comment on PR #${prNumber}`);
              await postPRComment(
                octokit,
                config.owner,
                config.repo,
                prNumber,
                analysis,
              );
            } else {
              logger.warning(
                'Output mode "comment" skipped: not running in a pull_request context',
              );
            }
            break;
          }

          case "artifact":
            logger.info("Uploading report artifact");
            await uploadReportArtifact(reportPath);
            break;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warning(`Output mode "${mode}" failed: ${message}`);
        outputErrors.push({
          mode,
          error: err,
        });
      }
    }

    if (outputErrors.length === config.outputModes.length) {
      throw new Error(
        `All output modes failed: ${outputErrors.map((e) => e.mode).join(", ")}`,
      );
    }

    // 9. Set outputs
    core.setOutput("report-path", reportPath);
    const analyzedPRs = config.includeBots
      ? pullRequests.length
      : pullRequests.filter((pr) => !pr.authorIsBot).length;
    core.setOutput("total-prs-analyzed", analyzedPRs);

    const topReviewer = userStats.length > 0 ? userStats[0].login : "";
    core.setOutput("top-reviewer", topReviewer);
    core.setOutput("bias-detected", String(bias.flaggedPairs.length > 0));

    logger.info(
      `Review insights complete: ${analyzedPRs} PRs analyzed, ${userStats.length} users tracked`,
    );
  } catch (err: unknown) {
    // Clean up temp directory on error since report-path output won't be usable
    await fs
      .rm(tmpDir, {
        recursive: true,
        force: true,
      })
      .catch(() => {});
    throw err;
  }
}

run().catch((err: unknown) => {
  if (err instanceof Error) {
    core.error(err);
    core.setFailed(err.message);
  } else {
    core.setFailed(String(err));
  }
});
