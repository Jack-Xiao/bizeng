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
  return (c.usedReal||0) >= 2;
}

function applyRealUse(card){
  card.usedReal = (card.usedReal||0) + 1;
  if(card.usedReal === 1) schedule(card, 5);
}

function applyRating(card, quality){
  if(quality < 3 && (card.usedReal||0) >= 2) card.usedReal = 1;
  schedule(card, quality);
}

/* 工作中的调用结果。只有“独立说出”累计真实掌握；其余结果用于安排回炉。 */
function applyTransferResult(card, result){
  card.transferAttempts = (card.transferAttempts||0) + 1;
  if(result === 'independent'){
    applyRealUse(card);
    return;
  }
  if(result === 'prompted'){
    card.promptedUses = (card.promptedUses||0) + 1;
    schedule(card, 3);
    return;
  }
  if(result === 'thought'){
    card.thoughtNotSaid = (card.thoughtNotSaid||0) + 1;
    schedule(card, 3);
    return;
  }
  if(result === 'missed'){
    card.missedUses = (card.missedUses||0) + 1;
    applyRating(card, 1);
    return;
  }
  throw new Error('Unknown transfer result');
}

function localDateKey(date){
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidImportedState(data){
  if(!data || typeof data !== 'object' || !Array.isArray(data.cards) || data.cards.length === 0) return false;
  if(data.cards.length > 5000) return false;
  if(data.history !== undefined && !Array.isArray(data.history)) return false;
  if(data.sentences !== undefined && !Array.isArray(data.sentences)) return false;
  if(data.transfers !== undefined && !Array.isArray(data.transfers)) return false;
  return data.cards.every(card => card && typeof card === 'object' &&
    typeof card.id === 'string' && card.id.length > 0 && card.id.length <= 200 &&
    typeof card.en === 'string' && card.en.trim().length > 0 && card.en.length <= 500 &&
    (card.zh === undefined || typeof card.zh === 'string'));
}

function escapeHTML(value){
  return String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  })[ch]);
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

