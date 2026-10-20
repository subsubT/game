import { GAME, enumerateCandidates } from './core.js';

export const FINAL_DURATION_MS = 600000;
export const FINAL_VERSION = '1.0.0';

// Original questions derived from the five unit concepts, not guidebook text.
// Distinct displayed tasks are deduplicated, including commuted blank equations.
function makeBank() {
  const groups = GAME.types.map(type => {
    const unique = new Map();
    for (let round = 1; round <= 10; round++) for (const base of enumerateCandidates(type, round)) {
      const [a,b,c] = base.operands;
      const tasks = [];
      if (type === 'add_three_small') tasks.push(
        [`${a} + ${b} + ${c} = □`, base.answer],
        [`상자에 공 ${a}개, ${b}개, ${c}개를 넣었어요. 모두 몇 개일까요?`, base.answer],
        [`${a} + ${b} + ${c}를 앞에서부터 계산해요. 먼저 ${a} + ${b} = □`, a+b]);
      else if (type === 'subtract_three_small') tasks.push(
        [`${a} − ${b} − ${c} = □`, base.answer],
        [`공 ${a}개 중 ${b}개를 꺼내고 다시 ${c}개를 꺼냈어요. 몇 개 남을까요?`, base.answer],
        [`${a} − ${b} − ${c}를 차례로 계산해요. 먼저 ${a} − ${b} = □`, a-b]);
      else if (type === 'make_ten') tasks.push(
        [base.subtype === 'a+blank=10' ? `${a} + □ = 10` : base.subtype === 'blank+a=10' ? `□ + ${a} = 10` : base.subtype === '10=a+blank' ? `10 = ${a} + □` : `10 = □ + ${a}`,base.answer],
        [`열 칸 중 ${a}칸을 채웠어요. 10칸이 되려면 몇 칸 더 채울까요?`,base.answer]);
      else if (type === 'subtract_from_ten') tasks.push(
        [base.subtype === 'result_blank' ? `10 − ${b} = □` : `10 − □ = ${10-b}`,base.answer],
        [base.subtype === 'result_blank' ? `공 10개에서 ${b}개를 꺼냈어요. 몇 개 남을까요?` : `공 10개에서 몇 개를 꺼내니 ${10-b}개가 남았어요. 꺼낸 공은 몇 개일까요?`,base.answer]);
      else tasks.push([`${a} + ${b} + ${c} = ?`,base.answer]);
      for (const [prompt,answer] of tasks) if (!unique.has(prompt)) unique.set(prompt, {
        ...base, subtype: `final_${base.subtype}`, finalPrompt: prompt, answer,
        visual: type === 'make_ten_then_add' ? 'cards' : 'final-text',
        finalExplanation: type === 'make_ten_then_add' ? `10이 되는 두 수를 먼저 묶으면 세 수의 합은 ${base.answer}예요.` : `빈칸에 들어갈 수는 ${answer}예요. 식과 이야기의 수를 차례로 확인해 보세요.`
      });
    }
    // Interleave representations instead of taking just adjacent numeric variants.
    const values = [...unique.values()], selected = [], buckets=new Map();
    for(const q of values){const key=type==='make_ten_then_add'?q.subtype:q.finalPrompt.includes('먼저')?'process':/^(공|상자|열)/.test(q.finalPrompt)?'story':'equation';if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(q);}
    for(let i=0;selected.length<Math.min(90,values.length);i++)for(const bucket of buckets.values())if(bucket[i]&&selected.length<90)selected.push(bucket[i]);
    return selected;
  });
  const bank=[];
  for(let i=0; i<Math.max(...groups.map(g=>g.length)); i++) for(const group of groups) if(group[i]) bank.push(group[i]);
  return bank.map((q,i)=>Object.freeze({...q, bankId:`f1-${i}`}));
}
export const FINAL_BANK = Object.freeze(makeBank());
function shuffled(seed,cycle) {
  let state = (seed ^ Math.imul(cycle+1,0x9e3779b9)) >>> 0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const groups=GAME.types.map(type=>FINAL_BANK.filter(q=>q.typeId===type));
  for(const group of groups) for(let i=group.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[group[i],group[j]]=[group[j],group[i]];}
  const order=[];
  while(groups.some(g=>g.length)) {const batch=groups.filter(g=>g.length).map(g=>g.pop());for(let i=batch.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[batch[i],batch[j]]=[batch[j],batch[i]];}order.push(...batch);}
  return order;
}
export function finalQuestion(seed,index) {
  const q=shuffled(seed,Math.floor(index/FINAL_BANK.length))[index%FINAL_BANK.length];
  return {...structuredClone(q),id:`final-${index}-${q.bankId}`,index,round:1,step:q.typeId==='make_ten_then_add'?'pair':'answer',firstResponse:null,stepResults:[]};
}
export function finalRemaining(f,time=Date.now()) {
  return Math.max(0,Math.min(FINAL_DURATION_MS,f.remainingMs)-(f.status==='playing'?Math.max(0,time-f.runningSince):0));
}
export function unpackFinal(f) {
  if(!f)return f;
  const {questionJson,feedbackJson,...other}=f;
  return {...other,question:f.question||(questionJson?JSON.parse(questionJson):null),feedback:f.feedback||(feedbackJson?JSON.parse(feedbackJson):null)};
}
export function packFinal(f) {
  const {question,feedback,...other}=f;
  return {...other,questionJson:question?JSON.stringify(question):null,feedbackJson:feedback?JSON.stringify(feedback):null};
}
