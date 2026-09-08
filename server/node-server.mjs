import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { WebSocketServer } from 'ws';
import { handleApi } from './index.js';
import { createPostgresDatabase, createSqliteDatabase } from './database.mjs';
import { getSessionUser, roomIdFromRequest } from './services/common.js';
import { requireMember } from './services/access-service.js';
import { readRoomState, registerRoomSocket } from './services/room-service.js';

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
  const url = `${protocol}://${request.headers.host || 'localhost'}${request.raw?.url || request.url || '/'}`;
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
const websocketServer = new WebSocketServer({ noServer: true });

function rejectWebSocket(socket, status, message) {
  if (socket.destroyed) return;
  const body = Buffer.from(message);
  socket.end([
    `HTTP/1.1 ${status} ${message}`,
    'Connection: close',
    'Content-Type: text/plain; charset=utf-8',
    `Content-Length: ${body.length}`,
    '',
    message,
  ].join('\r\n'));
}

async function authorizeWebSocket(request) {
  const webRequest = toWebRequest({ headers: request.headers, raw: request, method: 'GET' });
  const user = await getSessionUser(database, webRequest);
  if (!user) {
    const error = new Error('Sign in required');
    error.status = 401;
    throw error;
  }
  const roomId = roomIdFromRequest(webRequest);
  await requireMember(database, roomId, user);
  return { roomId, user, payload: await readRoomState(database, roomId, user.id) };
}

async function handleWebSocketUpgrade(request, socket, head) {
  let authorized;
  try {
    authorized = await authorizeWebSocket(request);
  } catch (error) {
    rejectWebSocket(socket, Number.isInteger(error?.status) ? error.status : 500, error?.message || 'WebSocket connection failed');
    return;
  }

  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    const { roomId, user, payload } = authorized;
    const subscriber = {
      userId: user.id,
      send(message) {
        if (websocket.readyState !== 1) throw new Error('WebSocket is not open');
        websocket.send(message);
      },
      close() {
        websocket.close();
      },
    };
    const unregister = registerRoomSocket(roomId, subscriber);
    const heartbeat = setInterval(() => {
      if (websocket.readyState === 1) websocket.ping();
    }, 25000);
    const cleanup = () => {
      clearInterval(heartbeat);
      unregister();
    };
    websocket.on('close', cleanup);
    websocket.on('error', cleanup);
    websocket.send(JSON.stringify({ event: 'state', data: { roomId, ...payload } }));
  });
}

await app.register(fastifyStatic, {
  root: frontendDirectory,
  prefix: '/',
});

app.get('/healthz', async () => ({ ok: true }));

app.server.on('upgrade', (request, socket, head) => {
  let pathname = '';
  try {
    pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
  } catch {
    socket.destroy();
    return;
  }
  if (pathname !== '/api/state/socket') return;
  void handleWebSocketUpgrade(request, socket, head).catch(() => socket.destroy());
});

app.all('/api/*', async (request, reply) => {
  const response = await handleApi(toWebRequest(request), env);
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
