import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import worker from './index.js';
import { createPostgresDatabase, createSqliteDatabase } from './database.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendDirectory = join(projectRoot, 'frontend', 'dist');
const migrationsDirectory = process.env.DATABASE_URL
  ? join(projectRoot, 'drizzle-postgres')
  : join(projectRoot, 'drizzle');
const database = process.env.DATABASE_URL
  ? await createPostgresDatabase({
    connectionString: process.env.DATABASE_URL,
    migrationsDirectory,
  })
  : createSqliteDatabase({
    databasePath: process.env.POINTLINE_DB_PATH || join(projectRoot, 'data', 'pointline.sqlite'),
    migrationsDirectory,
  });

const env = {
  DB: database,
  POINTLINE_BOOTSTRAP_ADMIN_USERNAME: process.env.POINTLINE_BOOTSTRAP_ADMIN_USERNAME || '',
  POINTLINE_BOOTSTRAP_ADMIN_PASSWORD: process.env.POINTLINE_BOOTSTRAP_ADMIN_PASSWORD || '',
};

function toWebRequest(request) {
  const headers = new Headers();
  Object.entries(request.headers).forEach(([name, value]) => {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  });
  const protocol = request.headers['x-forwarded-proto']?.split(',')[0]?.trim() === 'https' ? 'https' : 'http';
  const url = `${protocol}://${request.headers.host || 'localhost'}${request.raw.url}`;
  const method = request.method || 'GET';
  const options = { method, headers };
  if (method !== 'GET' && method !== 'HEAD' && request.body !== undefined) {
    options.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    options.duplex = 'half';
  }
  return new Request(url, options);
}

async function sendWebResponse(response, reply) {
  response.headers.forEach((value, key) => reply.header(key, value));
  if (response.headers.get('content-type')?.startsWith('text/event-stream')) {
    reply.hijack();
    reply.raw.statusCode = response.status;
    if (response.body) Readable.fromWeb(response.body).pipe(reply.raw);
    else reply.raw.end();
    return;
  }
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : null;
  return reply.code(response.status).send(body);
}

const app = Fastify({ logger: true });

await app.register(fastifyStatic, {
  root: frontendDirectory,
  prefix: '/',
});

app.get('/healthz', async () => ({ ok: true }));

app.all('/api/*', async (request, reply) => {
  const response = await worker.fetch(toWebRequest(request), env);
  return sendWebResponse(response, reply);
});

app.setNotFoundHandler(async (request, reply) => {
  if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html');
  return reply.code(404).send({ error: 'Not found' });
});

const port = Number.parseInt(process.env.PORT || '8787', 10);
const host = process.env.HOST || '0.0.0.0';
await app.listen({ port, host });

async function shutdown() {
  await app.close();
  await database.close();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
