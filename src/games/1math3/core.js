export const GAME = Object.freeze({
  gameId: '1math3', curriculumVersion: '1.0.0', rulesVersion: '1.0.0', generatorVersion: '1.0.0', schemaVersion: 1,
  types: ['add_three_small', 'subtract_three_small', 'make_ten', 'subtract_from_ten', 'make_ten_then_add']
});

function rng(seed) {
  let s = (Number(seed) >>> 0) || 0x1a2b3c4d;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const signature = q => JSON.stringify([q.typeId, q.subtype, q.operands, q.blankPosition]);

export function enumerateCandidates(typeId, round) {
  if (typeId === 'add_three_small') {
    const situation = round <= 5;
    const list = [];
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) if (a + b + c <= 9) {
      const subtype = situation ? `objects_${round}` : 'equation';
      list.push({ typeId, subtype, operands: [a, b, c], answer: a + b + c, visual: 'groups' });
    }
    return list;
  }
  if (typeId === 'subtract_three_small') {
    const situation = round <= 5;
    const list = [];
    for (let a = 3; a <= 9; a++) for (let b = 1; b <= 8; b++) for (let c = 1; c <= 8; c++) if (b + c <= a) {
      list.push({ typeId, subtype: situation ? `objects_${round}` : 'equation', operands: [a, b, c], answer: a - b - c, visual: 'take-away' });
    }
    return list;
  }
  if (typeId === 'make_ten') {
    const forms = ['a+blank=10', 'blank+a=10', '10=a+blank', '10=blank+a'];
    const form = round <= 8 ? forms[Math.floor((round - 1) / 2)] : round === 9 ? forms[0] : forms[1];
    const a = round >= 9 ? 0 : -1;
    return Array.from({ length: round >= 9 ? 1 : 9 }, (_, i) => {
      const n = a === 0 ? 0 : i + 1;
      return { typeId, subtype: form, operands: [n, 10 - n], answer: 10 - n, blankPosition: form.includes('blank') ? (form.startsWith('blank') || form.startsWith('10=blank') ? 0 : 1) : 1, visual: 'ten-frame' };
    });
  }
  if (typeId === 'subtract_from_ten') {
    if (round <= 5) return Array.from({ length: 9 }, (_, i) => ({ typeId, subtype: 'result_blank', operands: [10, i + 1], answer: 9 - i, blankPosition: 2, visual: 'ten-frame' }));
    return Array.from({ length: 9 }, (_, i) => ({ typeId, subtype: 'subtrahend_blank', operands: [10, i + 1], answer: i + 1, blankPosition: 1, visual: 'ten-frame' }));
  }
  const want = round <= 5 ? 'front' : 'back';
  const list = [];
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) {
    const values = [a, b, c], pairs = [[0, 1], [0, 2], [1, 2]].filter(([i, j]) => values[i] + values[j] === 10);
    if (!pairs.length || values.reduce((x, y) => x + y, 0) < 11 || values.reduce((x, y) => x + y, 0) > 19) continue;
    if (!pairs.some(([i, j]) => want === 'front' ? i === 0 && j === 1 : i === 1 && j === 2)) continue;
    list.push({ typeId, subtype: want, operands: values, answer: values.reduce((x, y) => x + y, 0), validPairs: pairs, visual: 'cards' });
  }
  return list;
}

const candidatePools = Array.from({ length: 10 }, (_, index) =>
  Object.fromEntries(GAME.types.map(typeId => [typeId, enumerateCandidates(typeId, index + 1)])));

export function buildSession(seed, versions = GAME) {
  const random = rng(seed), used = new Set(), questions = [];
  for (let round = 1; round <= 10; round++) for (const typeId of GAME.types) {
    const pool = candidatePools[round - 1][typeId], start = Math.floor(random() * pool.length);
    let chosen, key;
    for (let offset = 0; offset < pool.length; offset++) {
      const candidate = pool[(start + offset) % pool.length], candidateKey = signature(candidate);
      if (!used.has(candidateKey)) { chosen = candidate; key = candidateKey; break; }
    }
    if (!chosen) throw new Error(`No unique questions for ${typeId}, round ${round}`);
    const q = { ...chosen, id: `${round}-${typeId}`, round, index: questions.length, step: typeId === 'make_ten_then_add' ? 'pair' : 'answer', firstResponse: null, stepResults: [] };
    used.add(key); questions.push(q);
  }
  return { gameId: GAME.gameId, versions: { ...versions }, seed, sessionId: `mock-${Number(seed) >>> 0}`, mode: 'regular', status: 'playing', currentIndex: 0, questions, globalParticipation: true };
}

