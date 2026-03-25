import { describe, expect, it } from "vitest";
import {
  escapeForSvg,
  escapeHtml,
  validateRepositoryFormat,
} from "../../src/utils/sanitize";

describe("escapeHtml", () => {
  it("escapes & to &amp;", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes < to &lt;", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes > to &gt;", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes ' to &#39;", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("escapes ` to &#96;", () => {
    expect(escapeHtml("a`b")).toBe("a&#96;b");
  });

  it("escapes multiple characters in one string", () => {
    expect(escapeHtml('<a href="x">&`')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#96;",
    );
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("returns string with no special chars unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });
});

describe("escapeForSvg", () => {
  it("does everything escapeHtml does", () => {
    expect(escapeForSvg('<a href="x">&')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;",
    );
  });

  it("additionally escapes \\n to &#10;", () => {
    expect(escapeForSvg("line1\nline2")).toBe("line1&#10;line2");
  });

  it("additionally escapes \\r to &#13;", () => {
    expect(escapeForSvg("line1\rline2")).toBe("line1&#13;line2");
  });

  it("handles string with mix of HTML chars and newlines", () => {
    expect(escapeForSvg('<b>bold</b>\n"quoted"\r&done')).toBe(
      "&lt;b&gt;bold&lt;/b&gt;&#10;&quot;quoted&quot;&#13;&amp;done",
    );
  });
});

describe("validateRepositoryFormat", () => {
  it('returns true for valid "owner/repo" format', () => {
    expect(validateRepositoryFormat("octocat/hello-world")).toBe(true);
  });

  it("returns true for names with dots, hyphens, underscores", () => {
    expect(validateRepositoryFormat("my-org/my.repo_name")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(validateRepositoryFormat("")).toBe(false);
  });

  it("returns false for just owner with no slash", () => {
    expect(validateRepositoryFormat("owner")).toBe(false);
  });

  it("returns false for owner/repo/extra (extra segments)", () => {
    expect(validateRepositoryFormat("owner/repo/extra")).toBe(false);
  });

  it("returns false for owner/ (empty repo)", () => {
    expect(validateRepositoryFormat("owner/")).toBe(false);
  });

  it("returns false for /repo (empty owner)", () => {
    expect(validateRepositoryFormat("/repo")).toBe(false);
  });

  it("returns false for strings with spaces", () => {
    expect(validateRepositoryFormat("owner/repo name")).toBe(false);
  });

  it("returns false for strings with special chars like @, #", () => {
    expect(validateRepositoryFormat("owner@/repo#")).toBe(false);
  });
});
