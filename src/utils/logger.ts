import * as core from "@actions/core";

/**
 * Thin wrapper around @actions/core logging methods for consistent usage.
 */
export const logger = {
  debug(message: string): void {
    core.debug(message);
  },

  info(message: string): void {
    core.info(message);
  },

  warning(message: string): void {
    core.warning(message);
  },

  error(message: string | Error): void {
    core.error(message);
  },

  /**
   * Creates a collapsible group in the Actions log.
   */
  async group<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return core.group(name, fn);
  },

  /**
   * Starts a group (without auto-close).
   */
  startGroup(name: string): void {
    core.startGroup(name);
  },

  /**
   * Ends the current group.
   */
  endGroup(): void {
    core.endGroup();
  },
} as const;
