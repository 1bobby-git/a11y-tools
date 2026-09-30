import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// Minimal DOM element/window fixture that supports exactly what isHidden() reads:
// nodeType, hidden, hasAttribute, getAttribute, parentElement, ownerDocument.defaultView.getComputedStyle.
function build(chain) {
  // chain: array from the target element up to the root, each {display, visibility, hidden, inert, ariaHidden}
  const styleOf = new Map();
  const nodes = chain.map(spec => {
    const attrs = {};
    if (spec.inert) attrs.inert = '';
    if (spec.ariaHidden) attrs['aria-hidden'] = 'true';
    const node = {
      nodeType: 1,
      hidden: Boolean(spec.hidden),
      hasAttribute: name => name in attrs,
      getAttribute: name => (name in attrs ? attrs[name] : null),
      getRootNode: () => ({ host: null }),
    };
    styleOf.set(node, { display: spec.display || 'block', visibility: spec.visibility || 'visible' });
    return node;
  });
  for (let i = 0; i < nodes.length; i++) nodes[i].parentElement = nodes[i + 1] || null;
  const defaultView = { getComputedStyle: n => styleOf.get(n) };
  for (const n of nodes) n.ownerDocument = { defaultView };
  return nodes[0];
}

function audit() {
  const ctx = vm.createContext({ CSS: { escape: s => s } });
  vm.runInContext(read('public/assets/core.js'), ctx);
  return ctx.StudioAudit;
}

test('a visible descendant inside a visibility:hidden parent is not treated as hidden', () => {
  // getComputedStyle already resolves the override: the element itself computes `visible`.
  const el = build([
    { visibility: 'visible' }, // target overrides inherited hidden
    { visibility: 'hidden' },  // parent hides itself and inherited children
  ]);
  assert.equal(audit().isHidden(el), false);
});

test('an element that itself computes visibility:hidden is hidden', () => {
  const el = build([{ visibility: 'hidden' }, { visibility: 'hidden' }]);
  assert.equal(audit().isHidden(el), true);
});

test('display:none on any ancestor still hides the element (display is not inherited)', () => {
  const el = build([
    { visibility: 'visible' },
    { display: 'none', visibility: 'visible' },
  ]);
  assert.equal(audit().isHidden(el), true);
});

test('hidden, inert and aria-hidden ancestors still hide the element', () => {
  for (const spec of [{ hidden: true }, { inert: true }, { ariaHidden: true }]) {
    const el = build([{ visibility: 'visible' }, spec]);
    assert.equal(audit().isHidden(el), true, JSON.stringify(spec));
  }
});
