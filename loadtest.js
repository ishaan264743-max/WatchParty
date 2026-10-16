// Usage: node loadtest.js [clients=10] [rounds=100]  (server must be running)
const WebSocket = require('ws'), N = +process.argv[2] || 10, R = +process.argv[3] || 100, URL = 'ws://localhost:3000';
const open = () => new Promise(r => { const w = new WebSocket(URL); w.on('open', () => r(w)); });
(async () => {
  const host = await open(); let room;
  host.send(JSON.stringify({ type: 'join', create: true, id: 'h', name: 'host' }));
  await new Promise(r => host.once('message', d => { room = JSON.parse(d).room; r(); }));
  const lat = []; let sent = 0, got = 0, pend;
  for (let i = 0; i < N - 1; i++) {
    const w = await open(); w.send(JSON.stringify({ type: 'join', room, id: 'c' + i, name: 'c' + i }));
    w.on('message', d => { const s = JSON.parse(d); if (s.type === 'state' && s.v === pend) { lat.push(performance.now() - sent); got++; } });
  }
  await new Promise(r => setTimeout(r, 300));
  host.on('message', d => { const s = JSON.parse(d); if (s.type === 'state') pend = pend === undefined ? undefined : pend; });
  for (let i = 0; i < R; i++) {
    pend = undefined;
    sent = performance.now();
    host.once('message', d => { pend = JSON.parse(d).v; });
    host.send(JSON.stringify({ type: i % 2 ? 'pause' : 'play', t: i }));
    await new Promise(r => setTimeout(r, 50));
  }
  lat.sort((a, b) => a - b);
  const p = q => lat[Math.floor(lat.length * q)].toFixed(2);
  console.log(`clients=${N} samples=${lat.length} p50=${p(.5)}ms p95=${p(.95)}ms max=${lat.at(-1).toFixed(2)}ms`);
  process.exit();
})();
