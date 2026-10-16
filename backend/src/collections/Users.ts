import type { CollectionConfig } from 'payload'

const defaultTokenExpiration = 7 * 24 * 60 * 60
const configuredTokenExpiration = Number(
  process.env.PAYLOAD_AUTH_TOKEN_EXPIRATION ?? defaultTokenExpiration,
)

if (!Number.isSafeInteger(configuredTokenExpiration) || configuredTokenExpiration <= 0) {
  throw new Error('PAYLOAD_AUTH_TOKEN_EXPIRATION must be a positive integer in seconds')
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    tokenExpiration: configuredTokenExpiration,
  },
  fields: [
    // Email added by default
    // Add more fields as needed
  ],
}
