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
function isMastered(c){
  if((c.usedReal||0) >= 2) return true;
  return (c.produced||0) >= 1 && c.reps >= 4 && (c.lapse||0) === 0;
}

function applyRealUse(card){
  card.usedReal = (card.usedReal||0) + 1;
  if(card.usedReal === 1) schedule(card, 5);
}

function applyRating(card, quality){
  if(quality < 3 && (card.usedReal||0) >= 2) card.usedReal = 1;
  schedule(card, quality);
}

function buildNewQueue(cards, currentDay, cap){
  cap = cap || 6;
  const userFresh = cards
    .filter(c => c.day === 0 && !c.inbox && c.zh && isNew(c))
    .sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  let day = currentDay;
  let fresh = cards.filter(c => c.day === day && isNew(c));
  while(fresh.length === 0 && day < 30){
    day++;
    fresh = cards.filter(c => c.day === day && isNew(c));
  }
  return { day, queue: userFresh.concat(fresh).slice(0, cap) };
}

if (typeof module !== 'undefined') module.exports = {
  schedule, isDue, isNew, isFrozen, isMastered, applyRealUse, applyRating, buildNewQueue
};
