export { verifyLicense, PUBLIC_KEY_IS_PLACEHOLDER } from './verify.js'
export { loadAndCheckLicense } from './bootstrap.js'
export { DEFAULT_LICENSE_PUBLIC_KEY_PEM } from './public-key.js'
export { signLicense, generateLicenseKeyPair } from './sign.js'
export type { SignLicenseOptions, LicenseKeyPair } from './sign.js'
export type {
  LicenseCheck,
  LicenseCheckFailureReason,
  LicensePayload,
  VerifyLicenseOptions,
} from './types.js'
