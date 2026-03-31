import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockWriteJobSummary,
  mockPostPRComment,
  mockUploadReportArtifact,
  mockLogger,
} = vi.hoisted(() => ({
  mockWriteJobSummary: vi.fn(),
  mockPostPRComment: vi.fn(),
  mockUploadReportArtifact: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../../src/output/job-summary", () => ({
  writeJobSummary: mockWriteJobSummary,
}));

vi.mock("../../src/output/pr-comment", () => ({
  postPRComment: mockPostPRComment,
}));

vi.mock("../../src/output/artifact", () => ({
  uploadReportArtifact: mockUploadReportArtifact,
}));

vi.mock("../../src/utils/logger", () => ({
  logger: mockLogger,
}));

import { processOutputModes } from "../../src/output/process-output-modes";

describe("processOutputModes", () => {
  const analysis = {} as never;
  const octokit = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteJobSummary.mockResolvedValue(undefined);
    mockPostPRComment.mockResolvedValue(undefined);
    mockUploadReportArtifact.mockResolvedValue("123");
  });

  it("fails when comment mode is requested outside a pull_request event", async () => {
    await expect(
      processOutputModes({
        outputModes: [
          "comment",
        ],
        analysis,
        reportPath: "/tmp/report.html",
        octokit,
        owner: "my-org",
        repo: "my-repo",
      }),
    ).rejects.toThrow("No output modes succeeded: comment");

    expect(mockPostPRComment).not.toHaveBeenCalled();
    expect(mockLogger.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'Output mode "comment" failed: Output mode "comment" requires a pull_request event',
      ),
    );
  });

  it("continues to later modes after comment mode fails outside pull_request", async () => {
    await expect(
      processOutputModes({
        outputModes: [
          "comment",
          "summary",
        ],
        analysis,
        reportPath: "/tmp/report.html",
        octokit,
        owner: "my-org",
        repo: "my-repo",
      }),
    ).resolves.toBe(1);

    expect(mockPostPRComment).not.toHaveBeenCalled();
    expect(mockWriteJobSummary).toHaveBeenCalledWith(analysis);
    expect(mockLogger.warning).toHaveBeenCalledTimes(1);
  });

  it("returns the number of output modes that actually succeed", async () => {
    await expect(
      processOutputModes({
        outputModes: [
          "summary",
          "comment",
          "artifact",
        ],
        analysis,
        reportPath: "/tmp/report.html",
        octokit,
        owner: "my-org",
        repo: "my-repo",
        pullRequestNumber: 42,
      }),
    ).resolves.toBe(3);

    expect(mockWriteJobSummary).toHaveBeenCalledWith(analysis);
    expect(mockPostPRComment).toHaveBeenCalledWith(
      octokit,
      "my-org",
      "my-repo",
      42,
      analysis,
    );
    expect(mockUploadReportArtifact).toHaveBeenCalledWith("/tmp/report.html");
    expect(mockLogger.warning).not.toHaveBeenCalled();
  });

  it("fails artifact mode when upload does not complete successfully", async () => {
    mockUploadReportArtifact.mockRejectedValue(
      new Error("Failed to upload artifact: Upload failed"),
    );

    await expect(
      processOutputModes({
        outputModes: [
          "artifact",
        ],
        analysis,
        reportPath: "/tmp/report.html",
        octokit,
        owner: "my-org",
        repo: "my-repo",
      }),
    ).rejects.toThrow("No output modes succeeded: artifact");

    expect(mockLogger.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'Output mode "artifact" failed: Failed to upload artifact: Upload failed',
      ),
    );
  });

  it("aggregates failed modes in order when every mode fails", async () => {
    mockWriteJobSummary.mockRejectedValue(new Error("summary failed"));
    mockUploadReportArtifact.mockRejectedValue(
      new Error("Failed to upload artifact: Upload failed"),
    );

    await expect(
      processOutputModes({
        outputModes: [
          "summary",
          "comment",
          "artifact",
        ],
        analysis,
        reportPath: "/tmp/report.html",
        octokit,
        owner: "my-org",
        repo: "my-repo",
      }),
    ).rejects.toThrow("No output modes succeeded: summary, comment, artifact");

    expect(mockWriteJobSummary).toHaveBeenCalledTimes(1);
    expect(mockPostPRComment).not.toHaveBeenCalled();
    expect(mockUploadReportArtifact).toHaveBeenCalledTimes(1);
    expect(mockLogger.warning).toHaveBeenCalledTimes(3);
  });

  it("stringifies non-Error failures and continues to later modes", async () => {
    mockWriteJobSummary.mockRejectedValue({
      reason: "summary exploded",
    });

    await expect(
      processOutputModes({
        outputModes: [
          "summary",
          "artifact",
        ],
        analysis,
        reportPath: "/tmp/report.html",
        octokit,
        owner: "my-org",
        repo: "my-repo",
      }),
    ).resolves.toBe(1);

    expect(mockLogger.warning).toHaveBeenCalledWith(
      'Output mode "summary" failed: [object Object]',
    );
    expect(mockUploadReportArtifact).toHaveBeenCalledWith("/tmp/report.html");
  });

  it("fails unknown output modes explicitly", async () => {
    await expect(
      processOutputModes({
        outputModes: [
          "unexpected" as never,
        ],
        analysis,
        reportPath: "/tmp/report.html",
        octokit,
        owner: "my-org",
        repo: "my-repo",
      }),
    ).rejects.toThrow("No output modes succeeded: unexpected");

    expect(mockLogger.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'Output mode "unexpected" failed: Unhandled output mode: unexpected',
      ),
    );
  });

  it("fails explicitly when called with no output modes", async () => {
    await expect(
      processOutputModes({
        outputModes: [],
        analysis,
        reportPath: "/tmp/report.html",
        octokit,
        owner: "my-org",
        repo: "my-repo",
      }),
    ).rejects.toThrow("No output modes succeeded");

    expect(mockWriteJobSummary).not.toHaveBeenCalled();
    expect(mockPostPRComment).not.toHaveBeenCalled();
    expect(mockUploadReportArtifact).not.toHaveBeenCalled();
    expect(mockLogger.warning).not.toHaveBeenCalled();
  });
});
