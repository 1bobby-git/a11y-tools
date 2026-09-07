import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('repository identity and all published configs point to a11y-tools', () => {
  assert.equal(JSON.parse(read('package.json')).name, 'a11y-tools');
  for (const dir of ['public', 'docs', 'extension']) {
    const ctx = { window: {} };
    vm.runInNewContext(read(`${dir}/assets/config.js`), ctx);
    assert.equal(ctx.window.STUDIO_CONFIG.repository, 'https://github.com/1bobby-git/a11y-tools');
    assert.equal(ctx.window.STUDIO_CONFIG.pages, 'https://1bobby-git.github.io/a11y-tools/');
  }
});

test('production workflow requires axe, tests the build, and deploys docs', () => {
  const yml = read('.github/workflows/pages.yml');
  assert.match(yml, /node scripts\/build\.mjs --require-axe/);
  assert.match(yml, /run: npm test/);
  assert.match(yml, /path: docs/);
  assert.match(yml, /needs: build/);
  assert.match(yml, /pages: write/);
  assert.match(yml, /id-token: write/);
  assert.doesNotMatch(yml, /contents: write/);
});

test('existing repository deployment never creates a repository or force pushes', () => {
  const ps = read('scripts/deploy.ps1');
  assert.match(ps, /\$Repo = '1bobby-git\/a11y-tools'/);
  assert.doesNotMatch(ps, /@\('repo','create'/);
  assert.doesNotMatch(ps, /'--force'|'--force-with-lease'/);
  assert.match(ps, /Existing project identity does not match/);
});

test('deploy script checks workflow exit status, exact live commit and bundled axe', () => {
  const ps = read('scripts/deploy.ps1');
  assert.match(ps, /'run','watch',\$RunId,'--repo',\$Repo,'--exit-status'/);
  assert.match(ps, /\$Info\.sha -eq \$Commit/);
  assert.match(ps, /\$Info\.axeBundled -eq \$true/);
  assert.match(ps, /\$Page\.StatusCode -eq 200/);
});

test('build metadata describes this package without a fabricated deployment SHA', () => {
  const metadata = JSON.parse(read('docs/build-info.json'));
  assert.equal(metadata.name, 'a11y-tools');
  assert.equal(metadata.version, JSON.parse(read('package.json')).version);
  assert.equal(metadata.repository, process.env.GITHUB_REPOSITORY || '1bobby-git/a11y-tools');
  assert.equal(metadata.sha, process.env.GITHUB_SHA || null);
  assert.equal(typeof metadata.axeBundled, 'boolean');
  assert.equal(read('public/build-info.json'), read('docs/build-info.json'));
});

test('Pages app assets remain relative and available under a repository subpath', () => {
  const html = read('docs/index.html');
  const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  for (const url of resources) {
    if (/^(https?:|mailto:|#|data:)/.test(url)) continue;
    assert.ok(!url.startsWith('/'), `Root-relative URL would escape /a11y-tools/: ${url}`);
    assert.ok(fs.existsSync(path.join(root, 'docs', url.split(/[?#]/)[0])), `Missing asset: ${url}`);
  }
});
