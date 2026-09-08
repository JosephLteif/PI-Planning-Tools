import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema-postgres.ts',
  out: './drizzle-postgres',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://localhost/pointline',
  },
});
