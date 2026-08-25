// Guards the distribution surface: every package.json bin entry must point at a
// real executable file. This class of bug shipped once already (4 of 8 bins absent).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
test('every bin target exists', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const names = Object.keys(pkg.bin || {});
  assert.ok(names.length >= 8, `expected >=8 bins, got ${names.length}`);
  for (const [name, rel] of Object.entries(pkg.bin)) {
    const p = path.join(__dirname, '..', rel);
    assert.ok(fs.existsSync(p), `bin ${name} -> ${rel} MISSING`);
    assert.ok(fs.statSync(p).mode & 0o111, `bin ${name} -> ${rel} not executable`);
  }
});
