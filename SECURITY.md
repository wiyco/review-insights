# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| v1.x    | ✅        |
| v2.x    | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it through [GitHub's private vulnerability reporting](https://github.com/wiyco/review-insights/security/advisories).

**Please do NOT open a public issue for security vulnerabilities.**

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgement**: within 7 business days
- **Initial assessment**: within 14 business days
- **Fix release**: depends on severity, typically within 21 days for critical issues

## Scope

This action processes GitHub API data (pull request metadata, review information, and user logins). Security concerns include but are not limited to:

- Token handling and exposure
- XSS in generated HTML/SVG reports
- Injection via user-controlled inputs (PR titles, usernames)
- GraphQL query injection
- GitHub Actions output injection
