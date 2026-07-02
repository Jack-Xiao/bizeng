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

const UPGRADE = {
  "scope creep": "The customer keeps adding new requirements.",
  "push back on": "We told the client we do not agree with the new deadline.",
  "sign off on": "The VP needs to approve the budget.",
  "loop in": "I will add Sarah to this email discussion.",
  "close the loop": "I will finish following up on this and let everyone know.",
  "bring someone up to speed": "I will tell the new engineer everything about the project.",
  "hit a roadblock": "We have a problem with the API integration.",
  "work around": "We found a temporary way to avoid the bug.",
  "flag": "I want to remind everyone about one risk.",
  "prioritize": "Let us do the customer bugs first.",
  "circle back": "Let us talk about the budget later.",
  "take it offline": "Let us discuss this privately after the meeting.",
  "touch base": "I will talk to the design team quickly.",
  "follow up": "I will check the status with the vendor again.",
  "by EOD": "Please send me the report before you finish work today.",
  "heads up": "I want to tell you in advance that the release may slip.",
  "align on": "Let us make sure we agree on the plan.",
  "on the same page": "I want to make sure we all understand the same thing.",
  "action item": "Let us list the tasks everyone needs to do after this meeting.",
  "wrap up": "Let us end the meeting now.",
  "take ownership": "I will be fully responsible for this issue.",
  "ETA": "When will the fix be ready?",
  "leverage": "We can use our existing user data to improve this.",
  "trade-off": "If we ship earlier, quality may suffer.",
  "ballpark": "Give me a rough number for the cost.",
  "boil down to": "In the end, the problem is really about budget.",
  "move the needle": "This feature will make a real difference for revenue.",
  "low-hanging fruit": "Let us start with the easiest improvements first.",
  "escalate": "We should report this problem to senior management.",
  "ramp up": "We need to add people to this project quickly.",
  "streamline": "We should make this approval process simpler.",
  "roll out": "We will release this feature to all users gradually."
};

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

if (typeof module !== 'undefined') module.exports = {
  schedule, isDue, isNew, isFrozen, isMastered, applyRealUse, applyRating, buildNewQueue,
  pickChallenges, UPGRADE
};
