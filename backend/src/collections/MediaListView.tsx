'use client'

import Link from 'next/link'
import { usePayloadAPI } from '@payloadcms/ui'
import { useState } from 'react'

type MediaRow = {
  id: string
  alt?: string | null
  filename?: string | null
  mimeType?: string | null
  filesize?: number | null
  updatedAt?: string | null
}

type MediaResponse = {
  docs?: MediaRow[]
  totalDocs?: number
}

export default function MediaListView() {
  const [search, setSearch] = useState('')
  const [{ data, isLoading, isError }, { setParams }] = usePayloadAPI('/api/media', {
    initialParams: { depth: 0, limit: 48, page: 1, sort: '-createdAt', trash: false },
  })
  const response = data as MediaResponse

  const searchMedia = () => {
    const value = search.trim()
    setParams({
      depth: 0,
      limit: 48,
      page: 1,
      sort: '-createdAt',
      trash: false,
      ...(value
        ? {
            where: {
              or: [
                { filename: { contains: value } },
                { alt: { contains: value } },
              ],
            },
          }
        : {}),
    })
  }

  return (
    <main className="media-list-page">
      <header className="media-list-header">
        <div>
          <h1>Thư viện media</h1>
          <p>{response?.totalDocs ?? 0} tệp</p>
        </div>
        <Link href="/admin/collections/media">Xem dạng lưới</Link>
      </header>
      <form
        className="media-list-search"
        onSubmit={(event) => {
          event.preventDefault()
          searchMedia()
        }}
      >
        <input
          aria-label="Tìm media"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo tên tệp hoặc alt"
          type="search"
          value={search}
        />
        <button type="submit">Tìm kiếm</button>
      </form>
      {isError && <p role="alert">Không tải được thư viện media.</p>}
      {isLoading && <p>Đang tải…</p>}
      {!isLoading && !response?.docs?.length && <p>Chưa có media phù hợp.</p>}
      {!!response?.docs?.length && (
        <div className="media-list-table-wrap">
          <table className="media-list-table">
            <thead>
              <tr>
                <th>Tên tệp</th>
                <th>Alt</th>
                <th>MIME Type</th>
                <th>File Size</th>
                <th>Updated At</th>
              </tr>
            </thead>
            <tbody>
              {response.docs.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/admin/collections/media/${encodeURIComponent(item.id)}`}>
                      {item.filename || item.alt || item.id}
                    </Link>
                  </td>
                  <td>{item.alt || '—'}</td>
                  <td>{item.mimeType || '—'}</td>
                  <td>{formatFileSize(item.filesize)}</td>
                  <td>{formatUpdatedAt(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
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
