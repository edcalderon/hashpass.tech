import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStyleLiterals, introducedStyles } from '../scripts/check-design-system.mjs';
test('detects new raw geometry and colors while accepting semantic tokens', () => {
  const source = 'const style = { borderRadius: 29, backgroundColor: "#abcdef", color: palette.text }; const card = <View style={{borderRadius: uiTokens.radius.card}} />;';
  assert.deepEqual(collectStyleLiterals(source), { 'radius:29': 1, 'backgroundColor:#abcdef': 1 });
  assert.equal(introducedStyles(collectStyleLiterals(source), {}).length, 2);
});
test('does not permit spreading existing debt to more occurrences', () => {
  assert.deepEqual(introducedStyles({ 'radius:20': 2 }, { 'radius:20': 1 }), [['radius:20', 2]]);
  assert.deepEqual(introducedStyles({ 'radius:20': 1 }, { 'radius:20': 2 }), []);
});
test('catches arbitrary Tailwind radius values', () => {
  assert.deepEqual(collectStyleLiterals('const card = <div className="rounded-[27px]" />;'), { 'arbitrary-radius:27px': 1 });
});
