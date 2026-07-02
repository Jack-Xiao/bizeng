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
