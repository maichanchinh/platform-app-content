'use client'

import Link from 'next/link'
import { usePayloadAPI } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

type MediaItem = {
  id: string
  alt?: string | null
  filename?: string | null
  mimeType?: string | null
  filesize?: number | null
  width?: number | null
  height?: number | null
  updatedAt?: string | null
  url?: string | null
  thumbnailURL?: string | null
  deletedAt?: string | null
}

type MediaResponse = {
  docs?: MediaItem[]
  totalDocs?: number
}

type MediaGridProps = {
  initialData?: MediaResponse
  collectionSlug?: string
}

const formatFileSize = (bytes?: number | null) => {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(size)} ${units[unitIndex]}`
}

const formatUpdatedAt = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function MediaGrid({ initialData, collectionSlug = 'media' }: MediaGridProps) {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [trash, setTrash] = useState(false)
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const where = useMemo(() => {
    const clauses: Record<string, unknown>[] = []
    if (search.trim()) {
      clauses.push({
        or: [
          { filename: { contains: search.trim() } },
          { alt: { contains: search.trim() } },
        ],
      })
    }
    if (kind !== 'all') {
      clauses.push(
        kind === 'other'
          ? {
              and: ['image', 'video', 'audio'].map((type) => ({
                mimeType: { not_like: `${type}/%` },
              })),
            }
          : { mimeType: { like: `${kind}/%` } },
      )
    }
    return clauses.length ? { and: clauses } : undefined
  }, [kind, search])
  const [{ data, isLoading, isError }, { setParams }] = usePayloadAPI('/api/media', {
    initialData,
    initialParams: {
      depth: 0,
      limit: 48,
      page,
      sort: '-createdAt',
      trash: false,
    },
  })
  const response = data as MediaResponse
  const docs = response?.docs || []

  const updateQuery = (nextTrash = trash) => {
    setParams({
      depth: 0,
      limit: 48,
      page,
      sort: '-createdAt',
      trash: nextTrash,
      ...(where ? { where } : {}),
      refresh,
    })
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      const body = new FormData()
      body.set('alt', file.name.replace(/\.[^.]+$/, ''))
      body.set('file', file)
      const result = await fetch('/api/media', { method: 'POST', body })
      if (!result.ok) {
        window.alert(`Không tải lên được ${file.name}.`)
      }
    }
    setRefresh((value) => value + 1)
    updateQuery()
  }

  const changeTrashState = async (item: MediaItem) => {
    const method = trash ? 'PATCH' : 'DELETE'
    const body = trash ? JSON.stringify({ deletedAt: null }) : undefined
    const result = await fetch(`/api/media/${encodeURIComponent(item.id)}?trash=true`, {
      method,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
    })
    if (!result.ok) {
      const error = (await result.json().catch(() => null)) as { errors?: { message?: string }[] } | null
      window.alert(error?.errors?.[0]?.message || 'Không cập nhật được media.')
      return
    }
    setRefresh((value) => value + 1)
    updateQuery()
  }

  const selectTrash = (value: boolean) => {
    setTrash(value)
    setPage(1)
    setParams({
      depth: 0,
      limit: 48,
      page: 1,
      sort: '-createdAt',
      trash: value,
      ...(where ? { where } : {}),
    })
  }

  return (
    <main className="media-grid-page">
      <header className="media-grid-header">
        <div>
          <h1>Thư viện media</h1>
          <p>{response?.totalDocs ?? docs.length} tệp</p>
        </div>
        <Link href="/admin/collections/media/list">Xem dạng danh sách</Link>
        <label className="media-upload-button">
          Tải nhiều tệp
          <input
            multiple
            onChange={(event) => {
              const input = event.currentTarget
              void uploadFiles(input.files).finally(() => {
                input.value = ''
              })
            }}
            type="file"
          />
        </label>
      </header>

      <div className="media-grid-toolbar">
        <input
          aria-label="Tìm media"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && updateQuery()}
          placeholder="Tìm theo tên tệp hoặc alt"
          type="search"
          value={search}
        />
        <select
          aria-label="Lọc loại media"
          onChange={(event) => setKind(event.target.value)}
          value={kind}
        >
          <option value="all">Tất cả loại</option>
          <option value="image">Hình ảnh</option>
          <option value="video">Video</option>
          <option value="audio">Âm thanh</option>
          <option value="other">Khác</option>
        </select>
        <button onClick={() => updateQuery()} type="button">Tìm kiếm</button>
        <button onClick={() => selectTrash(!trash)} type="button">
          {trash ? 'Xem thư viện' : 'Thùng rác'}
        </button>
      </div>

      {isError && <p role="alert">Không tải được thư viện media.</p>}
      {isLoading && <p>Đang tải…</p>}
      {!isLoading && !docs.length && <p>Chưa có media phù hợp.</p>}
      <section aria-label="Media" className="media-grid">
        {docs.map((item) => (
          <article className="media-grid-card" key={item.id}>
            <Link
              aria-label={`Sửa ${item.filename || item.alt || 'media'}`}
              className="media-grid-preview"
              href={`/admin/collections/${collectionSlug}/${encodeURIComponent(item.id)}`}
            >
              {item.mimeType?.startsWith('image/') && (item.thumbnailURL || item.url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={item.alt || ''} loading="lazy" src={item.thumbnailURL || item.url || ''} />
              ) : (
                <span>{item.mimeType?.split('/')[0] || 'Tệp'}</span>
              )}
            </Link>
            <div className="media-grid-card-details">
              <strong title={item.filename || ''}>{item.filename || item.alt || 'Media'}</strong>
              <span>{item.mimeType || 'Không rõ loại'}</span>
              <span>Dung lượng: {formatFileSize(item.filesize)}</span>
              <span>Cập nhật: {formatUpdatedAt(item.updatedAt)}</span>
              <span>Kích thước: {item.width && item.height ? `${item.width} × ${item.height} px` : '—'}</span>
              {trash && <button onClick={() => void changeTrashState(item)} type="button">Khôi phục</button>}
            </div>
          </article>
        ))}
      </section>
      {page > 1 && (
        <button
          className="media-grid-next-page"
          onClick={() => {
            const previousPage = page - 1
            setPage(previousPage)
            setParams({
              depth: 0,
              limit: 48,
              page: previousPage,
              sort: '-createdAt',
              trash,
              ...(where ? { where } : {}),
            })
          }}
          type="button"
        >
          Trang trước
        </button>
      )}
      {(response?.totalDocs || 0) > page * 48 && (
        <button
          className="media-grid-next-page"
          onClick={() => {
            const nextPage = page + 1
            setPage(nextPage)
            setParams({
              depth: 0,
              limit: 48,
              page: nextPage,
              sort: '-createdAt',
              trash,
              ...(where ? { where } : {}),
            })
          }}
          type="button"
        >
          Trang tiếp
        </button>
      )}
    </main>
  )
}
