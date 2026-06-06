# Security Policy

## Supported versions

Modern Admin is pre-1.0 software. Security fixes land on the latest
published `0.x` release line. Always run the most recent version before
reporting an issue.

| Version      | Supported         |
|--------------|-------------------|
| latest `0.x` | ✅                 |
| older `0.x`  | ❌ (upgrade first) |

## Reporting a vulnerability

**Please do not open public issues for security vulnerabilities.**

Report privately through GitHub's
[private vulnerability reporting](https://github.com/modern-admin/modern-admin/security/advisories/new)
(repository **Security** tab → **Report a vulnerability**). This keeps the
report confidential until a fix is available.

If you cannot use GitHub advisories, email **support@modernadminpro.com**.

When reporting, please include:

- affected package(s) and version(s) (e.g. `@modern-admin/nest@0.1.0`);
- a description of the vulnerability and its impact;
- minimal steps or a proof-of-concept to reproduce;
- any suggested remediation, if known.

## What to expect

- **Acknowledgement** within 3 business days.
- An initial assessment and severity rating shortly after.
- Coordinated disclosure: we'll agree on a timeline and credit you in the
  advisory unless you prefer to remain anonymous.

## Scope notes

- The commercial `@modern-admin-pro/*` packages are distributed separately;
  vulnerabilities there can be reported through the same private channel.
- License verification relies on an Ed25519 public key shipped in the
  open-source packages; the signing **private key is never committed** to
  this repository. Reports about the licensing mechanism are welcome.