/* 不携带真实工作信息的沟通意图训练。key 必须与 SEED.en 完全一致。 */
const COMMUNICATION_SCENARIOS = {
  "circle back": ["暂缓议题", "当前信息还不完整。建议稍后在条件具备时重新讨论。"],
  "take it offline": ["控制会议", "讨论开始偏离当前议题。建议会后由相关人员继续讨论。"],
  "stay on track": ["拉回主题", "会议讨论逐渐跑题。礼貌提醒大家回到当前议程。"],
  "table this": ["暂时搁置", "当前时间不足以完成讨论。建议把这个议题留到下一次会议。"],
  "walk through": ["逐步讲解", "一位同事不熟悉某个虚构流程。说明你会带对方逐步了解。"],
  "touch base": ["快速沟通", "你需要和同事进行一次简短沟通，确认下一步是否顺利。"],
  "sync up": ["同步进展", "两个协作方掌握的信息不同。建议安排一次简短同步。"],
  "check in with": ["了解进展", "你想了解同事负责事项的当前状态，同时避免语气像质问。"],
  "follow up": ["催促回复", "你之前提出过一个请求但还没有收到回复。礼貌地再次询问进展。"],
  "close the loop": ["完成闭环", "一个待办已经接近结束。说明你会完成最后确认并同步结果。"],
  "by EOD": ["明确时限", "一项非敏感任务需要今天完成。礼貌而清楚地说明截止时间。"],
  "heads up": ["提前告知", "一项安排可能发生变化。提前告诉同事，让对方有时间准备。"],
  "get back to": ["承诺回复", "你暂时没有完整答案。说明会在核实后回复对方。"],
  "loop in": ["邀请协作", "某位相关同事需要了解背景或参与后续讨论。说明你会把对方加入沟通。"],
  "apologies for the delay": ["解释延迟", "你的回复比预期晚。简短道歉并说明接下来会做什么。"],
  "just a quick reminder": ["友好提醒", "一个约定时间临近。写一句不带责备意味的提醒。"],
  "action item": ["确认行动项", "会议即将结束。明确一个虚构任务及其责任归属。"],
  "wrap up": ["结束会议", "会议时间快到了。礼貌地结束讨论并转向总结。"],
  "recap": ["总结共识", "讨论包含多个观点。用一句话引出对结论和下一步的总结。"],
  "sign off on": ["请求批准", "下一步行动需要决策者确认。写一句简洁、正式的批准请求。"],
  "buy-in": ["争取支持", "一个新方案需要其他团队支持。说明为什么需要先获得认同。"],
  "escalate": ["升级问题", "问题超过当前团队的权限或能力。客观说明需要向上升级。"],
  "green-light": ["获得许可", "准备工作已经完成，但仍需负责人允许后才能开始。"],
  "prioritize": ["确定优先级", "资源有限，多个虚构任务无法同时进行。提出先处理其中一个。"],
  "deprioritize": ["降低优先级", "一个低影响事项正在占用资源。建议暂时降低它的优先级。"],
  "low-hanging fruit": ["寻找速赢", "团队需要先取得一个小而明确的进展。建议从最容易改善的部分开始。"],
  "blocker": ["说明阻碍", "你无法继续推进一项虚构任务。清楚说明存在一个外部阻碍。"],
  "scope creep": ["说明范围变化", "新的要求不断加入。客观指出这已经超出原先约定的范围。"],
  "scope down": ["缩小范围", "当前时间不足以完成全部内容。建议减少交付范围以保住核心目标。"],
  "flag": ["提醒风险", "你发现一个可能影响交付的风险。客观提醒团队，但不要使用真实名称或数据。"],
  "mitigate the risk": ["降低风险", "一个抽象风险无法完全消除。提出一项可以降低影响的措施。"],
  "contingency plan": ["准备预案", "主要方案可能失败。建议提前准备一个不含真实细节的备用方案。"],
  "at risk": ["报告风险状态", "某项虚构目标可能无法按计划完成。客观说明它目前处于风险中。"],
  "drill down": ["深入分析", "当前结论过于笼统。建议进一步查看某个抽象维度或原因。"],
  "high-level": ["概括说明", "听众只需要整体方向。说明你会先提供不涉及细节的概览。"],
  "pivot": ["调整方向", "已有方案的前提发生变化。建议团队转向一个新的抽象方向。"],
  "align on": ["达成一致", "行动前需要所有人对范围或下一步形成一致理解。"],
  "on the same page": ["确认理解", "你想确认大家对目标和责任分工的理解一致。"],
  "push back on": ["礼貌反对", "对方提出了过紧的时间要求。说明你不能直接接受，并给出一个虚构理由。"],
  "trade-off": ["解释取舍", "速度、质量和范围无法同时最大化。说明其中一个抽象取舍。"],
  "meet halfway": ["寻找折中", "双方偏好的方案不同。提出一个彼此都需要让步的中间选择。"],
  "deal-breaker": ["说明底线", "某项条件如果不能满足，你将无法接受方案。坚定但专业地说明底线。"],
  "just to clarify": ["请求澄清", "对方的要求存在两种理解。先确认你的理解是否正确。"],
  "run it by": ["征求意见", "你有一个初步想法，希望在行动前先听取同事意见。"],
  "bring someone up to speed": ["补充背景", "一位同事刚加入讨论。说明你会提供必要的非敏感背景。"],
  "take ownership": ["承担责任", "一项问题需要明确负责人。主动说明你会负责推进并跟进结果。"],
  "hit a roadblock": ["报告受阻", "推进过程中遇到无法自行解决的问题。说明目前受阻并需要协助。"],
  "ETA": ["询问时间", "你需要知道一项工作的预计完成时间，但不想显得在施压。"]
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
  // 页面每次只取第一题：每日前两题练情境，第三题把升级题移到队首。
  if(done.size >= 2 && upgradeCard) qs.unshift(qs.pop());
  return qs;
}

if (typeof module !== 'undefined') module.exports = {
  schedule, isDue, isNew, isFrozen, isMastered, applyRealUse, applyRating,
  applyTransferResult, localDateKey, isValidImportedState, escapeHTML, buildNewQueue,
  pickChallenges, UPGRADE, COMMUNICATION_SCENARIOS
};
