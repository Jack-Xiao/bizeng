# BizEng Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 Mac 单文件背单词应用升级为手机优先的 PWA：部署到 GitHub Pages，加快速收件箱、造句挑战（场景造句+表达升级）、以产出为准的掌握规则。

**Architecture:** 保持静态无后端。把纯逻辑（SM-2、卡片状态、队列、掌握规则、选题）抽到 `core.js`（浏览器全局 + node 可测双用），`index.html` 只留 UI。新增 `manifest.webmanifest` + `sw.js` 构成 PWA。存储升级到 localStorage `bizEng.v4`（新增 produced/usedReal/inbox/source 字段与 sentences 数组），从 v3 自动迁移。

**Tech Stack:** 原生 HTML/CSS/JS（无框架无依赖）、node:test 跑单测、GitHub Pages 托管、`gh` CLI 部署。

**Spec:** `docs/superpowers/specs/2026-07-02-bizeng-mobile-sync-design.md`

## File Structure

| 文件 | 职责 |
|---|---|
| `index.html`（改） | UI：视图、渲染、事件；引用 core.js |
| `core.js`（新） | 纯逻辑：schedule / 卡片谓词 / 掌握规则 / 队列 / 选题 / UPGRADE 数据 |
| `tests/core.test.mjs`（新） | node:test 单测 |
| `manifest.webmanifest`（新） | PWA 清单 |
| `sw.js`（新） | Service worker，cache-first |
| `icons/icon-{180,192,512}.png`（新） | 图标（脚本生成） |
| `scripts/make-icons.mjs`（新） | 无依赖 PNG 生成脚本 |

现有代码关键位置（改动前的行号）：
- SM-2 与谓词：`index.html:567-611`（schedule/isDue/isNew/isMastered/isFrozen/getDueCards/dayCards/getNewCards/advanceDayIfNeeded）
- 状态与迁移：`index.html:485-565`（DB_KEY/state/load/save/makeCard）
- 评分：`index.html:707-720`（rate 调 schedule）
- 添加/词库：`index.html:874-889`（addWord）、`849-870`（renderLibrary）
- 导航：`index.html:246-250`；视图切换 `switchView` `index.html:755-762`
- head/viewport：`index.html:3-6`

---

### Task 1: 抽出 core.js + 测试骨架

把现有纯逻辑原样搬到 core.js，先让"旧行为在新家跑通"，后续任务在这里做 TDD。

**Files:**
- Create: `core.js`
- Create: `tests/core.test.mjs`
- Modify: `index.html`（head 引 script；删除被搬走的函数）

- [ ] **Step 1: 创建 core.js（搬运现有逻辑，原样不改行为）**

```js
/* core.js — 纯逻辑层。浏览器直接全局引用；node 测试经 module.exports。
   不碰 DOM、不碰 localStorage、不读全局 state。 */

/* SM-2 间隔复习（搬自原 index.html，行为不变） */
function schedule(card, quality){
  let { reps, ef, interval, lapse } = card;
  if(quality < 3){ reps = 0; interval = 1; lapse = (lapse||0) + 1; }
  else {
    if(reps === 0) interval = 1;
    else if(reps === 1) interval = 3;
    else interval = Math.round(interval * ef);
    reps += 1;
    if(quality === 5) interval = Math.round(interval * 1.3);
  }
  ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if(ef < 1.3) ef = 1.3;
  const due = new Date(); due.setDate(due.getDate() + interval);
  card.reps = reps; card.ef = ef; card.interval = interval;
  card.lapse = lapse; card.due = due.getTime(); card.lastReviewed = Date.now();
}

/* 卡片状态谓词 */
function isDue(c){ return c.due !== null && c.due <= Date.now(); }
function isNew(c){ return c.due === null; }
function isFrozen(c){ return (c.lapse||0) >= 3; }
function isMastered(c){ return c.reps >= 4 && (c.lapse||0) === 0; }  // Task 3 会重写

if (typeof module !== 'undefined') module.exports = {
  schedule, isDue, isNew, isFrozen, isMastered
};
```

- [ ] **Step 2: 写冒烟测试**

```js
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
```

- [ ] **Step 3: 跑测试确认通过**

Run: `cd /Users/xiaojiang/Documents/背单词 && node --test tests/`
Expected: 3 pass

- [ ] **Step 4: index.html 接入 core.js，删除重复定义**

在 `index.html` 的 `<script>`（第 254 行）之前加一行：

```html
<script src="core.js"></script>
```

然后删除 index.html 内联脚本中这些函数定义（它们现在来自 core.js 全局）：
`schedule`（原 568-583）、`isDue`/`isNew`/`isMastered`/`isFrozen`（原 586-589）。
保留 `getDueCards/dayCards/getNewCards/advanceDayIfNeeded`（它们读写全局 state，留在 index.html）。

- [ ] **Step 5: 浏览器验证无回归**

Run: `open "/Users/xiaojiang/Documents/背单词/index.html"`（或 preview 工具）
Expected: 首页正常渲染，开始学习→评分→下一张全流程无 console 报错。

- [ ] **Step 6: Commit**

```bash
git add core.js tests/ index.html
git commit -m "refactor: extract pure logic to core.js with node tests"
```

---

