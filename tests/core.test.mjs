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

test('掌握: 造过句 + reps>=4 仍不算真实掌握', () => {
  const c = { ...freshCard(), reps: 4, produced: 1, usedReal: 0 };
  assert.ok(!core.isMastered(c));
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

test('工作调用: 只有独立说出累计掌握，没想起会回炉', () => {
  const independent = { ...freshCard(), reps: 2 };
  core.applyTransferResult(independent, 'independent');
  assert.equal(independent.usedReal, 1);
  assert.ok(!core.isMastered(independent));
  core.applyTransferResult(independent, 'independent');
  assert.ok(core.isMastered(independent));

  const missed = { ...freshCard(), reps: 3 };
  core.applyTransferResult(missed, 'missed');
  assert.equal(missed.missedUses, 1);
  assert.equal(missed.reps, 0);
  assert.equal(missed.lapse, 1);
});

test('本地日期: 午夜后仍记录为本地当天', () => {
  assert.equal(core.localDateKey(new Date(2026, 6, 10, 0, 30)), '2026-07-10');
});

test('导入校验: 拒绝损坏结构，接受合法最小存档', () => {
  assert.ok(!core.isValidImportedState({ cards: 'bad' }));
  assert.ok(!core.isValidImportedState({ cards: [{ id:'1', en:'' }] }));
  assert.ok(!core.isValidImportedState({ cards: [{ id:'1', en:'x' }], history:{} }));
  assert.ok(core.isValidImportedState({ cards: [{ id:'1', en:'follow up', zh:'跟进' }] }));
});

test('HTML 转义: 用户词条不能注入标签或属性', () => {
  assert.equal(core.escapeHTML(`<img src=x onerror='bad'>`), '&lt;img src=x onerror=&#39;bad&#39;&gt;');
});

test('buildNewQueue: 已补全的自定义词优先于课表词，上限 6', () => {
  const seedCards = Array.from({ length: 8 }, (_, i) => ({ id: 's'+i, en: 'seed'+i, zh: 'x', day: 1, due: null, reps: 0, inbox: false, createdAt: i }));
  const userCard = { id: 'u1', en: 'my word', zh: '我的词', day: 0, due: null, reps: 0, inbox: false, createdAt: 999 };
  const inboxCard = { id: 'u2', en: 'raw word', zh: '', day: 0, due: null, reps: 0, inbox: true, createdAt: 998 };
  const r = core.buildNewQueue([...seedCards, userCard, inboxCard], 1, 6);
  assert.equal(r.queue.length, 6);
  assert.equal(r.queue[0].id, 'u1');
  assert.ok(!r.queue.some(c => c.id === 'u2'));
});

test('buildNewQueue: 当前 day 学完则推进到下一个有新词的 day', () => {
  const d1 = { id: 'a', en: 'a', zh: 'x', day: 1, due: Date.now(), reps: 1, inbox: false, createdAt: 1 };
  const d3 = { id: 'b', en: 'b', zh: 'x', day: 3, due: null, reps: 0, inbox: false, createdAt: 2 };
  const r = core.buildNewQueue([d1, d3], 1, 6);
  assert.equal(r.day, 3);
  assert.equal(r.queue[0].id, 'b');
});

test('pickChallenges: 最多 3 题，含 1 道升级题（有匹配时），排除已做', () => {
  const now = Date.now();
  const cards = [
    { id: '1', en: 'scope creep', reps: 2, lastReviewed: now },
    { id: '2', en: 'circle back', reps: 1, lastReviewed: now },
    { id: '3', en: 'sync up', reps: 1, lastReviewed: now - 86400000 },
    { id: '4', en: 'FYI', reps: 0, lastReviewed: null },
  ];
  const up = { 'scope creep': 'The customer keeps adding new requirements.' };
  const qs = core.pickChallenges(cards, up, []);
  assert.ok(qs.length <= 3);
  const upgrade = qs.filter(q => q.type === 'upgrade');
  assert.equal(upgrade.length, 1);
  assert.equal(upgrade[0].card.en, 'scope creep');
  assert.ok(!qs.some(q => q.card.id === '4'));
  const qs2 = core.pickChallenges(cards, up, ['1']);
  assert.ok(!qs2.some(q => q.card.id === '1'));
});

test('pickChallenges: 每日第三题优先返回表达升级', () => {
  const now = Date.now();
  const cards = [
    { id:'1', en:'scope creep', reps:2, lastReviewed:now },
    { id:'2', en:'sync up', reps:2, lastReviewed:now-1000 },
    { id:'3', en:'FYI', reps:2, lastReviewed:now-2000 },
  ];
  const qs = core.pickChallenges(cards, { 'scope creep':'Plain sentence.' }, ['2','3']);
  assert.equal(qs[0].type, 'upgrade');
});

test('pickChallenges: 没学过任何词时返回空数组', () => {
  assert.deepEqual(core.pickChallenges([{ id: '1', en: 'x', reps: 0 }], {}, []), []);
});

test('匿名沟通场景: 至少覆盖 45 个表达且结构完整', () => {
  const entries = Object.entries(core.COMMUNICATION_SCENARIOS);
  assert.ok(entries.length >= 45);
  for(const [expression, scenario] of entries){
    assert.ok(expression.length > 0);
    assert.equal(scenario.length, 2);
    assert.ok(scenario[0].length >= 2);
    assert.ok(scenario[1].length >= 12);
  }
});
