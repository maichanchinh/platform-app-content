'use client'

import Link from 'next/link'
import { useDocumentInfo, usePayloadAPI } from '@payloadcms/ui'

type MediaUsage = {
  collection: string
  id: string
  title: string
  field: string
}

export default function MediaUsagePanel() {
  const { id } = useDocumentInfo()
  const [{ data, isLoading, isError }] = usePayloadAPI(
    id ? `/api/media/${encodeURIComponent(String(id))}/usage` : '',
  )
  const usages = Array.isArray(data) ? (data as MediaUsage[]) : []

  return (
    <section aria-labelledby="media-usage-title" className="media-usage-panel">
      <h3 id="media-usage-title">Đang được sử dụng</h3>
      {isLoading && <p>Đang kiểm tra nơi sử dụng…</p>}
      {isError && <p role="alert">Không tải được danh sách nơi sử dụng media.</p>}
      {!isLoading && !isError && !usages.length && <p>Media này chưa được sử dụng.</p>}
      {!!usages.length && (
        <ul>
          {usages.map((usage) => (
            <li key={`${usage.collection}:${usage.id}:${usage.field}`}>
              <Link href={`/admin/collections/${encodeURIComponent(usage.collection)}/${encodeURIComponent(usage.id)}`}>
                {usage.title}
              </Link>
              <span>{usage.collection} · {usage.field}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
