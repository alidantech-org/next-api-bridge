import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const [subpath, target] of Object.entries(pkg.exports)) {
  for (const field of ['types', 'import', 'require']) {
    assert.equal(existsSync(target[field]), true, `${subpath} ${field} target is missing: ${target[field]}`);
  }
}

const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' });
const packed = JSON.parse(output)[0];
const packedPaths = new Set(packed.files.map((file) => `./${file.path}`));
for (const target of Object.values(pkg.exports)) {
  for (const field of ['types', 'import', 'require']) {
    assert.equal(packedPaths.has(target[field]), true, `Tarball is missing declared export: ${target[field]}`);
  }
}
console.log(`Verified ${Object.keys(pkg.exports).length} export groups in ${packed.filename}`);
