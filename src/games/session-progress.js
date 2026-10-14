export function defaultProgressUI(s) {
  const current = s.questions[s.currentIndex], feedback = s.questions[s.feedbackIndex];
  const view = feedback?.status === 'answered' ? 'feedback' : current?.step === 'sum' ? 'pairFeedback' : 'playing';
  return { view, questionId: view === 'feedback' ? feedback.id : current?.id || null, draft: '', selected: [] };
}
export function checkedProgressUI(s, value) {
  const invalid = () => { throw new Error('INVALID_PROGRESS'); };
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['view','questionId','draft','selected'].includes(k))) invalid();
  const {view,questionId,draft,selected} = value, current = s.questions[s.currentIndex], feedback = s.questions[s.feedbackIndex];
  if (!['playing','feedback','pairFeedback'].includes(view) || typeof draft !== 'string' || !/^[0-9]{0,2}$/.test(draft) || !Array.isArray(selected) || selected.length > 2 || new Set(selected).size !== selected.length || selected.some(n => !Number.isInteger(n) || n < 0 || n > 2)) invalid();
  if (view === 'feedback') { if (!feedback || feedback.status !== 'answered' || questionId !== feedback.id || draft || selected.length) invalid(); }
  else if (!current || questionId !== current.id || (view === 'pairFeedback' && current.step !== 'sum')) invalid();
  if (selected.length && (view !== 'playing' || current?.typeId !== 'make_ten_then_add' || current.step !== 'pair')) invalid();
  if (draft && current?.step === 'pair') invalid();
  return { view, questionId, draft, selected: [...selected] };
}
