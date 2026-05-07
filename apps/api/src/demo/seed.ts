// Seed data used by the reference admin module. Five resources exercise
// every relation flavour the UI knows: scalar fields, single-reference
// (one-to-many), and array-of-references (many-to-many).

import { BaseProperty } from '@modern-admin/core'
import type { InMemoryDb } from './in-memory-adapter.js'

export const seed = (): InMemoryDb => ({
  __inMemory: true,
  tables: [
    // ────────── users ──────────
    {
      name: 'users',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'email', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
        new BaseProperty({
          path: 'role',
          type: 'string',
          availableValues: ['admin', 'editor', 'viewer'],
        }),
        new BaseProperty({ path: 'avatarUrl', type: 'string' }),
        new BaseProperty({ path: 'createdAt', type: 'datetime' }),
      ],
      rows: [
        {
          id: '1',
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          role: 'admin',
          avatarUrl: 'https://i.pravatar.cc/96?u=ada',
          createdAt: new Date('2024-01-15'),
        },
        {
          id: '2',
          email: 'alan@example.com',
          name: 'Alan Turing',
          role: 'editor',
          avatarUrl: 'https://i.pravatar.cc/96?u=alan',
          createdAt: new Date('2024-02-09'),
        },
        {
          id: '3',
          email: 'grace@example.com',
          name: 'Grace Hopper',
          role: 'viewer',
          avatarUrl: 'https://i.pravatar.cc/96?u=grace',
          createdAt: new Date('2024-03-21'),
        },
        {
          id: '4',
          email: 'linus@example.com',
          name: 'Linus Torvalds',
          role: 'editor',
          avatarUrl: 'https://i.pravatar.cc/96?u=linus',
          createdAt: new Date('2024-04-01'),
        },
        {
          id: '5',
          email: 'margaret@example.com',
          name: 'Margaret Hamilton',
          role: 'admin',
          avatarUrl: 'https://i.pravatar.cc/96?u=margaret',
          createdAt: new Date('2024-05-30'),
        },
      ],
    },

    // ────────── categories ──────────
    {
      name: 'categories',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'description', type: 'textarea' }),
      ],
      rows: [
        { id: '1', name: 'Engineering', description: 'Programming, systems, infra' },
        { id: '2', name: 'Mathematics', description: 'Algorithms, theory, proofs' },
        { id: '3', name: 'History', description: 'People & milestones in computing' },
      ],
    },

    // ────────── tags ──────────
    {
      name: 'tags',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
        new BaseProperty({
          path: 'color',
          type: 'string',
          availableValues: ['gray', 'blue', 'green', 'amber', 'red'],
        }),
      ],
      rows: [
        { id: '1', name: 'open-source', color: 'green' },
        { id: '2', name: 'kernel', color: 'red' },
        { id: '3', name: 'turing', color: 'amber' },
        { id: '4', name: 'logic', color: 'blue' },
        { id: '5', name: 'apollo', color: 'gray' },
        { id: '6', name: 'compilers', color: 'blue' },
      ],
    },

    // ────────── posts (1:N category, M:N tags, 1:N author) ──────────
    {
      name: 'posts',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'title', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'body', type: 'richtext' }),
        new BaseProperty({
          path: 'authorId',
          type: 'reference',
          reference: 'users',
          isRequired: true,
        }),
        new BaseProperty({
          path: 'categoryId',
          type: 'reference',
          reference: 'categories',
        }),
        // many-to-many: array of foreign keys to `tags`.
        new BaseProperty({
          path: 'tagIds',
          type: 'reference',
          reference: 'tags',
          isArray: true,
        }),
        new BaseProperty({ path: 'published', type: 'boolean' }),
        new BaseProperty({ path: 'publishedAt', type: 'datetime' }),
      ],
      rows: [
        {
          id: '1',
          title: 'On the analytical engine',
          body: 'Notes on Babbage’s machine and how programs unfold over its mill.',
          authorId: '1',
          categoryId: '3',
          tagIds: ['3', '4'],
          published: true,
          publishedAt: new Date('2024-01-20'),
        },
        {
          id: '2',
          title: 'Just for fun: portable kernels',
          body: 'A short rant about driver portability.',
          authorId: '4',
          categoryId: '1',
          tagIds: ['1', '2'],
          published: true,
          publishedAt: new Date('2024-04-10'),
        },
        {
          id: '3',
          title: 'Rope, ferrite cores, and Apollo',
          body: 'How the Apollo Guidance Computer was wired by hand.',
          authorId: '5',
          categoryId: '3',
          tagIds: ['5', '1'],
          published: true,
          publishedAt: new Date('2024-06-05'),
        },
        {
          id: '4',
          title: 'Decidability revisited',
          body: 'A draft about the halting problem and modern echoes.',
          authorId: '2',
          categoryId: '2',
          tagIds: ['3', '4', '6'],
          published: false,
        },
      ],
    },

    // ────────── comments ──────────
    {
      name: 'comments',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({
          path: 'postId',
          type: 'reference',
          reference: 'posts',
          isRequired: true,
        }),
        new BaseProperty({
          path: 'authorId',
          type: 'reference',
          reference: 'users',
          isRequired: true,
        }),
        new BaseProperty({ path: 'body', type: 'textarea', isRequired: true }),
        new BaseProperty({ path: 'createdAt', type: 'datetime' }),
      ],
      rows: [
        {
          id: '1',
          postId: '1',
          authorId: '2',
          body: 'A foundational read.',
          createdAt: new Date('2024-01-22'),
        },
        {
          id: '2',
          postId: '2',
          authorId: '3',
          body: 'Drivers everywhere :)',
          createdAt: new Date('2024-04-11'),
        },
        {
          id: '3',
          postId: '3',
          authorId: '1',
          body: 'Beautifully done.',
          createdAt: new Date('2024-06-06'),
        },
      ],
    },
  ],
})
