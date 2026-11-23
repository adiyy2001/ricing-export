import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCANNED_ROOTS } from './config.mjs';
import { countTestCases, DISABLED_TEST, hasComment, styleProblems } from './guards.mjs';

test('a line comment in Java is found', () => {
  assert.equal(hasComment('A.java', 'class A { int x; // note\n}'), true);
});

test('a url inside a string is not a comment', () => {
  assert.equal(hasComment('A.ts', "const url = 'https://example.com';"), false);
});

test('a text block with slashes is not a comment', () => {
  assert.equal(hasComment('A.java', 'String a = """\n// text\n""";'), false);
});

test('a regular expression with slashes is not a comment', () => {
  assert.equal(hasComment('a.mjs', 'const r = /\\/\\//.test(x);'), false);
});

test('a block comment in TypeScript is found', () => {
  assert.equal(hasComment('a.ts', '/** doc */ const a = 1;'), true);
});

test('a hash comment in properties is found and a shebang is not', () => {
  assert.equal(hasComment('a.properties', 'a=1\n# note'), true);
  assert.equal(hasComment('a.sh', '#!/usr/bin/env bash\necho a'), false);
});

test('a SQL comment is found and a dash in a string is not', () => {
  assert.equal(hasComment('a.sql', 'select 1; -- note'), true);
  assert.equal(hasComment('a.sql', "select '--';"), false);
});

test('an HTML comment is found', () => {
  assert.equal(hasComment('a.html', '<!-- note --><p>a</p>'), true);
});

test('dashes are reported outside skipped paths', () => {
  const read = () => `const a = 'x\u2014y';`;
  const scannedFile = `${SCANNED_ROOTS[0]}a.ts`;
  assert.deepEqual(styleProblems('HEAD', [scannedFile], read), [`${scannedFile}: em or en dash`]);
  assert.deepEqual(styleProblems('HEAD', ['outside-scanned-roots/a.ts', `${SCANNED_ROOTS[0]}node_modules/a.ts`], read), []);
});

test('test cases are counted in both stacks', () => {
  assert.equal(countTestCases("it('a', () => {}); test('b', () => {});"), 2);
  assert.equal(countTestCases('@Test void a() {} @ParameterizedTest void b() {}'), 2);
});

test('disabled and focused tests are recognised', () => {
  for (const text of ['@Disabled void a() {}', '@org.junit.jupiter.api.Disabled void a() {}', '@DisabledIfSystemProperty(named = "a", matches = "b") void a() {}', "it.skip('a', f)", "describe.only('a', f)", "xit('a', f)"]) {
    assert.match(text, DISABLED_TEST);
  }
  assert.doesNotMatch("it('skip a', f)", DISABLED_TEST);
});
