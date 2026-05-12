// @modern-admin/feature-password — password hashing plugin for resources.
//
// Usage:
//   import { passwordsFeature } from '@modern-admin/feature-password'
//   import argon2 from 'argon2'
//
//   passwordsFeature({
//     properties: { encryptedPassword: 'password', password: 'newPassword' },
//     hash: argon2.hash,
//   })

export { passwordsFeature } from './passwords-feature.js'
export type { PasswordsFeatureOptions } from './types.js'
