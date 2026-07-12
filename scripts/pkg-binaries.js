// Packages the CLI into per-platform compressed archives via vercel/pkg
// (npm run pkg). Each archive keeps the original binary name inside
// (stepfun / stepfun.exe); the archive name encodes the platform so the
// three builds no longer collide when uploaded to a GitHub Release.
// Requires `tar` and `zip` on PATH (present on GitHub Actions runners).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const binDir = path.join(root, 'bin');
fs.mkdirSync(binDir, { recursive: true });

const targets = [
  { target: 'node18-linux-x64', archive: `stepfun-v${version}-linux-x64.tar.gz`, binary: 'stepfun' },
  { target: 'node18-macos-x64', archive: `stepfun-v${version}-macos-x64.tar.gz`, binary: 'stepfun' },
  { target: 'node18-win-x64',   archive: `stepfun-v${version}-windows-x64.zip`,  binary: 'stepfun.exe' },
];

const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

for (const { target, archive, binary } of targets) {
  // Build the raw binary into a per-target staging dir, then compress it
  // under its original name so archives coexist without clobbering.
  const stage = path.join(binDir, '.stage', target);
  fs.mkdirSync(stage, { recursive: true });
  const raw = path.join(stage, binary);

  const built = spawnSync(npxBin, ['-y', 'pkg@5.8.1', '.', '--targets', target, '--output', raw], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (built.error) {
    console.error(built.error.message);
    process.exit(1);
  }
  if (built.status !== 0) {
    process.exit(built.status || 1);
  }

  const archivePath = path.join(binDir, archive);
  // Place the binary at the archive root under its original name.
  const archived =
    target.endsWith('win-x64')
      ? spawnSync('zip', ['-j', archivePath, raw], { stdio: 'inherit', shell: false })
      : spawnSync('tar', ['-czf', archivePath, '-C', stage, binary], { stdio: 'inherit', shell: false });
  if (archived.status !== 0) {
    process.exit(archived.status || 1);
  }
  console.log(`packaged ${archive} (contains ${binary})`);
}

// Only archives should ship under bin/.
fs.rmSync(path.join(binDir, '.stage'), { recursive: true, force: true });
