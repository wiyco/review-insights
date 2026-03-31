import * as path from "node:path";
import { DefaultArtifactClient } from "@actions/artifact";
import { logger } from "../utils/logger";

const ARTIFACT_NAME = "review-insights-report";
const MISSING_ARTIFACT_ID_ERROR =
  "Artifact upload completed without returning an artifact ID";

/**
 * Uploads the HTML report file as a GitHub Actions artifact.
 * Returns the artifact ID on success.
 * Throws with a descriptive error when upload fails.
 */
export async function uploadReportArtifact(
  reportPath: string,
): Promise<string> {
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
    if (id == null) {
      throw new Error(MISSING_ARTIFACT_ID_ERROR);
    }
    const artifactId = String(id);
    logger.info(`Uploaded artifact "${ARTIFACT_NAME}" (id: ${artifactId})`);
    return artifactId;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === MISSING_ARTIFACT_ID_ERROR) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to upload artifact: ${message}`, {
      cause: err,
    });
  }
}
