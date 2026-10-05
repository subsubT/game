import { createHmac } from 'node:crypto';
import { summarize } from '../../src/games/1math3/core.js';
import { ApiError } from './error.js';

export const literal = value => { const s = String(value ?? ''); return /^[\s\u0000-\u001f]*[=+@-]/.test(s) ? `'${s}` : s; };
const types = { make_ten: '10 만들기', subtract_from_ten: '10에서 빼기', add_three_small: '세 수 덧셈', subtract_three_small: '세 수 뺄셈', make_ten_then_add: '10 만들고 더하기' };
function prompt(q) {
  const [a,b,c] = q.operands;
  if (q.typeId === 'make_ten') return ({ 'a+blank=10': `${a}+□=10`, 'blank+a=10': `□+${a}=10`, '10=a+blank': `10=${a}+□`, '10=blank+a': `10=□+${a}` })[q.subtype];
  if (q.typeId === 'subtract_from_ten') return q.subtype === 'result_blank' ? `10−${b}=□` : `10−□=${10-q.answer}`;
  return `${a}${q.typeId === 'subtract_three_small' ? '−' : '+'}${b}${q.typeId === 'subtract_three_small' ? '−' : '+'}${c}=□`;
}
export async function buildTables(db, classId, classLabel, secret) {
  const [students, sessions] = await Promise.all([db.collection(`classes/${classId}/students`).limit(200).get(), db.collection(`classes/${classId}/sessions`).limit(200).get()]);
  // Fail before changing the file rather than silently exporting truncated history.
  if (students.size === 200 || sessions.size === 200) throw new ApiError('EXPORT_LIMIT');
  const aliases = new Map(students.docs.map(d => [d.id, d.data().classAlias]));
  const complete = sessions.docs.map(d => ({ ...d.data(), id: d.id })).filter(s => s.status === 'complete' && s.mode === 'regular' && aliases.has(s.studentId)).sort((a,b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
  const tables = {
    '안내': [['항목','내용'],['학급',literal(classLabel)],['자료','확정된 정규 완료 회차만 포함합니다.'],['동기화','앱이 관리하는 네 탭은 동기화 때 다시 작성됩니다. 개인 메모는 별도 탭에 보관하세요.'],['원장','이 문서 수정은 게임 점수·정답·순위·권한에 반영되지 않습니다.'],['개인정보','학급 별명만 사용합니다. 앱 연결 해제 후에도 Drive 문서는 남습니다.'],['내보내기 버전',1]],
    '학생요약': [['게임','학생 표시 이름','최고점','최근 점수','완료 횟수','최근 수행일(KST)','최초 정답률(%, 건너뜀 제외)']],
    '회차': [['게임','회차 식별','학생 표시 이름','점수','정답','오답','건너뜀','완료 상태','시작(KST)','종료(KST)','내보내기 버전']],
    '문항': [['게임','회차 식별','문제 번호','유형','문제','최초 응답','정답','정오','건너뜀','행 식별','내보내기 버전']]
  };
  const groups = new Map();
  const time = iso => iso ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso)) : '';
  for (const session of complete) {
    const s = { ...session, questions: session.questions || JSON.parse(session.questionsJson) }, result = summarize(s);
    const alias = literal(aliases.get(s.studentId)), key = `${s.gameId}:${s.studentId}`;
    const publicId = createHmac('sha256', secret).update(`sheet:v1:${classId}:${s.gameId}:${s.id}`).digest('hex').slice(0,24);
    const group = groups.get(key) || { game: s.gameId, alias, best: 0, count: 0, correct: 0, total: 0 };
    Object.assign(group, { best: Math.max(group.best,result.score), latest: result.score, count: group.count+1, correct: group.correct+result.correct, total: group.total+result.correct+result.wrong, at: time(s.finishedAt) }); groups.set(key,group);
    tables['회차'].push([literal(s.gameId),publicId,alias,result.score,result.correct,result.wrong,result.skipped,'완료',time(s.startedAt),time(s.finishedAt),1]);
    for (const q of s.questions) {
      const response = q.skipped ? '건너뜀' : q.typeId === 'make_ten_then_add' ? `카드: ${(q.firstResponse?.pair?.value || []).map(i=>`${i+1}번(${q.operands[i]})`).join(', ')} / 합: ${q.firstResponse?.sum?.value ?? '미입력'}` : q.firstResponse?.answer ?? '';
      tables['문항'].push([literal(s.gameId),publicId,q.index+1,types[q.typeId]||literal(q.typeId),literal(prompt(q)),literal(response),q.answer,q.skipped?'건너뜀':q.firstCorrect?'정답':'오답',q.skipped?'예':'아니오',`${publicId}:${q.index}:1`,1]);
    }
  }
  for (const g of groups.values()) tables['학생요약'].push([literal(g.game),g.alias,g.best,g.latest,g.count,g.at,g.total?Math.round(g.correct/g.total*1000)/10:'응답 없음']);
  return tables;
}
