---
title: JSON by key
description: jsonByKeyFeature — expand a JSON column into virtual per-key sub-properties controlled by a selector field.
---

# JSON by key — `@modern-admin/feature-json-by-key`

Replaces a raw JSON column editor with per-key virtual properties. A selector field
(e.g. a `region` dropdown) controls which virtual property is visible, making it easy
to manage locale-specific content, per-market pricing, or any key-partitioned JSON.

---

## How it works

- Hides the source JSON property from the UI
- Creates N virtual properties (one per declared key) with `showWhen` rules tied to the selector
- Installs `after` hooks to expand the JSON object into virtual fields on read
- Installs `before` hooks to collapse the virtuals back into the JSON column on write
- Supports file uploads within virtuals with automatic orphan cleanup on key replacement

---

## Installation

```sh
bun add @modern-admin/feature-json-by-key
```

---

## Configuration

```ts
import { jsonByKeyFeature } from '@modern-admin/feature-json-by-key'
import { S3UploadProvider } from '@modern-admin/feature-upload/providers'

{
  resource: ProductsResource,
  features: [
    jsonByKeyFeature({
      controlField: 'region',           // selector field that controls visibility
      keys: ['us', 'eu', 'asia'],       // JSON keys to expose as virtuals
      defaultKey: 'us',                 // shown when selector is empty
      separator: '__',                  // virtual field name separator (default '__')
      properties: {
        previews: {
          label: (key) => `Preview (${key.toUpperCase()})`,
          positionOffset: 10,
          child: {
            type: 'file',
            isArray: false,
            upload: {
              provider: new S3UploadProvider({ /* … */ }),
              uploadPath: (filename, { key, property }) =>
                `products/${property}/${key}/${filename}`,
              mimeTypes: ['image/*'],
            },
          },
        },
        price: {
          label: (key) => `Price (${key.toUpperCase()})`,
          child: {
            type: 'number',
            isRequired: true,
          },
        },
      },
    }),
  ],
}
```

### Options reference

| Option | Type | Description |
|--------|------|-------------|
| `controlField` | `string` | Selector field that drives visibility |
| `keys` | `string[]` | JSON keys to expose as individual virtual properties |
| `defaultKey` | `string` | Active key when selector is empty |
| `separator` | `string` | Separator in virtual field names: `<property>__<key>` |
| `properties` | `Record<string, VirtualConfig>` | Per-property virtual configuration |

`VirtualConfig`:

| Field | Type | Description |
|-------|------|-------------|
| `label` | `string \| (key: string) => string` | Field label or per-key label factory |
| `positionOffset` | `number` | Added to property `position` (lower = higher in form) |
| `child` | `PropertyOptions` | Options for the virtual property (type, isRequired, upload…) |

---

## Virtual field naming

For a property `previews` with keys `['us', 'eu']` and separator `'__'`, the feature
creates virtual properties: `previews__us` and `previews__eu`.

The original `previews` JSON column is hidden (`isVisible: false`).

---

## Database column example

```json
{
  "us": "s3://bucket/products/previews/us/preview.jpg",
  "eu": "s3://bucket/products/previews/eu/preview.jpg",
  "asia": "s3://bucket/products/previews/asia/preview.jpg"
}
```

---

## showWhen rules

Each virtual property is wired with a `showWhen` rule:

```ts
// Auto-generated for previews__eu:
showWhen: {
  field: 'region',
  equals: 'eu',
  defaultWhenEmpty: key === defaultKey,  // true for 'us'
}
```

The UI hides all virtuals except the one matching the current selector value.

---

## File upload within virtuals

When `child.type === 'file'`, the feature wires an upload provider and `uploadPath`
factory. The `uploadPath` callback receives the filename and an object containing the
current `key` and `property` name so you can build context-aware paths:

```ts
uploadPath: (filename, { key, property }) =>
  `products/${property}/${key}/${uuidv7()}-${filename}`,
```

Orphan files are deleted automatically when the key value changes during edit.

---

## What it gives you

- User-friendly form editing for complex key-partitioned JSON
- Conditional field visibility controlled by a dropdown
- File upload support within individual JSON keys
- Automatic orphan cleanup on key replacement
- Custom labels and position offsets per virtual property
- Works with any child type (file, string, number, reference, …)
