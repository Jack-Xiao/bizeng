// tests/core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import core from '../core.js';

function freshCard(){ return { reps:0, ef:2.5, interval:0, due:null, lastReviewed:null, lapse:0 }; }

test('schedule: 连续记得，间隔 1→3→递增', () => {
  const c = freshCard();
  core.schedule(c, 4); assert.equal(c.interval, 1);
  core.schedule(c, 4); assert.equal(c.interval, 3);
  core.schedule(c, 4); assert.ok(c.interval > 3);
});

test('schedule: 忘了重置 reps 并记 lapse', () => {
  const c = freshCard();
  core.schedule(c, 4); core.schedule(c, 4);
  core.schedule(c, 1);
  assert.equal(c.reps, 0); assert.equal(c.lapse, 1); assert.equal(c.interval, 1);
});

test('谓词: 新卡 isNew，到期 isDue', () => {
  const c = freshCard();
  assert.ok(core.isNew(c));
  c.due = Date.now() - 1000;
  assert.ok(core.isDue(c)); assert.ok(!core.isNew(c));
});

test('掌握: 实战用过 2 次 → 掌握', () => {
  const c = { ...freshCard(), usedReal: 2, produced: 0 };
  assert.ok(core.isMastered(c));
});

test('掌握: 造过句 + reps>=4 且无 lapse → 掌握', () => {
  const c = { ...freshCard(), reps: 4, produced: 1, usedReal: 0 };
  assert.ok(core.isMastered(c));
});

test('掌握: 仅靠复习（reps>=4 无产出）→ 不算掌握', () => {
  const c = { ...freshCard(), reps: 6, produced: 0, usedReal: 0 };
  assert.ok(!core.isMastered(c));
});

test('applyRealUse: 第 1 次实战拉长间隔，第 2 次达到掌握', () => {
  const c = freshCard();
  core.schedule(c, 4);
  const dueBefore = c.due;
  core.applyRealUse(c);
  assert.equal(c.usedReal, 1);
  assert.ok(c.due > dueBefore);
  core.applyRealUse(c);
  assert.equal(c.usedReal, 2);
  assert.ok(core.isMastered(c));
});

test('applyRating: 掌握后忘了 → usedReal 回炉到 1', () => {
  const c = { ...freshCard(), usedReal: 2 };
  core.applyRating(c, 1);
  assert.equal(c.usedReal, 1);
  assert.ok(!core.isMastered(c));
});
