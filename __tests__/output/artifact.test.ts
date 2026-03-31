import { describe, expect, it, vi } from "vitest";

const { mockUploadArtifact } = vi.hoisted(() => ({
  mockUploadArtifact: vi.fn().mockResolvedValue({
    id: 12345,
  }),
}));

vi.mock("@actions/artifact", () => ({
  DefaultArtifactClient: class {
    uploadArtifact = mockUploadArtifact;
  },
}));

vi.mock("../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { uploadReportArtifact } from "../../src/output/artifact";
import { logger } from "../../src/utils/logger";

describe("uploadReportArtifact", () => {
  it("returns artifact ID as string on success", async () => {
    mockUploadArtifact.mockResolvedValue({
      id: 12345,
    });

    const result = await uploadReportArtifact("/tmp/report.html");

    expect(result).toBe("12345");
  });

  it('returns "0" when the artifact ID is zero', async () => {
    mockUploadArtifact.mockResolvedValue({
      id: 0,
    });

    const result = await uploadReportArtifact("/tmp/report.html");

    expect(result).toBe("0");
  });

  it('calls uploadArtifact with correct artifact name "review-insights-report"', async () => {
    mockUploadArtifact.mockResolvedValue({
      id: 12345,
    });

    await uploadReportArtifact("/tmp/report.html");

    expect(mockUploadArtifact).toHaveBeenCalledWith(
      "review-insights-report",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("calls uploadArtifact with retentionDays: 30", async () => {
    mockUploadArtifact.mockResolvedValue({
      id: 12345,
    });

    await uploadReportArtifact("/tmp/report.html");

    expect(mockUploadArtifact).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        retentionDays: 30,
      }),
    );
  });

  it("throws when artifact id is undefined", async () => {
    mockUploadArtifact.mockResolvedValue({
      id: undefined,
    });

    await expect(uploadReportArtifact("/tmp/report.html")).rejects.toThrow(
      "Artifact upload completed without returning an artifact ID",
    );
  });

  it("throws with a descriptive message for non-Error failures", async () => {
    mockUploadArtifact.mockRejectedValue("string error");

    await expect(uploadReportArtifact("/tmp/report.html")).rejects.toThrow(
      "Failed to upload artifact: string error",
    );
  });

  it("throws on upload failure", async () => {
    mockUploadArtifact.mockRejectedValue(new Error("Upload failed"));

    await expect(uploadReportArtifact("/tmp/report.html")).rejects.toThrow(
      "Failed to upload artifact: Upload failed",
    );
  });

  it("preserves the original error as the cause on failure", async () => {
    mockUploadArtifact.mockRejectedValue(new Error("Upload failed"));

    await expect(
      uploadReportArtifact("/tmp/report.html"),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: "Upload failed",
      }),
    });
  });

  it("logs the uploaded artifact ID on success", async () => {
    mockUploadArtifact.mockResolvedValue({
      id: 987,
    });

    await uploadReportArtifact("/tmp/report.html");

    expect(logger.info).toHaveBeenCalledWith(
      'Uploaded artifact "review-insights-report" (id: 987)',
    );
  });
});
