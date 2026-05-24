/**
 * Embedded production public key for verifying license tokens.
 *
 * Format: PEM-encoded SubjectPublicKeyInfo (SPKI) Ed25519 public key.
 *
 * This is a PLACEHOLDER until the license-issuance backend goes live in
 * Phase 4. At that point:
 *   1. Generate a real Ed25519 keypair on the license server.
 *   2. Replace this constant with the real PEM (commit + version bump).
 *   3. Store the private key in the secrets vault — NEVER commit it.
 *
 * Commercial packages can override the verifying key via
 * `MODERN_ADMIN_LICENSE_PUBLIC_KEY` env (PEM) or via
 * `verifyLicense({ publicKey })` for tests.
 */
export const DEFAULT_LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZ1g=
-----END PUBLIC KEY-----`

/** Whether the embedded key is the placeholder (warns in production). */
export const PUBLIC_KEY_IS_PLACEHOLDER = true
