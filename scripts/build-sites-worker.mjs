import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

const projectRoot = resolve(process.argv[2] || process.cwd());
const outputRoot = resolve(process.argv[3] || join(projectRoot, '.sites-build'));
const frontendRoot = join(projectRoot, 'frontend', 'dist');

if (!existsSync(join(frontendRoot, 'index.html'))) {
  throw new Error('Build the frontend before creating the Sites Worker artifact');
}

function collectFiles(directory, prefix = '') {
  return readdirSync(join(directory, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = join(prefix, entry.name);
      return entry.isDirectory() ? collectFiles(directory, relativePath) : [relativePath];
    })
    .sort();
}

rmSync(outputRoot, { recursive: true, force: true });
const distRoot = join(outputRoot, 'dist');
mkdirSync(join(distRoot, 'server'), { recursive: true });
mkdirSync(join(outputRoot, '.openai'), { recursive: true });

for (const relativePath of collectFiles(frontendRoot)) {
  const target = join(distRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(frontendRoot, relativePath), target);
}

cpSync(join(projectRoot, 'server', 'index.js'), join(distRoot, 'server', 'api.js'));
cpSync(join(projectRoot, 'server', 'routes'), join(distRoot, 'server', 'routes'), { recursive: true });
cpSync(join(projectRoot, 'server', 'services'), join(distRoot, 'server', 'services'), { recursive: true });
cpSync(join(projectRoot, '.openai', 'hosting.json'), join(outputRoot, '.openai', 'hosting.json'));
cpSync(join(projectRoot, 'drizzle'), join(outputRoot, 'drizzle'), { recursive: true });

const assets = collectFiles(frontendRoot).map((relativePath) => [
  `/${relativePath.split(sep).join('/')}`,
  readFileSync(join(frontendRoot, relativePath), 'utf8'),
]);

const workerSource = `import { handleApi } from './api.js';

const STATIC_ASSETS = new Map(${JSON.stringify(assets)});
const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function contentType(pathname) {
  if (pathname.endsWith('.html')) return 'text/html; charset=utf-8';
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
  if (pathname.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function serveStatic(request, env) {
  if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
    const platformResponse = await env.ASSETS.fetch(request);
    if (platformResponse.status !== 404) return platformResponse;
  }

  const url = new URL(request.url);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const resolvedPath = STATIC_ASSETS.has(pathname) ? pathname : request.method === 'GET' ? '/index.html' : null;
  const asset = resolvedPath ? STATIC_ASSETS.get(resolvedPath) : null;
  if (!asset) return new Response('Not found', { status: 404 });
  return new Response(asset, {
    headers: {
      'cache-control': 'no-cache',
      'content-type': contentType(resolvedPath),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return json({ ok: true });
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return serveStatic(request, env);
  },
};
`;

writeFileSync(join(distRoot, 'server', 'index.js'), workerSource);
console.log(outputRoot);
