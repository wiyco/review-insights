import * as core from "@actions/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("@actions/core", () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  group: vi.fn((_name: string, fn: () => Promise<unknown>) => fn()),
  startGroup: vi.fn(),
  endGroup: vi.fn(),
}));

import { logger } from "../../src/utils/logger";

describe("logger", () => {
  it("delegates debug to core.debug", () => {
    logger.debug("test debug");
    expect(core.debug).toHaveBeenCalledWith("test debug");
  });

  it("delegates info to core.info", () => {
    logger.info("test info");
    expect(core.info).toHaveBeenCalledWith("test info");
  });

  it("delegates warning to core.warning", () => {
    logger.warning("test warning");
    expect(core.warning).toHaveBeenCalledWith("test warning");
  });

  it("delegates error to core.error", () => {
    logger.error("test error");
    expect(core.error).toHaveBeenCalledWith("test error");
  });

  it("delegates error with Error object to core.error", () => {
    const err = new Error("test");
    logger.error(err);
    expect(core.error).toHaveBeenCalledWith(err);
  });

  it("delegates group to core.group and returns result", async () => {
    const result = await logger.group("grp", async () => 42);
    expect(core.group).toHaveBeenCalledWith("grp", expect.any(Function));
    expect(result).toBe(42);
  });

  it("delegates startGroup to core.startGroup", () => {
    logger.startGroup("grp");
    expect(core.startGroup).toHaveBeenCalledWith("grp");
  });

  it("delegates endGroup to core.endGroup", () => {
    logger.endGroup();
    expect(core.endGroup).toHaveBeenCalled();
  });
});
