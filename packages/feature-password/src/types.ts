/**
 * Options for `passwordsFeature()`. Mirrors the AdminJS `@adminjs/passwords`
 * shape so existing decorator examples translate cleanly.
 *
 * @example
 * passwordsFeature({
 *   properties: {
 *     encryptedPassword: 'password',  // existing DB column where the hash is stored
 *     password: 'newPassword',        // virtual form input field
 *   },
 *   hash: argon2.hash,
 * })
 */
export interface PasswordsFeatureOptions {
  properties: {
    /** Path of the existing DB column that holds the hashed value. */
    encryptedPassword: string
    /**
     * Path of the **virtual** form input. Doesn't have to exist on the
     * resource — the feature surfaces it as a synthetic property, then
     * strips it from the payload before save.
     */
    password: string
  }
  /**
   * Hashing function. Receives the plaintext value entered by the user;
   * must return the value that will be stored in the encrypted column.
   *
   * @example
   * import argon2 from 'argon2'
   * hash: argon2.hash
   *
   * @example
   * import bcrypt from 'bcryptjs'
   * hash: (plain) => bcrypt.hash(plain, 12)
   */
  hash: (plain: string) => string | Promise<string>
}
