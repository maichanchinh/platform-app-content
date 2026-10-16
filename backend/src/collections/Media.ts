import type { CollectionConfig } from 'payload'
import { findMediaUsage, findMediaUsages } from './mediaUsage'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    defaultColumns: ['filename', 'alt', 'mimeType', 'filesize', 'updatedAt'],
    components: {
      edit: {
        beforeDocumentControls: ['/collections/MediaUsagePanel'],
      },
      views: {
        list: {
          Component: '/collections/MediaGrid',
        },
        grid: {
          Component: '/collections/MediaGrid',
          path: '/grid',
          exact: true,
        },
        table: {
          Component: '/collections/MediaListView',
          path: '/list',
          exact: true,
        },
      },
    },
  },
  endpoints: [
    {
      path: '/:id/usage',
      method: 'get',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ message: 'Bạn cần đăng nhập để xem nơi sử dụng media.' }, { status: 401 })
        }
        const id = req.routeParams?.id
        if (typeof id !== 'string' || !id) {
          return Response.json({ message: 'Thiếu ID media.' }, { status: 400 })
        }
        return Response.json(await findMediaUsages(req.payload, id))
      },
    },
  ],
  access: {
    delete: ({ req }) => Boolean(req.user),
  },
  trash: true,
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        if (
          operation !== 'update' ||
          !data.deletedAt ||
          originalDoc?.deletedAt
        ) {
          return data
        }

        const usage = await findMediaUsage(req.payload, originalDoc.id)
        if (usage) {
          throw new Error(
            `Không thể ẩn media đang được dùng bởi ${usage.collection}.${usage.field}.`,
          )
        }

        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const usage = await findMediaUsage(req.payload, id)
        if (usage) {
          throw new Error(
            `Không thể xóa vĩnh viễn media đang được dùng bởi ${usage.collection}.${usage.field}.`,
          )
        }
      },
    ],
    afterRead: [
      ({ doc }) => {
        const endpoint = process.env.RUSTFS_ENDPOINT?.replace(/\/+$/, '')
        const publicURL = process.env.RUSTFS_PUBLIC_URL?.replace(/\/+$/, '')
        const bucket = process.env.RUSTFS_BUCKET
        const storageURLPrefix = endpoint && bucket ? `${endpoint}/${bucket}/` : undefined
        const publicURLPrefix = publicURL && bucket ? `${publicURL}/${bucket}/` : undefined

        const rewriteURL = (url?: string | null) => {
          if (!url || !storageURLPrefix || !url.startsWith(storageURLPrefix)) {
            return url
          }

          if (!publicURLPrefix) {
            throw new Error('RUSTFS_PUBLIC_URL is required to return RustFS media URLs')
          }

          return `${publicURLPrefix}${url.slice(storageURLPrefix.length)}`
        }

        const sizes = (
          doc as unknown as {
            sizes?: Record<string, { url?: string | null }>
          }
        ).sizes

        return {
          ...doc,
          url: rewriteURL(doc.url),
          thumbnailURL: rewriteURL(doc.thumbnailURL),
          ...(sizes
            ? {
                sizes: Object.fromEntries(
                  Object.entries(sizes).map(([name, size]) => [
                    name,
                    { ...size, url: rewriteURL(size.url) },
                  ]),
                ),
              }
            : {}),
        }
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