### Task 2: 存储升级 v4（新字段 + sentences 数组 + v3 迁移）

**Files:**
- Modify: `index.html`（DB_KEY、load、makeCard、addWord）

- [ ] **Step 1: 修改常量与 makeCard**

`index.html:485-486` 改为：

```js
const DB_KEY = 'bizEng.v4';
const DB_KEY_OLD = 'bizEng.v3';
```

`makeCard`（原 499-503）返回对象末尾追加新字段：

```js
function makeCard(w, i){
  return { id:'s'+i, en:w.en, zh:w.zh, scene:w.scene, day:w.day, topic:w.topic,
    example:w.example, note:w.note, createdAt:Date.now()-i*1000,
    reps:0, ef:2.5, interval:0, due:null, lastReviewed:null, lapse:0,
    produced:0, usedReal:0, inbox:false, source:'' };
}
```

- [ ] **Step 2: 重写 load() 的迁移链（v4 优先，v3 升级，否则全新）**

替换原 `load()`（504-564）整体为：

```js
function upgradeCard(c){
  c.produced = c.produced||0; c.usedReal = c.usedReal||0;
  c.inbox = c.inbox||false; c.source = c.source||'';
  return c;
}
function mergeSeed(){
  // SEED 里有但存档里没有的词 → 补进去（版本升级时）
  const existing = new Set(state.cards.map(c=>c.en));
  let added = 0;
  SEED.forEach((w)=>{
    if(!existing.has(w.en)){ state.cards.push(makeCard(w, state.cards.length + added)); added++; }
  });
  return added;
}
function load(){
  const saved = localStorage.getItem(DB_KEY) || localStorage.getItem(DB_KEY_OLD);
  if(saved){
    try {
      const parsed = JSON.parse(saved);
      if(parsed.cards && parsed.cards.length>0){
        state = parsed;
        state.cards.forEach(upgradeCard);
        state.sentences = state.sentences||[];
        mergeSeed();
        save();
        return;
      }
    } catch(e){}
  }
  // 全新用户
  state.cards = SEED.map((w,i)=>makeCard(w,i));
  state.history=[]; state.streak=0; state.lastStudyDate=null;
  state.currentDay=1; state.studyMode='reveal'; state.sentences=[];
  save();
}
```

同时把 `state` 初始声明（487-494）加一个字段 `sentences: []`。
（v2 迁移路径删除——用户 Mac 上已是 v3。）

- [ ] **Step 3: addWord 补新字段**

`addWord()`（原 878-885）push 的对象末尾追加 `produced:0, usedReal:0, inbox:false, source:''`。

- [ ] **Step 4: 浏览器验证 v3→v4 迁移**

打开应用（浏览器里已有 v3 数据），console 执行：
`JSON.parse(localStorage.getItem('bizEng.v4')).cards[0]`
Expected: 含 `produced:0, usedReal:0, inbox:false, source:''`；原 reps/due 保留。

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: storage v4 with production fields, sentences array, v3 migration"
```

---

### Task 3: 掌握规则重写（产出优先 + 渐进毕业）— TDD

**Files:**
- Modify: `core.js`、`tests/core.test.mjs`
- Modify: `index.html`（rate 改调 applyRating；词库加"实战用过"按钮）

- [ ] **Step 1: 写失败测试**

追加到 `tests/core.test.mjs`：

```js
test('掌握: 实战用过 2 次 → 掌握', () => {
  const c = { ...freshCard(), usedReal:2, produced:0 };
  assert.ok(core.isMastered(c));
});

test('掌握: 造过句 + reps>=4 且无 lapse → 掌握', () => {
  const c = { ...freshCard(), reps:4, produced:1, usedReal:0 };
  assert.ok(core.isMastered(c));
});

test('掌握: 仅靠复习（reps>=4 无产出）→ 不算掌握', () => {
  const c = { ...freshCard(), reps:6, produced:0, usedReal:0 };
  assert.ok(!core.isMastered(c));
});

test('applyRealUse: 第 1 次实战拉长间隔，第 2 次达到掌握', () => {
  const c = freshCard();
  core.schedule(c, 4); // 先学过一次
  const dueBefore = c.due;
  core.applyRealUse(c);
  assert.equal(c.usedReal, 1);
  assert.ok(c.due > dueBefore); // 间隔被拉长
  core.applyRealUse(c);
  assert.equal(c.usedReal, 2);
  assert.ok(core.isMastered(c));
});

