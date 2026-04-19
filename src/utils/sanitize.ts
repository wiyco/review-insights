const HTML_ESCAPE_PATTERN = /[&<>"'`]/g;

/**
 * Escapes HTML special characters to prevent XSS in generated output.
 */
export function escapeHtml(str: string): string {
  return str.replace(HTML_ESCAPE_PATTERN, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    if (char === "'") return "&#39;";
    return "&#96;";
  });
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
