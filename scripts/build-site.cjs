const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(process.argv[2] || process.cwd());
const dist = path.join(project, 'dist');
const staticFiles = ['index.html', 'app.js', 'styles.css', 'favicon.svg'];
const iconLibrary = path.join(project, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js');
const selfHosted = process.env.POINTLINE_SELF_HOSTED === 'true';
const frontendDist = path.join(project, 'frontend', 'dist');
const hasReactBuild = fs.existsSync(path.join(frontendDist, 'index.html'));

const staticContents = new Map(staticFiles.map((filename) => {
  const source = fs.readFileSync(path.join(project, filename), 'utf8');
  if (!selfHosted || filename !== 'index.html') return [filename, source];
  const marker = '  </head>';
  if (!source.includes(marker)) throw new Error('The index.html head marker was not found');
  return [filename, source.replace(marker, '    <script>window.__POINTLINE_SELF_HOSTED__ = true;</script>\n' + marker)];
}));

fs.mkdirSync(path.join(dist, 'server'), { recursive: true });
fs.mkdirSync(path.join(dist, '.openai', 'drizzle'), { recursive: true });

function collectFiles(directory, prefix = '') {
  const currentDirectory = path.join(directory, prefix);
  return fs.readdirSync(currentDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? collectFiles(directory, relative) : [relative];
  });
}

let assets;
if (hasReactBuild) {
  for (const filename of [...staticFiles, 'lucide.min.js']) {
    fs.rmSync(path.join(dist, filename), { force: true });
  }
  for (const relative of collectFiles(frontendDist)) {
    const target = path.join(dist, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(frontendDist, relative), target);
  }
  assets = collectFiles(frontendDist).map((relative) => [`/${relative.split(path.sep).join('/')}`, fs.readFileSync(path.join(frontendDist, relative), 'utf8')]);
} else {
  for (const filename of staticFiles) {
    fs.writeFileSync(path.join(dist, filename), staticContents.get(filename));
  }
  fs.copyFileSync(iconLibrary, path.join(dist, 'lucide.min.js'));
  assets = staticFiles.map((filename) => [`/${filename}`, staticContents.get(filename)]);
  assets.push(['/lucide.min.js', fs.readFileSync(iconLibrary, 'utf8')]);
}
fs.copyFileSync(path.join(project, '.openai', 'hosting.json'), path.join(dist, '.openai', 'hosting.json'));
fs.cpSync(path.join(project, 'drizzle'), path.join(dist, '.openai', 'drizzle'), { recursive: true });

const workerSource = fs.readFileSync(path.join(project, 'server', 'index.js'), 'utf8');
const builtWorker = workerSource.replace(
  'const STATIC_ASSETS = new Map();',
  () => `const STATIC_ASSETS = new Map(${JSON.stringify(assets)});`,
);
if (builtWorker === workerSource) throw new Error('Static asset marker was not found in server/index.js');
fs.writeFileSync(path.join(dist, 'server', 'index.js'), builtWorker);

console.log(`Built ${assets.length} static assets into dist/server/index.js${hasReactBuild ? ' using the React bundle' : ''}`);
