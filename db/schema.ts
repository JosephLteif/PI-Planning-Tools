import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  username: text('username'),
  passwordHash: text('password_hash'),
  passwordSalt: text('password_salt'),
  role: text('role').notNull().default('member'),
  disabled: integer('disabled').notNull().default(0),
  lastLoginAt: text('last_login_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  accountsUsernameIdx: uniqueIndex('accounts_username_idx').on(table.username),
}));

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
}, (table) => ({
  sessionsAccountIdx: index('sessions_account_idx').on(table.accountId),
  sessionsExpiryIdx: index('sessions_expiry_idx').on(table.expiresAt),
}));

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  piLabel: text('pi_label').notNull(),
  ownerAccountId: text('owner_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  stateVersion: integer('state_version').notNull().default(0),
  sequenceKey: text('sequence_key').notNull().default('fibonacci'),
  selectedStoryKey: text('selected_story_key'),
  voteMode: text('vote_mode').notNull().default('hidden'),
  aiEnabled: integer('ai_enabled').notNull().default(1),
  capacityJson: text('capacity_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const roomMembers = sqliteTable('room_members', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('editor'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  roomMembersPk: primaryKey({ columns: [table.roomId, table.accountId] }),
}));

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerAccountId: text('owner_account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const teamMembers = sqliteTable('team_members', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  teamMembersPk: primaryKey({ columns: [table.teamId, table.accountId] }),
}));

export const roomInvites = sqliteTable('room_invites', {
  token: text('token').primaryKey(),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'cascade' }),
  teamId: text('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  createdBy: text('created_by').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at'),
}, (table) => ({
  roomInvitesRoomIdx: index('room_invites_room_idx').on(table.roomId),
  roomInvitesTeamIdx: index('room_invites_team_idx').on(table.teamId),
}));

export const domains = sqliteTable('domains', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => ({
  domainsPk: primaryKey({ columns: [table.roomId, table.id] }),
}));

export const services = sqliteTable('services', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  name: text('name').notNull(),
  domainId: text('domain_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active').notNull().default(1),
}, (table) => ({
  servicesPk: primaryKey({ columns: [table.roomId, table.id] }),
}));

export const stories = sqliteTable('stories', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  storyKey: text('story_key').notNull(),
  type: text('type').notNull(),
  epicId: text('epic_id'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  acceptanceJson: text('acceptance_json').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  manualEstimate: real('manual_estimate'),
  aiEstimate: real('ai_estimate'),
  aiEnabled: integer('ai_enabled').notNull().default(0),
  saved: integer('saved').notNull().default(0),
}, (table) => ({
  storiesPk: primaryKey({ columns: [table.roomId, table.storyKey] }),
  storiesOrderIdx: index('stories_order_idx').on(table.roomId, table.sortOrder),
  storiesEpicIdx: index('stories_epic_idx').on(table.roomId, table.epicId),
}));

export const storyServiceAllocations = sqliteTable('story_service_allocations', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  storyKey: text('story_key').notNull(),
  serviceId: text('service_id').notNull(),
  allocationPct: real('allocation_pct').notNull().default(0),
}, (table) => ({
  allocationPk: primaryKey({ columns: [table.roomId, table.storyKey, table.serviceId] }),
}));

export const planningRounds = sqliteTable('planning_rounds', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  storyKey: text('story_key').notNull(),
  roundNumber: integer('round_number').notNull(),
  phase: text('phase').notNull().default('idle'),
  mode: text('mode').notNull().default('hidden'),
  submittedCount: integer('submitted_count').notNull().default(0),
  revealedAt: text('revealed_at'),
  timerEndsAt: text('timer_ends_at'),
  timerStartedAt: text('timer_started_at'),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  roundsPk: primaryKey({ columns: [table.roomId, table.storyKey, table.roundNumber] }),
  roundsOrderIdx: index('rounds_order_idx').on(table.roomId, table.storyKey, table.roundNumber),
}));

export const planningRoundParticipants = sqliteTable('planning_round_participants', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  storyKey: text('story_key').notNull(),
  roundNumber: integer('round_number').notNull(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  joinedAt: text('joined_at').notNull(),
}, (table) => ({
  participantsPk: primaryKey({ columns: [table.roomId, table.storyKey, table.roundNumber, table.accountId] }),
  participantsRoundIdx: index('participants_round_idx').on(table.roomId, table.storyKey, table.roundNumber),
}));

export const votes = sqliteTable('votes', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  storyKey: text('story_key').notNull(),
  roundNumber: integer('round_number').notNull(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  manualEstimate: real('manual_estimate'),
  aiEstimate: real('ai_estimate'),
  aiEnabled: integer('ai_enabled').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  votesPk: primaryKey({ columns: [table.roomId, table.storyKey, table.roundNumber, table.accountId] }),
  votesRoundIdx: index('votes_round_idx').on(table.roomId, table.storyKey, table.roundNumber),
}));
