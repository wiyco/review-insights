import type { AnalysisResult, OutputMode } from "../types";
import { logger } from "../utils/logger";
import { uploadReportArtifact } from "./artifact";
import { writeJobSummary } from "./job-summary";
import { postPRComment } from "./pr-comment";

interface ProcessOutputModesParams {
  outputModes: OutputMode[];
  analysis: AnalysisResult;
  reportPath: string;
  octokit: ReturnType<typeof import("@actions/github").getOctokit>;
  owner: string;
  repo: string;
  pullRequestNumber?: number;
}

/**
 * Runs each configured output mode independently and returns the number of
 * modes that completed successfully.
 */
export async function processOutputModes(
  params: ProcessOutputModesParams,
): Promise<number> {
  const {
    outputModes,
    analysis,
    reportPath,
    octokit,
    owner,
    repo,
    pullRequestNumber,
  } = params;

  const outputErrors: Array<{
    mode: OutputMode;
    error: unknown;
  }> = [];

  let successfulModes = 0;

  for (const mode of outputModes) {
    try {
      switch (mode) {
        case "summary":
          logger.info("Writing job summary");
          await writeJobSummary(analysis);
          successfulModes++;
          break;

        case "comment":
          if (pullRequestNumber === undefined) {
            throw new Error(
              'Output mode "comment" requires a pull_request event',
            );
          }
          logger.info(`Posting comment on PR #${pullRequestNumber}`);
          await postPRComment(
            octokit,
            owner,
            repo,
            pullRequestNumber,
            analysis,
          );
          successfulModes++;
          break;

        case "artifact": {
          logger.info("Uploading report artifact");
          await uploadReportArtifact(reportPath);
          successfulModes++;
          break;
        }

        default: {
          const exhaustiveCheck: never = mode;
          throw new Error(`Unhandled output mode: ${String(exhaustiveCheck)}`);
        }
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

  if (successfulModes === 0) {
    const failedModes = outputErrors.map((e) => e.mode).join(", ");
    throw new Error(
      failedModes
        ? `No output modes succeeded: ${failedModes}`
        : "No output modes succeeded",
    );
  }

  return successfulModes;
}
