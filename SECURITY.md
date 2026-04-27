# Security Policy

## Supported Versions

JobFlow is currently in active development. Security fixes are applied to the
latest state of `master`.

## Reporting a Vulnerability

Please do not open public issues for sensitive vulnerabilities.

Instead, report with:

- A clear description of the issue
- Impact and affected components
- Reproduction steps or proof of concept
- Suggested remediation (if available)

Maintainers will acknowledge reports as quickly as possible, investigate, and
publish a fix plan.

## Security Best Practices for Contributors

- Never commit secrets (`.env`, API keys, tokens, credentials).
- Validate and sanitize external input.
- Use least privilege for integrations and credentials.
- Keep dependencies updated and pinned where appropriate.
