const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  // Backticks can act as attribute delimiters in legacy IE parsers.
  // Not exploitable in current usage (element content only), but included
  // as defense-in-depth in case escapeHtml is later used in attribute context.
  "`": "&#96;",
};

const HTML_ESCAPE_PATTERN = /[&<>"'`]/g;

/**
 * Escapes HTML special characters to prevent XSS in generated output.
 */
export function escapeHtml(str: string): string {
  return str.replace(HTML_ESCAPE_PATTERN, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * Escapes a string for safe use inside SVG elements.
 * Handles the same characters as escapeHtml plus newlines.
 */
export function escapeForSvg(str: string): string {
  return escapeHtml(str).replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");
}

const REPOSITORY_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/**
 * Validates that a repository string matches the expected "owner/repo" format.
 */
export function validateRepositoryFormat(repo: string): boolean {
  return REPOSITORY_PATTERN.test(repo);
}
