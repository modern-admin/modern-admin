// Seed data used by the reference admin module. Two resources — Users and
// Posts — exercise both flat and reference-style fields.

import { BaseProperty } from '@modern-admin/core'
import type { InMemoryDb } from './in-memory-adapter.js'

export const seed = (): InMemoryDb => ({
  __inMemory: true,
  tables: [
    {
      name: 'users',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'email', type: 'string' }),
        new BaseProperty({ path: 'name', type: 'string' }),
        new BaseProperty({ path: 'role', type: 'string', availableValues: ['admin', 'editor', 'viewer'] }),
        new BaseProperty({ path: 'createdAt', type: 'datetime' }),
      ],
      rows: [
        { id: '1', email: 'ada@example.com', name: 'Ada Lovelace', role: 'admin', createdAt: new Date('2024-01-15') },
        { id: '2', email: 'alan@example.com', name: 'Alan Turing', role: 'editor', createdAt: new Date('2024-02-09') },
        { id: '3', email: 'grace@example.com', name: 'Grace Hopper', role: 'viewer', createdAt: new Date('2024-03-21') },
      ],
    },
    {
      name: 'posts',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'title', type: 'string' }),
        new BaseProperty({ path: 'body', type: 'richtext' }),
        new BaseProperty({ path: 'authorId', type: 'reference', reference: 'users' }),
        new BaseProperty({ path: 'published', type: 'boolean' }),
      ],
      rows: [
        { id: '1', title: 'Hello, world', body: 'First post', authorId: '1', published: true },
        { id: '2', title: 'Draft', body: 'Work in progress', authorId: '2', published: false },
      ],
    },
  ],
})
