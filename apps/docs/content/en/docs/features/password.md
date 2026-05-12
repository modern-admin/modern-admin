---
title: Password hashing
description: passwordsFeature — virtual password input with automatic hashing before persistence.
---

# Password hashing — `@modern-admin/feature-password`

Adds a virtual password input field to create/edit forms with automatic hashing before
the value reaches the database. The raw hash is never sent to the UI.

---

## How it works

- Hides the encrypted DB column from all views (list, show, edit, filter)
- Surfaces a virtual form-only field (e.g. `newPassword`) rendered as a password input
- Installs `before` hooks on `new` and `edit` to hash the virtual value
- Writes the hash to the encrypted column and strips the virtual field from the payload
- Empty virtual value on `edit` = "don't change password" — the existing hash is preserved

---

## Installation

```sh
bun add @modern-admin/feature-password
# Pick a hashing library:
bun add argon2      # recommended
# or
bun add bcryptjs    # simpler, widely used
```

---

## Configuration

```ts
import { passwordsFeature } from '@modern-admin/feature-password'
import argon2 from 'argon2'

{
  resource: UsersResource,
  features: [
    passwordsFeature({
      properties: {
        encryptedPassword: 'passwordHash',  // actual DB column storing the hash
        password: 'newPassword',            // virtual field shown in forms
      },
      hash: argon2.hash,
    }),
  ],
}
```

### Options reference

| Option | Type | Description |
|--------|------|-------------|
| `properties.encryptedPassword` | `string` | DB column that stores the hash (hidden from UI) |
| `properties.password` | `string` | Virtual field name surfaced in create/edit forms |
| `hash` | `(plain: string) => Promise<string>` | Hashing function |

---

## Example with bcrypt

```ts
import bcrypt from 'bcryptjs'

passwordsFeature({
  properties: {
    encryptedPassword: 'password',
    password: 'newPassword',
  },
  hash: (plain) => bcrypt.hash(plain, 12),
})
```

---

## Multiple password fields

If a resource has more than one hashed column (e.g. a PIN in addition to a password),
compose two feature calls:

```ts
features: [
  passwordsFeature({
    properties: { encryptedPassword: 'passwordHash', password: 'newPassword' },
    hash: argon2.hash,
  }),
  passwordsFeature({
    properties: { encryptedPassword: 'pinHash', password: 'newPin' },
    hash: (plain) => bcrypt.hash(plain, 10),
  }),
]
```

---

## What it gives you

- Secure password handling — hashes never reach the UI
- Automatic hashing on create and update
- "Leave blank to keep current password" semantics on edit
- Works with any hashing library (argon2, bcrypt, scrypt, …)
- Hook chains with other features — upload, history, etc.