test('applyRating: 掌握后忘了 → usedReal 回炉到 1', () => {
  const c = { ...freshCard(), usedReal:2 };
  core.applyRating(c, 1);
  assert.equal(c.usedReal, 1);
  assert.ok(!core.isMastered(c));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/`
Expected: 新增 5 个测试 FAIL（isMastered 旧逻辑 / applyRealUse、applyRating 未定义）

- [ ] **Step 3: 实现（core.js 中替换 isMastered，新增两函数）**

```js
/* 掌握标准（产出优先）：
   - 实战用过 >=2 次 → 掌握
   - 造过句 >=1 且 reps>=4 且无 lapse → 掌握
   - 仅靠复习最多算"熟练"，不算掌握 */
function isMastered(c){
  if((c.usedReal||0) >= 2) return true;
  return (c.produced||0) >= 1 && c.reps >= 4 && (c.lapse||0) === 0;
}

/* 渐进毕业：第 1 次实战按"简单"调度拉长间隔；第 2 次起 isMastered 生效 */
function applyRealUse(card){
  card.usedReal = (card.usedReal||0) + 1;
  if(card.usedReal === 1) schedule(card, 5);
}

/* 评分入口：掌握后又忘了 → usedReal 降回 1（回炉） */
function applyRating(card, quality){
  if(quality < 3 && (card.usedReal||0) >= 2) card.usedReal = 1;
  schedule(card, quality);
}
```

module.exports 追加 `applyRealUse, applyRating`。

- [ ] **Step 4: 跑测试确认全部通过**

Run: `node --test tests/`
Expected: 全部 pass

- [ ] **Step 5: index.html 接线**

`rate()`（原 707-720）里 `schedule(card, quality);` 改为 `applyRating(card, quality);`。

`renderLibrary()`（原 860-869）的词条 HTML 里，给"已学且未掌握"的卡加实战按钮。map 回调改为：

```js
box.innerHTML=list.map(c=>{
  let pill='';
  if(c.inbox)pill='<span class="pill due">待补全</span>';
  else if(isNew(c))pill='<span class="pill new">未学</span>';
  else if(isFrozen(c))pill='<span class="pill frozen">反复忘</span>';
  else if(isMastered(c))pill='<span class="pill mastered">已掌握</span>';
  else if(isDue(c))pill='<span class="pill due">待复习</span>';
  else pill='<span class="pill mastered">复习中</span>';
  const dueInfo=isNew(c)?'':(isDue(c)?'<span>🔴 今天</span>':'<span>'+daysUntil(c.due)+'天后</span>');
  const useBtn = (!isNew(c) && !isMastered(c) && !c.inbox)
    ? `<button class="use-btn" onclick="markUsed('${c.id}')">✓ 实战用过</button>` : '';
  return `<div class="word-item"><div class="top"><span class="en">${c.en}</span><span class="zh">${c.zh||'（待补全）'}</span></div><div class="meta">${pill}${c.scene?'<span>'+c.scene+'</span>':''}${c.day?'<span>Day '+c.day+'</span>':''}${dueInfo}<span>复习 ${c.reps} 次</span>${useBtn}</div></div>`;
}).join('');
```

新增函数（放 renderLibrary 之后）：

```js
function markUsed(id){
  const c = state.cards.find(x=>x.id===id); if(!c) return;
  applyRealUse(c); save();
  toast(c.usedReal>=2 ? '第 2 次实战，已掌握 🎉' : '很好！复习间隔已拉长');
  renderLibrary(); 
}
```

CSS（加到 `<style>` 内任意位置）：

```css
.use-btn { border:1px solid var(--green); color:var(--green); background:var(--green-soft); border-radius:8px; padding:2px 8px; font-size:12px; cursor:pointer; font-family:inherit; }
```

- [ ] **Step 6: 浏览器验证**

词库里找一个"复习中"的词 → 点"✓ 实战用过" → toast 提示、复习时间变远；再点一次 → 变"已掌握"。

- [ ] **Step 7: Commit**

```bash
git add core.js tests/ index.html
git commit -m "feat: production-based mastery with gradual graduation rules"
```

---

### Task 4: 快速收件箱 + 补全流程 + 新词队列优先级 — TDD

**Files:**
- Modify: `core.js`、`tests/core.test.mjs`（buildNewQueue）
- Modify: `index.html`（添加页快速收件箱 UI、editCard、词库 inbox 筛选、getNewCards 改造、首页提示）

- [ ] **Step 1: 写失败测试（buildNewQueue）**

```js
test('buildNewQueue: 已补全的自定义词优先于课表词，上限 6', () => {
  const seedCards = Array.from({length:8}, (_,i)=>({ id:'s'+i, en:'seed'+i, zh:'x', day:1, due:null, reps:0, inbox:false, createdAt:i }));
  const userCard  = { id:'u1', en:'my word', zh:'我的词', day:0, due:null, reps:0, inbox:false, createdAt:999 };
  const inboxCard = { id:'u2', en:'raw word', zh:'', day:0, due:null, reps:0, inbox:true, createdAt:998 };
  const r = core.buildNewQueue([...seedCards, userCard, inboxCard], 1, 6);
  assert.equal(r.queue.length, 6);
  assert.equal(r.queue[0].id, 'u1');           // 自定义词排最前
  assert.ok(!r.queue.some(c=>c.id==='u2'));    // 收件箱未补全的不进队列
});

test('buildNewQueue: 当前 day 学完则推进到下一个有新词的 day', () => {
  const d1 = { id:'a', en:'a', zh:'x', day:1, due:Date.now(), reps:1, inbox:false, createdAt:1 };
  const d3 = { id:'b', en:'b', zh:'x', day:3, due:null, reps:0, inbox:false, createdAt:2 };
  const r = core.buildNewQueue([d1, d3], 1, 6);
  assert.equal(r.day, 3);
  assert.equal(r.queue[0].id, 'b');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/`
Expected: buildNewQueue is not a function

- [ ] **Step 3: 实现 buildNewQueue（core.js）**

```js
/* 新词队列：已补全（zh 非空且非收件箱）的自定义词（day===0）优先于课表词。
   返回 { day, queue }，不改任何入参之外的状态——推进 currentDay 由调用方决定。 */
function buildNewQueue(cards, currentDay, cap){
  cap = cap || 6;
  const userFresh = cards
    .filter(c => c.day === 0 && !c.inbox && c.zh && isNew(c))
    .sort((a,b)=>a.createdAt-b.createdAt);
  let day = currentDay;
  let fresh = cards.filter(c => c.day === day && isNew(c));
  while(fresh.length === 0 && day < 30){
    day++;
    fresh = cards.filter(c => c.day === day && isNew(c));
  }
  return { day, queue: userFresh.concat(fresh).slice(0, cap) };
}
```

module.exports 追加 `buildNewQueue`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/`  Expected: 全部 pass

- [ ] **Step 5: index.html — getNewCards 改用 buildNewQueue**

替换原 `getNewCards()`（592-601）为：

```js
function getNewCards(){
  const r = buildNewQueue(state.cards, state.currentDay, 6);
  if(r.day !== state.currentDay){ state.currentDay = r.day; save(); }
  return r.queue;
}
```

- [ ] **Step 6: 添加页顶部加快速收件箱 UI**

在 `view-add` 的 `<p class="sub">`（原 231 行）之后、第一个 form-group 之前插入：

```html
<div class="quick-add">
  <h3>⚡ 快速收件箱</h3>
  <p class="qa-sub">10 秒收词：只填英文，来源点一下，晚上再补全</p>
  <input id="qEn" placeholder="如 table this discussion" autocapitalize="off">
  <div class="src-row" id="srcRow">
    <button data-src="邮件" onclick="pickSrc(this)">📧 邮件</button>
    <button data-src="会议" onclick="pickSrc(this)">🎙 会议</button>
    <button data-src="文档" onclick="pickSrc(this)">📄 文档</button>
    <button data-src="Bob" onclick="pickSrc(this)">🔍 Bob</button>
    <button data-src="自己想到" onclick="pickSrc(this)">💡 自己想到</button>
  </div>
  <button class="save-btn" onclick="quickAdd()">存入收件箱</button>
</div>
<div class="divider">— 或完整添加 / 补全 —</div>
```

给完整表单的保存按钮（原 237 行）加 id：`<button class="save-btn" id="saveBtn" onclick="addWord()">保存词条</button>`

CSS：

```css
.quick-add { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:16px; margin-bottom:16px; box-shadow:var(--shadow); }
.quick-add h3 { font-size:15px; margin-bottom:2px; }
.quick-add .qa-sub { font-size:12px; color:var(--text-faint); margin-bottom:10px; }
.quick-add input { width:100%; border:1px solid var(--border); border-radius:10px; padding:12px; font-size:16px; font-family:inherit; margin-bottom:10px; }
.src-row { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
.src-row button { border:1px solid var(--border); background:var(--bg); border-radius:20px; padding:6px 12px; font-size:13px; cursor:pointer; font-family:inherit; color:var(--text-soft); }
.src-row button.active { border-color:var(--accent); color:var(--accent); background:var(--accent-soft); }
.divider { text-align:center; color:var(--text-faint); font-size:12px; margin:14px 0; }
```

- [ ] **Step 7: 收件箱 JS（quickAdd / pickSrc / editCard / addWord 编辑模式）**

添加到 addWord 附近：

```js
let qSrc = '';
let editingId = null;
function pickSrc(btn){
  qSrc = btn.dataset.src;
  document.querySelectorAll('#srcRow button').forEach(b=>b.classList.toggle('active', b===btn));
}
function quickAdd(){
  const en = document.getElementById('qEn').value.trim();
  if(!en){ toast('填一下英文表达'); return; }
  if(state.cards.some(c=>c.en.toLowerCase()===en.toLowerCase())){ toast('词库里已有这个表达'); return; }
  state.cards.push({ id:'u'+Date.now(), en, zh:'', scene:'', day:0, topic:'自定义',
    example:'', note:'', source:qSrc, inbox:true, createdAt:Date.now(),
    reps:0, ef:2.5, interval:0, due:null, lastReviewed:null, lapse:0, produced:0, usedReal:0 });
  save();
  document.getElementById('qEn').value=''; qSrc='';
  document.querySelectorAll('#srcRow button').forEach(b=>b.classList.remove('active'));
  toast('已进收件箱：'+en);
}
function editCard(id){
  const c = state.cards.find(x=>x.id===id); if(!c) return;
  editingId = id;
  switchView('add');
  document.getElementById('fEn').value = c.en;
  document.getElementById('fZh').value = c.zh;
  document.getElementById('fScene').value = c.scene||'';
  document.getElementById('fExample').value = c.example||'';
  document.getElementById('fNote').value = c.note||'';
  document.getElementById('saveBtn').textContent = '保存补全';
  document.getElementById('fZh').focus();
}
```

改写 `addWord()` 支持编辑模式：

```js
function addWord(){
  const en=document.getElementById('fEn').value.trim();
  const zh=document.getElementById('fZh').value.trim();
  if(!en||!zh){ toast('英文和中文必填'); return; }
  if(editingId){
    const c = state.cards.find(x=>x.id===editingId);
    if(c){
      Object.assign(c, { en, zh,
        scene:document.getElementById('fScene').value.trim()||c.source||'自定义',
        example:document.getElementById('fExample').value.trim(),
        note:document.getElementById('fNote').value.trim(), inbox:false });
    }
    editingId=null; document.getElementById('saveBtn').textContent='保存词条';
    toast('已补全：'+en+'，将优先进入新词队列');
  } else {
    state.cards.push({
      id:'u'+Date.now(), en, zh,
      scene:document.getElementById('fScene').value.trim()||'自定义',
      day:0, topic:'自定义',
      example:document.getElementById('fExample').value.trim(),
      note:document.getElementById('fNote').value.trim(),
      createdAt:Date.now(), reps:0, ef:2.5, interval:0, due:null, lastReviewed:null, lapse:0,
      produced:0, usedReal:0, inbox:false, source:''
    });
    toast('已添加：'+en);
  }
  save();
  ['fEn','fZh','fScene','fExample','fNote'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('fEn').focus();
  renderHome();
}
```

- [ ] **Step 8: 词库加收件箱筛选**

`filterRow`（原 219-225 之间）追加一个按钮：

```html
<button data-f="inbox" onclick="setFilter('inbox')">收件箱</button>
```

`renderLibrary()` 筛选分支追加：

```js
else if(currentFilter==='inbox')list=list.filter(c=>c.inbox);
```

并在词条 HTML（Task 3 已改的 map）里，inbox 卡片加补全按钮——把 `useBtn` 一行改为：

```js
  const useBtn = c.inbox
    ? `<button class="use-btn" onclick="editCard('${c.id}')">✎ 补全</button>`
    : ((!isNew(c) && !isMastered(c)) ? `<button class="use-btn" onclick="markUsed('${c.id}')">✓ 实战用过</button>` : '');
```

- [ ] **Step 9: 首页收件箱提醒**

`renderHome()` 末尾（renderDayPick() 调用前）加：

```js
const inboxN = state.cards.filter(c=>c.inbox).length;
if(inboxN>0) document.getElementById('homeSub').textContent += `　📥 收件箱 ${inboxN} 条待补全`;
```

- [ ] **Step 10: 浏览器验证闭环**

快速收件箱存一个词（选来源）→ 首页出现提醒 → 词库"收件箱"筛选可见 → 点"补全"填中文保存 → 开始学习时该词排在新词第一个。

- [ ] **Step 11: Commit**

```bash
git add core.js tests/ index.html
git commit -m "feat: quick inbox with source tags, completion flow, user-word queue priority"
```

---

### Task 5: 造句挑战选题逻辑 + UPGRADE 数据 — TDD

**Files:**
- Modify: `core.js`（UPGRADE 常量 + pickChallenges）、`tests/core.test.mjs`

- [ ] **Step 1: 写失败测试**

```js
test('pickChallenges: 最多 3 题，含 1 道升级题（有匹配时），排除已做', () => {
  const now = Date.now();
  const cards = [
    { id:'1', en:'scope creep', reps:2, lastReviewed:now },
    { id:'2', en:'circle back', reps:1, lastReviewed:now },
    { id:'3', en:'sync up',     reps:1, lastReviewed:now-86400000 },
    { id:'4', en:'FYI',         reps:0, lastReviewed:null },       // 没学过，不出题
  ];
  const up = { 'scope creep': 'The customer keeps adding new requirements.' };
  const qs = core.pickChallenges(cards, up, []);
  assert.ok(qs.length <= 3);
  const upgrade = qs.filter(q=>q.type==='upgrade');
  assert.equal(upgrade.length, 1);
  assert.equal(upgrade[0].card.en, 'scope creep');
  assert.ok(!qs.some(q=>q.card.id==='4'));
  // 排除已做
  const qs2 = core.pickChallenges(cards, up, ['1']);
  assert.ok(!qs2.some(q=>q.card.id==='1'));
});

test('pickChallenges: 没学过任何词时返回空数组', () => {
  assert.deepEqual(core.pickChallenges([{id:'1',en:'x',reps:0}], {}, []), []);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/`  Expected: pickChallenges is not a function

- [ ] **Step 3: 实现 pickChallenges + UPGRADE（core.js）**

```js
/* 表达升级题库：平淡说法 → 目标表达（key 必须与 SEED 的 en 完全一致） */
const UPGRADE = {
  "scope creep": "The customer keeps adding new requirements.",
  "push back on": "We told the client we don't agree with the new deadline.",
  "sign off on": "The VP needs to approve the budget.",
  "loop in": "I will add Sarah to this email discussion.",
  "close the loop": "I will finish following up on this and let everyone know.",
  "bring someone up to speed": "I will tell the new engineer everything about the project.",
  "hit a roadblock": "We have a problem with the API integration.",
  "work around": "We found a temporary way to avoid the bug.",
  "flag": "I want to remind everyone about one risk.",
  "prioritize": "Let's do the customer bugs first.",
  "circle back": "Let's talk about the budget later.",
  "take it offline": "Let's discuss this privately after the meeting.",
  "touch base": "I will talk to the design team quickly.",
  "follow up": "I will check the status with the vendor again.",
  "by EOD": "Please send me the report before you finish work today.",
  "heads up": "I want to tell you in advance that the release may slip.",
  "align on": "Let's make sure we agree on the plan.",
  "on the same page": "I want to make sure we all understand the same thing.",
  "action item": "Let's list the tasks everyone needs to do after this meeting.",
  "wrap up": "Let's end the meeting now.",
  "take ownership": "I will be fully responsible for this issue.",
  "ETA": "When will the fix be ready?",
  "leverage": "We can use our existing user data to improve this.",
  "trade-off": "If we ship earlier, quality may suffer.",
  "ballpark": "Give me a rough number for the cost.",
  "boil down to": "In the end, the problem is really about budget.",
  "move the needle": "This feature will make a real difference for revenue.",
  "low-hanging fruit": "Let's start with the easiest improvements first.",
  "escalate": "We should report this problem to senior management.",
  "ramp up": "We need to add people to this project quickly.",
  "streamline": "We should make this approval process simpler.",
  "roll out": "We will release this feature to all users gradually."
};

/* 每晚 3 题：2 场景造句 + 1 表达升级。
   候选 = 已学（reps>=1）且今天没被出过题的卡。
   优先今天刚学/复习过的，其次最近复习过的。 */
function pickChallenges(cards, upgradeMap, doneIdsToday){
  const done = new Set(doneIdsToday||[]);
  const learned = cards.filter(c => c.reps >= 1 && !done.has(c.id));
  if(learned.length === 0) return [];
  const today = new Date().toDateString();
  const score = c =>
    (c.lastReviewed && new Date(c.lastReviewed).toDateString()===today ? 2 : 0) +
    (c.lastReviewed ? 1/(1+(Date.now()-c.lastReviewed)/86400000) : 0);
  const sorted = learned.slice().sort((a,b)=>score(b)-score(a));
  const upgradeCard = sorted.find(c=>upgradeMap[c.en]) || null;
  const scenario = sorted.filter(c=>!upgradeCard || c.id!==upgradeCard.id).slice(0,2);
  const qs = scenario.map(c=>({ type:'scenario', card:c }));
  if(upgradeCard) qs.push({ type:'upgrade', card:upgradeCard, plain:upgradeMap[upgradeCard.en] });
  return qs;
}
```

module.exports 追加 `pickChallenges, UPGRADE`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/`  Expected: 全部 pass

- [ ] **Step 5: Commit**

```bash
git add core.js tests/
git commit -m "feat: challenge question picker with 32-item upgrade bank"
```

---

### Task 6: 造句挑战视图（写句、范例自查、存档、复制本周）

**Files:**
- Modify: `index.html`（新视图 + 导航第 4 个 tab + 渲染/提交/复制函数 + CSS）

- [ ] **Step 1: 加视图与导航**

在 `view-add` section 之前插入：

```html
<section class="view" id="view-challenge">
  <div class="lib-head"><h2>今晚造句 <span class="tag" id="chTag">0/3</span></h2></div>
  <p class="sub" style="margin-bottom:16px;">用学过的表达写你自己的句子——造过句的词才算真正掌握。</p>
  <div id="chArea"></div>
</section>
```

导航（原 246-250）改为四个 tab：

```html
<nav>
  <button class="active" data-view="home" onclick="switchView('home')"><span class="ic">◉</span>今日</button>
  <button data-view="challenge" onclick="switchView('challenge')"><span class="ic">✍︎</span>造句</button>
  <button data-view="lib" onclick="switchView('lib')"><span class="ic">▤</span>词库</button>
  <button data-view="add" onclick="switchView('add')"><span class="ic">＋</span>添加</button>
</nav>
```

`switchView()`（原 755-762）追加分支：

```js
if(name==='challenge') renderChallenge();
```

- [ ] **Step 2: 渲染与提交逻辑**

```js
/* ============ 造句挑战 ============ */
let chQ = null;
function todaySentences(){ return (state.sentences||[]).filter(s=>s.date===todayStr()); }
function renderChallenge(){
  const box = document.getElementById('chArea');
  const done = todaySentences();
  document.getElementById('chTag').textContent = Math.min(done.length,3)+'/3';
  if(done.length >= 3){
    box.innerHTML = `<div class="complete"><div class="check">✍️</div><h2>今晚 3 句完成！</h2>
      <p>句子已存档。攒一周发给 AI 点评，效果最好。</p>
      <button class="start-btn" onclick="copyWeekSentences()">复制本周句子去点评</button></div>`;
    return;
  }
  const qs = pickChallenges(state.cards, UPGRADE, done.map(s=>s.cardId));
  if(qs.length===0){
    box.innerHTML = '<div class="empty"><div class="ic">✍️</div>还没有可出题的词，先去学今天的新词吧</div>';
    return;
  }
  chQ = qs[0];
  const c = chQ.card;
  const prompt = chQ.type==='upgrade'
    ? `把这句平淡表达升级，用上「<b>${c.en}</b>」：<div class="plain-line">"${chQ.plain}"</div>`
    : `场景：${c.scene||'工作中'}。用「<b>${c.en}</b>」（${c.zh}）写一句<b>你工作中真实会说的话</b>。`;
  box.innerHTML = `
    <div class="card">
      <span class="scene">${chQ.type==='upgrade'?'表达升级':'场景造句'} · 第 ${done.length+1} 题</span>
      <div class="prompt" style="font-size:17px">${prompt}</div>
      <textarea class="ch-input" id="chInput" rows="3" placeholder="写一句完整的英文…" autocapitalize="sentences"></textarea>
      <div class="ch-answer" id="chAnswer">
        <div class="en-row"><span class="en">${c.en}</span><button class="speak-btn" onclick="speak('${esc(c.en)}')">🔊</button></div>
        ${c.example?`<div class="example">范例："${c.example}"</div>`:''}
        ${c.note?`<div class="note">📌 ${c.note}</div>`:''}
        <div class="note" style="margin-top:6px">自查：搭配对象对吗？时态自然吗？这句你明天真的会用吗？</div>
      </div>
    </div>
    <button class="check-btn" id="chSubmit" onclick="submitSentence()">提交，对照范例</button>
    <button class="start-btn" id="chNext" style="display:none;margin-top:12px" onclick="renderChallenge()">下一题 →</button>`;
}
function submitSentence(){
  const txt = document.getElementById('chInput').value.trim();
  if(!txt){ toast('先写一句再提交'); return; }
  const c = chQ.card;
  state.sentences.push({ date:todayStr(), cardId:c.id, en:c.en, type:chQ.type, text:txt });
  c.produced = (c.produced||0) + 1;
  save();
  document.getElementById('chAnswer').classList.add('show');
  document.getElementById('chInput').disabled = true;
  document.getElementById('chSubmit').style.display='none';
  document.getElementById('chNext').style.display='block';
  document.getElementById('chTag').textContent = Math.min(todaySentences().length,3)+'/3';
}
function copyWeekSentences(){
  const weekAgo = Date.now() - 7*86400000;
  const list = (state.sentences||[]).filter(s => new Date(s.date).getTime() >= weekAgo);
  if(list.length===0){ toast('本周还没有句子'); return; }
  const txt = '这是我本周的商务英语造句练习，请逐句点评：指出不地道或语法有问题的地方，并给出更自然的说法。\n\n' +
    list.map((s,i)=>`${i+1}. [${s.en}] ${s.text}`).join('\n');
  const ok = ()=>toast('已复制，去发给 AI 点评吧');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(ok, ()=>toast('复制失败，请截图或手动复制'));
  } else { toast('浏览器不支持自动复制'); }
}
```

- [ ] **Step 3: CSS**

```css
.ch-input { width:100%; border:1px solid var(--border); border-radius:10px; padding:12px; font-size:16px; font-family:inherit; margin-top:12px; resize:vertical; }
.ch-input:disabled { background:var(--bg); color:var(--text-soft); }
.ch-answer { display:none; margin-top:14px; padding-top:14px; border-top:1px dashed var(--border); }
.ch-answer.show { display:block; }
.plain-line { background:var(--amber-soft); color:var(--amber); border-radius:8px; padding:8px 12px; margin-top:8px; font-size:15px; }
```

- [ ] **Step 4: 首页晚间引导**

`renderHome()` 里问候语设置后追加：

```js
if(new Date().getHours()>=19 && todaySentences().length<3){
  document.getElementById('homeSub').textContent = '晚上了——先清复习，再来 3 道造句题 ✍️';
}
```

- [ ] **Step 5: 浏览器验证**

造句 tab → 出题（应基于已学词）→ 写句提交 → 范例展示、输入框锁定 → 下一题 → 3 题后完成页 → 复制本周句子到剪贴板粘贴验证格式。console 里 `JSON.parse(localStorage.getItem('bizEng.v4')).sentences` 应有记录，对应卡片 produced+1。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: sentence challenge view with archive and weekly copy-for-review"
```

---

### Task 7: PWA（manifest + service worker + 图标 + iOS meta）

**Files:**
- Create: `manifest.webmanifest`、`sw.js`、`scripts/make-icons.mjs`、`icons/icon-{180,192,512}.png`
- Modify: `index.html`（head + SW 注册）

- [ ] **Step 1: 图标生成脚本（无依赖，纯色 PNG）**

```js
// scripts/make-icons.mjs — 生成纯色占位图标（品牌蓝 #2563eb）
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf){
  let table=[]; for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; table[n]=c>>>0; }
  let crc=0xFFFFFFFF; for(const b of buf) crc = table[(crc^b)&0xFF] ^ (crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function chunk(type, data){
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t=Buffer.from(type);
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data])));
  return Buffer.concat([len,t,data,crc]);
}
function png(size, [r,g,b]){
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
  ihdr[8]=8; ihdr[9]=2; // 8-bit RGB
  const row=Buffer.alloc(1+size*3);
  for(let x=0;x<size;x++){ row[1+x*3]=r; row[2+x*3]=g; row[3+x*3]=b; }
  const raw=Buffer.concat(Array(size).fill(row));
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR',ihdr), chunk('IDAT',deflateSync(raw)), chunk('IEND',Buffer.alloc(0))
  ]);
}
mkdirSync('icons', {recursive:true});
for(const s of [180,192,512]) writeFileSync(`icons/icon-${s}.png`, png(s,[37,99,235]));
console.log('icons generated');
```

Run: `cd /Users/xiaojiang/Documents/背单词 && node scripts/make-icons.mjs && file icons/*.png`
Expected: 3 个 `PNG image data` 文件

- [ ] **Step 2: manifest.webmanifest**

```json
{
  "name": "商务英语特训",
  "short_name": "BizEng",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f6f7f9",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 3: sw.js（cache-first，含清旧缓存）**

```js
// sw.js — 应用壳 cache-first。发版时必须递增 CACHE 版本号。
const CACHE = 'bizeng-v1';
const ASSETS = ['./', './index.html', './core.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }))
  );
});
```

- [ ] **Step 4: index.html head + 注册**

head（原 4-6 行区域）改造：viewport 加 `viewport-fit=cover`，并追加：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#2563eb">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="BizEng">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
```

内联脚本末尾（`load(); renderHome();` 之后）加注册（file:// 下自动跳过）：

```js
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('./sw.js');
}
```

- [ ] **Step 5: 本地 http 验证**

Run: `cd /Users/xiaojiang/Documents/背单词 && python3 -m http.server 8642` （后台）
浏览器开 `http://localhost:8642`：Application 面板确认 manifest 解析、SW activated；断网刷新页面仍可用。验证后停掉服务。

- [ ] **Step 6: Commit**

```bash
git add manifest.webmanifest sw.js scripts/ icons/ index.html
git commit -m "feat: PWA support — manifest, service worker, icons, iOS meta"
```

---

### Task 8: 手机单手布局微调

现有布局已是移动友好（sticky 底部导航、safe-area）。只做针对性小改。

**Files:**
- Modify: `index.html`（CSS）

- [ ] **Step 1: 追加移动端 CSS（style 块末尾）**

```css
/* 手机单手优化 */
@media (max-width: 480px) {
  .rating button { min-height: 60px; }            /* 拇指热区 */
  .reveal-btn, .check-btn, .start-btn { min-height: 52px; }
  .view { padding: 16px 14px; }
  .day-pick button { min-width: 44px; min-height: 44px; }
}
input, textarea { font-size: 16px !important; }    /* 防 iOS 聚焦自动放大 */
```

- [ ] **Step 2: 验证**

preview_resize 到 mobile（375×812）过一遍：首页、学习卡评分按钮、造句输入、快速收件箱，无横向滚动、按钮不拥挤。

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "style: one-hand mobile ergonomics"
```

---

### Task 9: 部署 GitHub Pages

**Files:** 无新文件（远端操作）

- [ ] **Step 1: 确认 gh 已认证**

Run: `gh auth status`
若未认证：停下来告知用户运行 `gh auth login`（此步需要用户参与）。

- [ ] **Step 2: 建仓并推送（Pages 免费版要求 public 仓库；仓库只含代码与通用词表，不含个人学习数据）**

```bash
cd /Users/xiaojiang/Documents/背单词
printf '.DS_Store\n' > .gitignore && git add .gitignore && git commit -m "chore: gitignore"
gh repo create bizeng --public --source=. --push
```

- [ ] **Step 3: 开启 Pages**

```bash
gh api -X POST "repos/{owner}/bizeng/pages" -f "source[branch]=main" -f "source[path]=/"
```

（若返回 409 已存在则跳过。）

- [ ] **Step 4: 验证线上可访问**

```bash
sleep 60 && curl -sI "https://$(gh api user -q .login).github.io/bizeng/" | head -3
```

Expected: `HTTP/2 200`（Pages 首次构建可能要等 1-2 分钟，404 就再等再试）

- [ ] **Step 5: 把网址告诉用户**

---

### Task 10: 真机验证 + 进度搬家（需用户参与）

- [ ] **Step 1: Mac 进度搬家指引**

用户在 Mac 上打开**旧的本地 index.html** → 添加页"导出备份"得到 JSON；
打开**新的 Pages 网址** → "导入备份"。验证 Day 进度 / 复习数一致。

- [ ] **Step 2: iPhone 安装**

Safari 打开 Pages 网址 → 分享 → 添加到主屏幕。同样导入备份 JSON（可通过 AirDrop 把文件传到手机）。

- [ ] **Step 3: 真机检查清单**

- 主屏幕图标打开为全屏（无 Safari 地址栏）
- 飞行模式下打开仍可复习（SW 离线）
- 学习卡 🔊 发音正常（iOS 需先点击一次页面激活 TTS）
- 快速收件箱、造句挑战在手机上单手可完成
- 更新 `docs/superpowers/specs/2026-07-02-bizeng-mobile-sync-design.md` 状态为"Phase 1 已交付"

- [ ] **Step 4: 最终提交**

```bash
git add -A && git commit -m "docs: mark phase 1 delivered" && git push
```

---

## 自查记录

- **规格覆盖**：部署(T9)、PWA+单手布局(T7/T8)、收件箱+来源+队列优先(T4)、造句挑战两题型+存档+复制(T5/T6)、掌握标准+渐进毕业(T3)、进度搬家(T10)。Phase 2 项（Supabase/实战清单/统计增强）明确不在本计划。
- **类型一致性**：卡片新字段 produced/usedReal/inbox/source 在 T2 定义，T3-T6 使用一致；`applyRating`/`applyRealUse`/`buildNewQueue`/`pickChallenges` 签名前后一致。
- **UPGRADE key 与 SEED en 逐一核对过**（来自实际 grep 输出）。
