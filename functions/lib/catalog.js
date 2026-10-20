// One registration point for the student portal. New games keep the same
// student authentication and management APIs and provide their own entry page.
export const GAME_CATALOG = Object.freeze([
  Object.freeze({ gameId: '1math3', title: '덧셈과 뺄셈(1)', entryPath: '1math3.html', description: '50문항을 배우고 10분 최종 스테이지에 도전해요', totalQuestions: 50 }),
  Object.freeze({ gameId: '1math2', title: '100까지의 수', entryPath: '1math2.html', description: '100까지 수를 탐험해요', standalone: true })
]);
