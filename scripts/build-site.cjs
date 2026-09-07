const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(process.argv[2] || process.cwd());
const dist = path.join(project, 'dist');
const staticFiles = ['index.html', 'app.js', 'styles.css'];

fs.mkdirSync(path.join(dist, 'server'), { recursive: true });
fs.mkdirSync(path.join(dist, '.openai', 'drizzle'), { recursive: true });

for (const filename of staticFiles) {
  fs.copyFileSync(path.join(project, filename), path.join(dist, filename));
}
fs.copyFileSync(path.join(project, '.openai', 'hosting.json'), path.join(dist, '.openai', 'hosting.json'));
fs.cpSync(path.join(project, 'drizzle'), path.join(dist, '.openai', 'drizzle'), { recursive: true });

const assets = staticFiles.map((filename) => [
  `/${filename}`,
  fs.readFileSync(path.join(project, filename), 'utf8'),
]);
const workerSource = fs.readFileSync(path.join(project, 'server', 'index.js'), 'utf8');
const builtWorker = workerSource.replace(
  'const STATIC_ASSETS = new Map();',
  `const STATIC_ASSETS = new Map(${JSON.stringify(assets)});`,
);
if (builtWorker === workerSource) throw new Error('Static asset marker was not found in server/index.js');
fs.writeFileSync(path.join(dist, 'server', 'index.js'), builtWorker);

console.log(`Built ${staticFiles.length} static assets into dist/server/index.js`);
