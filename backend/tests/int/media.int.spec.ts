import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { Media } from '@/collections/Media'
import { findMediaUsage } from '@/collections/mediaUsage'

type MockCollection = {
  fields: Record<string, unknown>[]
  slug: string
}

const mockPayload = (
  collections: MockCollection[],
  findResult: (args: Record<string, unknown>) => { docs: unknown[]; hasNextPage: boolean },
) =>
  ({
    config: { collections },
    find: vi.fn(async (args) => findResult(args as Record<string, unknown>)),
  }) as unknown as Payload

const trashMedia = Media.hooks?.beforeChange?.[0] as unknown as (
  args: Record<string, unknown>,
) => Promise<unknown>

describe('Media trash policy', () => {
  it('allows authenticated users to delete media and blocks permanent deletion while referenced', async () => {
    expect(Media.access?.delete?.({ req: { user: { id: 'user-id' } } } as never)).toBe(true)

    const payload = mockPayload(
      [
        { slug: 'media', fields: [] },
        { slug: 'articles', fields: [{ name: 'hero', type: 'relationship', relationTo: 'media' }] },
      ],
      () => ({ docs: [{ id: 'media-id' }], hasNextPage: false }),
    )
    const beforeDelete = Media.hooks?.beforeDelete?.[0] as unknown as (
      args: Record<string, unknown>,
    ) => Promise<void>
    await expect(beforeDelete({ id: 'media-id', req: { payload } })).rejects.toThrow(
      'articles.hero',
    )
  })

  it('blocks trashing media referenced by a relationship field', async () => {
    const payload = mockPayload(
      [
        { slug: 'media', fields: [] },
        {
          slug: 'articles',
          fields: [{ name: 'hero', type: 'relationship', relationTo: 'media' }],
        },
      ],
      ({ collection, where }) => ({
        docs:
          collection === 'articles' && Boolean((where as Record<string, unknown>)?.hero)
            ? [{ id: 1 }]
            : [],
        hasNextPage: false,
      }),
    )

    await expect(
      trashMedia({
        data: { deletedAt: '2026-10-16T00:00:00.000Z' },
        originalDoc: { id: 'media-id', deletedAt: null },
        operation: 'update',
        req: { payload },
      }),
    ).rejects.toThrow('articles.hero')
  })

  it('blocks trashing media referenced by a nested upload field', async () => {
    const payload = mockPayload(
      [
        { slug: 'media', fields: [] },
        {
          slug: 'articles',
          fields: [
            {
              name: 'metadata',
              type: 'group',
              fields: [{ name: 'cover', type: 'upload', relationTo: 'media' }],
            },
          ],
        },
      ],
      ({ collection, where }) => ({
        docs:
          collection === 'articles' &&
          Boolean((where as Record<string, unknown>)?.['metadata.cover'])
            ? [{ id: 1 }]
            : [],
        hasNextPage: false,
      }),
    )

    await expect(
      trashMedia({
        data: { deletedAt: '2026-10-16T00:00:00.000Z' },
        originalDoc: { id: 'media-id', deletedAt: null },
        operation: 'update',
        req: { payload },
      }),
    ).rejects.toThrow('articles.metadata.cover')
  })

  it('checks the relation target for polymorphic relationships', async () => {
    const payload = mockPayload(
      [
        { slug: 'media', fields: [] },
        {
          slug: 'articles',
          fields: [{ name: 'asset', type: 'relationship', relationTo: ['media', 'users'] }],
        },
      ],
      ({ collection, page }) => ({
        docs:
          collection === 'articles'
            ? [
                {
                  asset:
                    page === 1
                      ? { relationTo: 'users', value: 7 }
                      : { relationTo: 'media', value: 7 },
                },
              ]
            : [],
        hasNextPage: collection === 'articles' && page === 1,
      }),
    )

    await expect(findMediaUsage(payload, 7)).resolves.toEqual({
      collection: 'articles',
      field: 'asset',
    })
  })

  it('blocks trashing media referenced by a Lexical upload node', async () => {
    const payload = mockPayload(
      [
        { slug: 'media', fields: [] },
        { slug: 'articles', fields: [{ name: 'content', type: 'richText' }] },
      ],
      ({ collection, page }) => ({
        docs:
          collection === 'articles' && page === 1
            ? [
                {
                  content: {
                    root: {
                      children: [
                        { type: 'upload', relationTo: 'media', value: { id: 'media-id' } },
                      ],
                    },
                  },
                },
              ]
            : [],
        hasNextPage: false,
      }),
    )

    await expect(
      trashMedia({
        data: { deletedAt: '2026-10-16T00:00:00.000Z' },
        originalDoc: { id: 'media-id', deletedAt: null },
        operation: 'update',
        req: { payload },
      }),
    ).rejects.toThrow('articles.content')
  })

  it('does not treat unrelated Rich Text numbers as media references', async () => {
    const payload = mockPayload(
      [
        { slug: 'media', fields: [] },
        { slug: 'articles', fields: [{ name: 'content', type: 'richText' }] },
      ],
      ({ collection }) => ({
        docs:
          collection === 'articles'
            ? [{ content: { root: { version: 7, children: [{ type: 'text', text: '7' }] } } }]
            : [],
        hasNextPage: false,
      }),
    )

    await expect(findMediaUsage(payload, 7)).resolves.toBeUndefined()
  })

  it('blocks hiding media referenced by Payload locked documents', async () => {
    const payload = mockPayload([{ slug: 'media', fields: [] }], ({ collection }) => ({
      docs:
        collection === 'payload-locked-documents'
          ? [{ document: { relationTo: 'media', value: 7 } }]
          : [],
      hasNextPage: false,
    }))

    await expect(findMediaUsage(payload, 7)).resolves.toEqual({
      collection: 'payload-locked-documents',
      field: 'document',
    })
  })

  it('allows trashing media with no registered references and enables Payload trash support', async () => {
    const payload = mockPayload([{ slug: 'media', fields: [] }], () => ({
      docs: [],
      hasNextPage: false,
    }))

    await expect(
      trashMedia({
        data: { deletedAt: '2026-10-16T00:00:00.000Z' },
        originalDoc: { id: 'media-id', deletedAt: null },
        operation: 'update',
        req: { payload },
      }),
    ).resolves.toEqual({ deletedAt: '2026-10-16T00:00:00.000Z' })
    expect(Media.trash).toBe(true)
  })
})
