import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Pool } = pg;

function migrationFiles(directory) {
  return readdirSync(directory)
    .filter((filename) => filename.endsWith('.sql'))
    .sort();
}

function migrationStatements(directory, filename) {
  return readFileSync(join(directory, filename), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

class SqliteStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.parameters = [];
  }

  bind(...parameters) {
    this.parameters = parameters;
    return this;
  }

  first() {
    return this.database.prepare(this.sql).get(...this.parameters) ?? null;
  }

  all() {
    return { results: this.database.prepare(this.sql).all(...this.parameters) };
  }

  run() {
    const result = this.database.prepare(this.sql).run(...this.parameters);
    return {
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid || 0),
      },
    };
  }
}

class SqliteDatabase {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new SqliteStatement(this.database, sql);
  }

  batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

function applySqliteMigrations(database, directory) {
  database.exec(`CREATE TABLE IF NOT EXISTS pointline_migrations (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(database.prepare('SELECT name FROM pointline_migrations').all().map((row) => row.name));

  for (const filename of migrationFiles(directory)) {
    if (applied.has(filename)) continue;
    database.exec('BEGIN');
    try {
      migrationStatements(directory, filename).forEach((statement) => database.exec(statement));
      database.prepare('INSERT INTO pointline_migrations (name, applied_at) VALUES (?, ?)')
        .run(filename, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}

function toPostgresSql(sql) {
  let result = '';
  let parameter = 0;
  let quote = null;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      result += character;
      if (character === quote) {
        if (sql[index + 1] === quote) result += sql[++index];
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      result += character;
    } else if (character === '?') {
      result += `$${++parameter}`;
    } else {
      result += character;
    }
  }
  return result;
}

class PostgresStatement {
  constructor(pool, sql) {
    this.pool = pool;
    this.sql = toPostgresSql(sql);
    this.parameters = [];
  }

  bind(...parameters) {
    this.parameters = parameters;
    return this;
  }

  async first(client = this.pool) {
    const result = await client.query(this.sql, this.parameters);
    return result.rows[0] ?? null;
  }

  async all(client = this.pool) {
    const result = await client.query(this.sql, this.parameters);
    return { results: result.rows };
  }

  async run(client = this.pool) {
    const result = await client.query(this.sql, this.parameters);
    return {
      meta: {
        changes: result.rowCount || 0,
        last_row_id: 0,
      },
    };
  }
}

class PostgresDatabase {
  constructor(pool) {
    this.pool = pool;
  }

  prepare(sql) {
    return new PostgresStatement(this.pool, sql);
  }

  async batch(statements) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const statement of statements) results.push(await statement.run(client));
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

async function applyPostgresMigrations(pool, directory) {
  await pool.query(`CREATE TABLE IF NOT EXISTS pointline_migrations (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set((await pool.query('SELECT name FROM pointline_migrations')).rows.map((row) => row.name));

  for (const filename of migrationFiles(directory)) {
    if (applied.has(filename)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const statement of migrationStatements(directory, filename)) await client.query(statement);
      await client.query('INSERT INTO pointline_migrations (name, applied_at) VALUES ($1, $2)', [filename, new Date().toISOString()]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createSqliteDatabase({ databasePath, migrationsDirectory }) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  applySqliteMigrations(database, migrationsDirectory);
  return new SqliteDatabase(database);
}

export async function createPostgresDatabase({ connectionString, migrationsDirectory }) {
  const pool = new Pool({ connectionString });
  try {
    await applyPostgresMigrations(pool, migrationsDirectory);
    return new PostgresDatabase(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }
}
