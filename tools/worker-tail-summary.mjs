// Pipe `wrangler tail math3-cp3-dev --format json` here. Prints aggregate only.
const summary = new Map();
let buffer = '', depth = 0, quoted = false, escaped = false, count = 0;
const report = () => {
  console.log('Worker tail summary', JSON.stringify(Object.fromEntries([...summary].map(([name, x]) => [name, {
    requests: x.requests, cpuMeanMs: +(x.cpu / x.requests).toFixed(2), cpuMaxMs: x.cpuMax,
    wallMeanMs: +(x.wall / x.requests).toFixed(1), subrequestsMean: +(x.subrequests / x.requests).toFixed(2),
    subrequestsMax: x.subrequestsMax, firestoreMean: +(x.firestore / x.requests).toFixed(2),
    errors: x.errors
  }]))));
};
for await (const chunk of process.stdin) {
  for (const c of chunk.toString()) {
    if (!buffer && c !== '{') continue;
    buffer += c;
    if (escaped) { escaped = false; continue; }
    if (quoted && c === '\\') { escaped = true; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (!quoted && c === '{') depth++;
    if (!quoted && c === '}') depth--;
    if (depth !== 0) continue;
    try {
      const event = JSON.parse(buffer);
      const name = new URL(event.event?.request?.url || 'https://invalid/').pathname.slice(5);
      const log = event.logs?.find(row => row.message?.[0] === 'Worker subrequests');
      const metrics = log?.message?.[1] || {};
      const x = summary.get(name) || { requests: 0, cpu: 0, cpuMax: 0, wall: 0, subrequests: 0, subrequestsMax: 0, firestore: 0, errors: 0 };
      const total = (metrics.cert || 0) + (metrics.oauth || 0) + (metrics.firestore || 0) + (metrics.other || 0);
      x.requests++; x.cpu += event.cpuTime || 0; x.cpuMax = Math.max(x.cpuMax, event.cpuTime || 0);
      x.wall += event.wallTime || 0; x.subrequests += total; x.subrequestsMax = Math.max(x.subrequestsMax, total);
      x.firestore += metrics.firestore || 0; x.errors += Number((event.event?.response?.status || 0) >= 400);
      summary.set(name, x);
      if (++count % 25 === 0) report();
    } catch { /* Wrangler may include non-JSON status output. */ }
    buffer = '';
  }
}
report();
