# Security Policy

ForgeRPA takes security seriously. This document explains how to report
suspected vulnerabilities in this repository (the forgerpa-website Astro
static site) or in the services it powers.

## Reporting a vulnerability

**Please do not file a public GitHub issue for security reports.** Instead,
email the details to:

> **security@forgerpa.com**

If you do not receive a response within 48 hours, please follow up to:

> **david.farley@forgerpa.com**

When reporting, include:

- A clear description of the issue and its potential impact.
- Steps to reproduce, including any proof-of-concept code or URLs.
- The affected page, asset, or build artifact if known.
- Any relevant logs or screenshots.
- Your name and contact info if you would like credit in the disclosure.

## What to expect

- **Acknowledgement** within 48 hours of your initial report.
- **Triage and severity assessment** within 5 business days.
- **Status updates** at least once per week until the issue is resolved.
- **Coordinated disclosure** — we will work with you on a public disclosure
  timeline once a fix is available. We aim for fixes within 90 days for
  critical issues and ask reporters to keep details private until then.

## Scope

In scope:

- Source content (Markdown, MDX, Astro components) in this repository.
- Build configuration and the resulting static site at forgerpa.com.
- Cloudflare Pages deployment configuration committed to this repo.

Out of scope (please report to the relevant project instead):

- Issues in third-party dependencies — please report upstream and let us
  know so we can pin or replace them.
- Cloudflare platform issues — report to Cloudflare directly.
- Social-engineering attacks against ForgeRPA staff.
- Denial-of-service attacks that require sustained automated traffic.

## Safe harbor

We will not take legal action against good-faith security research that:

- Avoids privacy violations, data destruction, and service disruption.
- Only interacts with accounts you own or have explicit permission to test.
- Reports the issue through the channel above before any public disclosure.
- Does not exfiltrate data beyond what is necessary to demonstrate the issue.

Thank you for helping keep ForgeRPA and our customers safe.
