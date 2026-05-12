/**
 * LocalUploadProvider — stores files on the local filesystem.
 *
 * Files are written to `uploadDir` with a UUID-based filename to avoid
 * collisions. Set `baseUrl` to the public URL prefix where the directory is
 * served as static files (e.g. `'/uploads'` or `'http://localhost:3000/uploads'`).
 *
 * @example
 * new LocalUploadProvider({ uploadDir: './public/uploads', baseUrl: '/uploads' })
 */

import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { uuidv7 } from '@modern-admin/core'
import type { IUploadProvider, UploadedFile } from '../types.js'

export interface LocalUploadOptions {
  /**
   * Absolute or process-relative path to the directory where files are stored.
   * Created automatically on first upload.
   */
  uploadDir: string
  /**
   * Public URL prefix (without trailing slash) where uploaded files can be
   * accessed. Used to construct the `url` returned by the upload endpoint and
   * the `urlTemplate` for the frontend.
   *
   * @example '/uploads'
   * @example 'https://static.example.com/uploads'
   */
  baseUrl?: string
}

export class LocalUploadProvider implements IUploadProvider {
  constructor(private readonly options: LocalUploadOptions) {}

  async upload(file: UploadedFile, key?: string): Promise<string> {
    const resolvedKey = key ?? `${uuidv7()}${extname(file.originalName)}`
    const dest = join(this.options.uploadDir, resolvedKey)
    // Create the full directory tree (handles nested keys like 'avatars/2024/01/uuid.jpg').
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, file.buffer)
    return resolvedKey
  }

  getUrl(key: string): string {
    const base = this.options.baseUrl ?? '/uploads'
    return `${base}/${key}`
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(join(this.options.uploadDir, key))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  urlTemplate(): string {
    const base = this.options.baseUrl ?? '/uploads'
    return `${base}/{key}`
  }
}
