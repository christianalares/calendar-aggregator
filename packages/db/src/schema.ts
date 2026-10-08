import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import type { TitleFormatting } from './title-formatting'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const time = (name: string) => timestamp(name, { withTimezone: true })

export const authUsers = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: time('updated_at').notNull().defaultNow(),
})

export const authSessions = pgTable('auth_session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: time('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  updatedAt: time('updated_at').notNull().defaultNow(),
})

export const authAccounts = pgTable('auth_account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: time('access_token_expires_at'),
  refreshTokenExpiresAt: time('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt(),
  updatedAt: time('updated_at').notNull().defaultNow(),
})

export const authVerifications = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: time('expires_at').notNull(),
  createdAt: createdAt(),
  updatedAt: time('updated_at').notNull().defaultNow(),
})

export const memberRole = pgEnum('member_role', ['operator', 'member'])

// Authentication identities may exist before admission; only members have calendar access.
export const members = pgTable('member', {
  userId: text('user_id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  role: memberRole('role').notNull().default('member'),
  createdAt: createdAt(),
})

export const invitations = pgTable('invitation', {
  id: text('id').primaryKey(),
  creatorId: text('creator_id')
    .notNull()
    .references(() => members.userId),
  token: text('token').notNull().unique(),
  createdAt: createdAt(),
  usedAt: time('used_at'),
  usedBy: text('used_by')
    .unique()
    .references(() => authUsers.id),
  revokedAt: time('revoked_at'),
})

export const sources = pgTable('source', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => members.userId, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  useBrowser: boolean('use_browser').notNull().default(false),
  version: integer('version').notNull().default(1),
  snapshot: text('snapshot'),
  lastAttemptAt: time('last_attempt_at'),
  lastSuccessAt: time('last_success_at'),
  nextFetchAt: time('next_fetch_at'),
  leaseUntil: time('lease_until'),
  lastError: text('last_error'),
  createdAt: createdAt(),
})

export const outputs = pgTable('output', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => members.userId, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  token: text('token').notNull().unique(),
  createdAt: createdAt(),
})

export const outputSources = pgTable(
  'output_source',
  {
    outputId: text('output_id')
      .notNull()
      .references(() => outputs.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    prefix: text('prefix').notNull().default(''),
    titleFormatting: jsonb('title_formatting').$type<TitleFormatting>(),
  },
  (table) => [primaryKey({ columns: [table.outputId, table.sourceId] })],
)
