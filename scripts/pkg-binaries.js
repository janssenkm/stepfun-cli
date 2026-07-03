const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const targets = [
  { target: 'node18-linux-x64', output: path.join('bin', 'linux', 'x64', 'stepfun') },
  { target: 'node18-macos-x64', output: path.join('bin', 'macos', 'x64', 'stepfun') },
  { target: 'node18-win-x64', output: path.join('bin', 'windows', 'x64', 'stepfun.exe') }
];

const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

for (const { target, output } of targets) {
  const outputPath = path.join(root, output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const result = spawnSync(npxBin, ['-y', 'pkg@5.8.1', '.', '--targets', target, '--output', outputPath], {
    cwd: root,
    stdio: 'inherit',
    shell: false
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
