---
title: File upload
description: uploadFeature — wire file upload fields into any resource with automatic storage backend integration.
---

# File upload — `@modern-admin/feature-upload`

Marks properties as `type: 'file'`, registers storage providers, and installs hooks for
automatic upload confirmation and orphan cleanup.

---

## How it works

- Marks configured properties as `type: 'file'` (with `isArray` for multi-file)
- Registers upload providers in `UploadProviderRegistry` for the upload controller
- Installs `after` hooks to confirm uploads and delete orphaned files
- On `edit.after`: deletes files whose key was replaced or removed
- On `delete.after`: deletes every file referenced by the deleted record

---

## Installation

```sh
bun add @modern-admin/feature-upload
# S3 support (optional):
bun add @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner
```

Register the upload controller in your NestJS module:

```ts
import { ModernAdminUploadModule } from '@modern-admin/feature-upload/nest'

@Module({
  imports: [
    ModernAdminModule.forRoot({ ... }),
    ModernAdminUploadModule.forRoot(),
  ],
})
export class AppModule {}
```

---

## Configuration

```ts
import { uploadFeature } from '@modern-admin/feature-upload'
import { LocalUploadProvider } from '@modern-admin/feature-upload/providers'
import { S3UploadProvider } from '@modern-admin/feature-upload/providers'

{
  resource: ProductsResource,
  features: [
    uploadFeature({
      properties: {
        thumbnail: {
          provider: new LocalUploadProvider({
            uploadDir: './public/uploads',
            baseUrl: '/uploads',
          }),
          mimeTypes: ['image/*'],
          maxSize: 5 * 1024 * 1024,  // 5 MB
          uploadPath: (filename) => `products/thumbnails/${uuidv7()}-${filename}`,
        },
        gallery: {
          provider: new S3UploadProvider({
            bucket: process.env.S3_BUCKET,
            region: 'us-east-1',
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }),
          mimeTypes: ['image/*'],
          isArray: true,  // multi-file upload
          uploadPath: (filename) => `products/gallery/${uuidv7()}-${filename}`,
        },
      },
    }),
  ],
}
```

---

## Built-in providers

### LocalUploadProvider

Stores files on the local filesystem.

```ts
new LocalUploadProvider({
  uploadDir: './public/uploads',   // absolute or relative to cwd
  baseUrl: '/uploads',             // URL prefix for generated URLs
})
```

- `mkdir -p` is called automatically for nested keys (e.g. `avatars/2024/uuid.jpg`).

### S3UploadProvider

Stores files in AWS S3 or any S3-compatible storage.

```ts
new S3UploadProvider({
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  // Optional:
  endpoint: 'https://my-minio.example.com',  // for S3-compatible services
  signed: { expiresIn: 3600 },               // pre-signed URLs (default: false)
})
```

Streaming multipart uploads use `@aws-sdk/lib-storage`; falls back to `PutObjectCommand`
for small files. Pre-signed URL support requires `@aws-sdk/s3-request-presigner`.

### Custom provider

Implement `IUploadProvider`:

```ts
import type { IUploadProvider } from '@modern-admin/feature-upload'

class MyProvider implements IUploadProvider {
  async upload(file: Buffer, key?: string): Promise<string> {
    // store file, return storage key
  }
  async getUrl(key: string): Promise<string> {
    // return URL for key
  }
  async delete(key: string): Promise<void> {
    // remove file from storage
  }
  urlTemplate(): string | null {
    // optional: return URL template with {key} placeholder
    return null
  }
}
```

---

## Upload endpoint

The upload controller exposes a single multipart endpoint:

```http
POST /admin/api/resources/:resourceId/actions/upload?field=<fieldName>
Content-Type: multipart/form-data

file=<binary>
```

Response:

```json
{
  "key": "products/thumbnails/01956d2e-thumb.jpg",
  "url": "/uploads/products/thumbnails/01956d2e-thumb.jpg",
  "name": "product-photo.jpg",
  "size": 102400,
  "mimeType": "image/jpeg"
}
```

The React client calls this endpoint automatically when the user selects a file in the
`FileInput` component.

---

## What it gives you

- Drag-and-drop file upload UI (FileInput component)
- Automatic storage backend integration
- Multi-file support with array diff on edit
- Orphan file cleanup on edit/delete
- MIME type and size validation
- Custom upload path generation
- Works with any storage backend via `IUploadProvider`
