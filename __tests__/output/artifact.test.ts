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
    warning: vi.fn(),
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

  it("returns null when artifact id is undefined", async () => {
    mockUploadArtifact.mockResolvedValue({
      id: undefined,
    });

    const result = await uploadReportArtifact("/tmp/report.html");

    expect(result).toBeNull();
  });

  it("logs warning with non-Error thrown value", async () => {
    mockUploadArtifact.mockRejectedValue("string error");

    const result = await uploadReportArtifact("/tmp/report.html");

    expect(result).toBeNull();
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining("string error"),
    );
  });

  it("returns null on upload failure", async () => {
    mockUploadArtifact.mockRejectedValue(new Error("Upload failed"));

    const result = await uploadReportArtifact("/tmp/report.html");

    expect(result).toBeNull();
  });

  it("logs warning on failure", async () => {
    mockUploadArtifact.mockRejectedValue(new Error("Upload failed"));

    await uploadReportArtifact("/tmp/report.html");

    expect(logger.warning).toHaveBeenCalled();
  });

  it("does not throw on failure", async () => {
    mockUploadArtifact.mockRejectedValue(new Error("Upload failed"));

    await expect(
      uploadReportArtifact("/tmp/report.html"),
    ).resolves.not.toThrow();
  });
});
