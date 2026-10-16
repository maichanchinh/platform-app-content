import type { CollectionConfig, Payload } from 'payload'

type FieldSchema = {
  blocks?: { fields?: FieldSchema[] }[]
  fields?: FieldSchema[]
  name?: string
  relationTo?: string | string[]
  tabs?: { fields?: FieldSchema[] }[]
  type?: string
}

type ReferenceField = {
  path: string
  polymorphic: boolean
}

type RichTextField = {
  path: string
}

type CollectionSchema = Pick<CollectionConfig, 'fields' | 'slug'>

const getNestedFields = (field: FieldSchema): FieldSchema[] => [
  ...(field.fields ?? []),
  ...(field.tabs?.flatMap((tab) => tab.fields ?? []) ?? []),
  ...(field.blocks?.flatMap((block) => block.fields ?? []) ?? []),
]

const inspectFields = (
  fields: FieldSchema[],
  parentPath = '',
  references: ReferenceField[] = [],
  richText: RichTextField[] = [],
): { references: ReferenceField[]; richText: RichTextField[] } => {
  for (const field of fields) {
    const fieldPath = field.name ? [parentPath, field.name].filter(Boolean).join('.') : parentPath
    const relations = Array.isArray(field.relationTo) ? field.relationTo : [field.relationTo]

    if (
      fieldPath &&
      (field.type === 'relationship' || field.type === 'upload') &&
      relations.includes('media')
    ) {
      references.push({
        path: fieldPath,
        polymorphic: Array.isArray(field.relationTo),
      })
    }

    if (fieldPath && field.type === 'richText') {
      richText.push({ path: fieldPath })
    }

    inspectFields(getNestedFields(field), fieldPath, references, richText)
  }

  return { references, richText }
}

const matchesMediaID = (value: unknown, id: number | string): boolean => {
  if (value === id || (typeof value === 'string' && value === String(id))) {
    return true
  }

  if (typeof value !== 'object' || value === null) {
    return false
  }

  const recordID = (value as Record<string, unknown>).id
  return recordID === id || (typeof recordID === 'string' && recordID === String(id))
}

const hasMediaUpload = (value: unknown, id: number | string): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => hasMediaUpload(item, id))
  }

  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>
  if (
    record.type === 'upload' &&
    record.relationTo === 'media' &&
    matchesMediaID(record.value, id)
  ) {
    return true
  }

  return Object.values(record).some((item) => hasMediaUpload(item, id))
}

const getValuesAtPath = (value: unknown, path: string): unknown[] => {
  const [segment, ...remaining] = path.split('.')

  if (Array.isArray(value)) {
    return value.flatMap((item) => getValuesAtPath(item, path))
  }

  if (typeof value !== 'object' || value === null || !(segment in value)) {
    return []
  }

  const nextValue = (value as Record<string, unknown>)[segment]
  return remaining.length ? getValuesAtPath(nextValue, remaining.join('.')) : [nextValue]
}

const findOne = async (
  payload: Payload,
  collection: string,
  where: Record<string, unknown>,
): Promise<boolean> => {
  const result = await payload.find({
    collection: collection as never,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: where as never,
  })

  return result.docs.length > 0
}

const isMediaRelation = (value: unknown, id: number | string): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => isMediaRelation(item, id))
  }

  if (typeof value !== 'object' || value === null) {
    return false
  }

  const relation = value as Record<string, unknown>
  return relation.relationTo === 'media' && matchesMediaID(relation.value, id)
}

const findPolymorphicUsage = async (
  payload: Payload,
  collection: string,
  path: string,
  id: number | string,
): Promise<boolean> => {
  let page = 1

  while (true) {
    const result = await payload.find({
      collection: collection as never,
      depth: 0,
      limit: 100,
      overrideAccess: true,
      page,
      where: { [`${path}.value`]: { equals: id } } as never,
    })

    if (
      result.docs.some((doc) =>
        getValuesAtPath(doc, path).some((value) => isMediaRelation(value, id)),
      )
    ) {
      return true
    }

    if (!result.hasNextPage) {
      return false
    }

    page += 1
  }
}

const findRichTextReference = async (
  payload: Payload,
  collection: string,
  fields: RichTextField[],
  id: number | string,
): Promise<string | undefined> => {
  let page = 1

  while (true) {
    const result = await payload.find({
      collection: collection as never,
      depth: 0,
      limit: 100,
      overrideAccess: true,
      page,
    })

    for (const doc of result.docs) {
      for (const field of fields) {
        const values = getValuesAtPath(doc, field.path)
        if (values.some((value) => hasMediaUpload(value, id))) {
          return field.path
        }
      }
    }

    if (!result.hasNextPage) {
      return undefined
    }

    page += 1
  }
}

export const findMediaUsage = async (
  payload: Payload,
  id: number | string,
): Promise<{ collection: string; field: string } | undefined> => {
  for (const collection of payload.config.collections as CollectionSchema[]) {
    if (collection.slug === 'media') {
      continue
    }

    const { references, richText } = inspectFields(collection.fields as FieldSchema[])
    for (const reference of references) {
      const isUsed = reference.polymorphic
        ? await findPolymorphicUsage(payload, collection.slug, reference.path, id)
        : await findOne(payload, collection.slug, { [reference.path]: { equals: id } })

      if (isUsed) {
        return { collection: collection.slug, field: reference.path }
      }
    }

    if (richText.length) {
      const field = await findRichTextReference(payload, collection.slug, richText, id)
      if (field) {
        return { collection: collection.slug, field }
      }
    }
  }

  const isLocked = await findPolymorphicUsage(payload, 'payload-locked-documents', 'document', id)

  return isLocked ? { collection: 'payload-locked-documents', field: 'document' } : undefined
}
