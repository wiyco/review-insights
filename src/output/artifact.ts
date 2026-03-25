import * as path from "node:path";
import { DefaultArtifactClient } from "@actions/artifact";
import { logger } from "../utils/logger";

const ARTIFACT_NAME = "review-insights-report";

/**
 * Uploads the HTML report file as a GitHub Actions artifact.
 * Returns the artifact ID on success, or null on failure.
 * Errors are logged as warnings but do not fail the action.
 */
export async function uploadReportArtifact(
  reportPath: string,
): Promise<string | null> {
  try {
    const client = new DefaultArtifactClient();
    const { id } = await client.uploadArtifact(
      ARTIFACT_NAME,
      [
        reportPath,
      ],
      path.dirname(reportPath),
      {
        retentionDays: 30,
      },
    );
    logger.info(`Uploaded artifact "${ARTIFACT_NAME}" (id: ${id})`);
    return id != null ? String(id) : null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warning(`Failed to upload artifact: ${message}`);
    return null;
  }
}
