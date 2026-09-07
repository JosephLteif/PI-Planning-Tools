import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  piLabel: text('pi_label').notNull(),
  sequenceKey: text('sequence_key').notNull().default('fibonacci'),
  selectedStoryKey: text('selected_story_key'),
  voteMode: text('vote_mode').notNull().default('hidden'),
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
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  roundsPk: primaryKey({ columns: [table.roomId, table.storyKey, table.roundNumber] }),
  roundsOrderIdx: index('rounds_order_idx').on(table.roomId, table.storyKey, table.roundNumber),
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