export function publicQuestion(item) {
  const [a, b, c] = item.operands;
  let operands = [...item.operands], prompt = '';
  if (item.typeId === 'make_ten') {
    operands = [a];
    prompt = item.subtype === 'a+blank=10' ? `${a} + □ = 10` : item.subtype === 'blank+a=10' ? `□ + ${a} = 10` : item.subtype === '10=a+blank' ? `10 = ${a} + □` : `10 = □ + ${a}`;
  } else if (item.typeId === 'subtract_from_ten') {
    if (item.subtype === 'result_blank') prompt = `10 − ${b} = □`;
    else { operands = [10, 10 - item.answer]; prompt = `10 − □ = ${10 - item.answer}`; }
  } else if (item.typeId === 'add_three_small') prompt = `${a} + ${b} + ${c} = □`;
  else if (item.typeId === 'subtract_three_small') prompt = `${a} − ${b} − ${c} = □`;
  else prompt = `${a} + ${b} + ${c} = ?`;
  return { questionId: item.id, index: item.index, typeId: item.typeId, subtype: item.subtype, prompt, operands, visual: item.visual, answerMode: item.typeId === 'make_ten_then_add' ? 'pair_then_number' : 'number', stepId: item.step };
}

export function normalizeNumber(value) {
  const text = String(value ?? '').trim().replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
  if (!/^\d{1,2}$/.test(text)) return null;
  return Number(text);
}

export function evaluateStep(item, response) {
  if (item.status === 'answered') return { accepted: false, reason: 'ALREADY_ANSWERED' };
  if (item.typeId === 'make_ten_then_add' && item.step === 'pair') {
    const pair = Array.isArray(response) ? [...new Set(response.map(Number))].sort((a, b) => a - b) : [];
    if (pair.length !== 2 || pair.some(n => n < 0 || n > 2)) return { accepted: false, reason: 'INVALID_PAIR' };
    const correct = item.validPairs.some(p => p[0] === pair[0] && p[1] === pair[1]);
    item.stepResults.push({ step: 'pair', correct, value: pair });
    item.firstResponse = { ...(item.firstResponse || {}), pair: { value: pair, correct } };
    item.selectedPair = pair;
    item.step = 'sum';
    return { accepted: true, correct, nextStep: 'sum', selectedPair: pair, final: false };
  }
  const value = normalizeNumber(response);
  if (value === null || value > 19) return { accepted: false, reason: 'INVALID_NUMBER' };
  const correct = value === item.answer;
  if (item.typeId === 'make_ten_then_add') {
    const pairCorrect = Boolean(item.firstResponse?.pair?.correct);
    item.stepResults.push({ step: 'sum', correct, value });
    item.firstResponse = { ...item.firstResponse, sum: { value, correct } };
    finalizeItem(item, correct && pairCorrect, 'answer', value);
    return { accepted: true, correct, pairCorrect, final: true, item };
  }
  finalizeItem(item, correct, 'answer', value);
  return { accepted: true, correct, final: true, item };
}

function finalizeItem(item, correct, kind, value) {
  item.status = 'answered'; item.firstResponse = { ...(item.firstResponse || {}), [kind]: value };
  item.firstCorrect = Boolean(correct); item.earnedPoints = correct ? 10 : 0; item.feedback = true;
}

export function skipQuestion(item) {
  if (item.status === 'answered') return false;
  item.status = 'answered'; item.firstCorrect = false; item.earnedPoints = 0; item.skipped = true; item.feedback = true;
  item.firstResponse = { ...(item.firstResponse || {}), skipped: true };
  return true;
}

export function summarize(session) {
  const counts = { correct: 0, wrong: 0, skipped: 0, unanswered: 0 };
  for (const q of session.questions) {
    if (q.status !== 'answered') counts.unanswered++;
    else if (q.skipped) counts.skipped++;
    else if (q.firstCorrect) counts.correct++;
    else counts.wrong++;
  }
  return { sessionId: session.sessionId, gameId: session.gameId, versions: session.versions, completion: session.status === 'complete' ? 'complete' : 'incomplete', score: counts.correct * 10, ...counts, stars: counts.correct, total: session.questions.length };
}

export function questionExplanation(q) {
  const [a, b, c] = q.operands;
  if (q.typeId === 'add_three_small') return `먼저 ${a}+${b}=${a + b}를 계산하고, ${c}를 더하면 ${q.answer}예요.`;
  if (q.typeId === 'subtract_three_small') return `${a}개에서 ${b}개를 빼면 ${a - b}개, 다시 ${c}개를 빼면 ${q.answer}개예요.`;
  if (q.typeId === 'make_ten') return a === 0 ? '0개에 10개를 더하면 10이에요.' : `${a}개를 채우려면 ${10 - a}개가 더 필요해요. 둘을 합치면 10이에요.`;
  if (q.typeId === 'subtract_from_ten') { const taken = q.subtype === 'result_blank' ? b : q.answer; const remain = q.subtype === 'result_blank' ? q.answer : 10 - q.answer; return `10개에서 ${taken}개를 빼면 ${remain}개가 남아요.`; }
  if (!q.firstResponse?.pair?.correct) return `10이 되는 카드 위치는 ${q.validPairs.map(p => `${p[0] + 1}번과 ${p[1] + 1}번`).join(' 또는 ')}예요. 세 수의 합은 ${q.answer}예요.`;
  return `먼저 10이 되는 두 카드를 묶어요. 남은 카드 ${q.operands.find((_, i) => !q.selectedPair.includes(i)) ?? c}개를 더하면 ${q.answer}예요.`;
}
