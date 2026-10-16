const express = require('express'), http = require('http'), { WebSocketServer } = require('ws');
const B = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';
const MOVIES = [
  ['bbb','Big Buck Bunny','Animation',8.0,2008,'BigBuckBunny.mp4'],
  ['ed','Elephants Dream','Sci-Fi',6.5,2006,'ElephantsDream.mp4'],
  ['sintel','Sintel','Fantasy',7.5,2010,'Sintel.mp4'],
  ['tos','Tears of Steel','Sci-Fi',7.0,2012,'TearsOfSteel.mp4'],
  ['fbb','For Bigger Blazes','Action',6.0,2013,'ForBiggerBlazes.mp4'],
  ['fbe','For Bigger Escapes','Adventure',6.2,2013,'ForBiggerEscapes.mp4'],
  ['sub','Subaru Outback On Street And Dirt','Documentary',5.8,2013,'SubaruOutbackOnStreetAndDirt.mp4'],
  ['bull','We Are Going On Bullrun','Documentary',5.5,2013,'WeAreGoingOnBullrun.mp4'],
].map(([id, title, cat, rating, year, f]) => ({ id, title, cat, rating, year, src: B + f }));

const app = express(); app.use(express.static('public'));
app.get('/api/movies', (_, res) => res.json(MOVIES));
const server = http.createServer(app), wss = new WebSocketServer({ server });
const rooms = new Map(), GRACE = 15000;
const cur = r => r.playing ? r.time + (Date.now() - r.at) / 1000 : r.time;
const send = (ws, o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));
const bcast = (r, o) => r.m.forEach(u => send(u.ws, o));
const snap = r => ({ type: 'state', room: r.code, host: r.host, movie: r.movie, playing: r.playing, time: cur(r), v: r.v,
  playlist: r.playlist, poll: r.poll, members: [...r.m].map(([id, u]) => ({ id, name: u.name, online: !!u.ws })) });
const push = r => { r.v++; bcast(r, snap(r)); };
const code = () => { let c; do c = Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms.has(c)); return c; };
const setMovie = (r, mv, play) => { r.movie = mv; r.time = 0; r.at = Date.now(); r.playing = play; };

wss.on('connection', ws => {
  let r, id;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'ping') return send(ws, { type: 'pong', ts: m.ts });
    if (m.type === 'join') {
      const c = m.create ? code() : String(m.room || '').toUpperCase();
      if (m.create) rooms.set(c, { code: c, host: m.id, m: new Map(), movie: null, playing: false, time: 0, at: Date.now(), playlist: [], poll: null, v: 0 });
      r = rooms.get(c);
      if (!r) return send(ws, { type: 'error', msg: 'Room not found' });
      id = m.id;
      let u = r.m.get(id);                       // reconnect re-attaches the same member
      if (u) { clearTimeout(u.t); u.ws = ws; }
      else if (r.m.size >= 50) return send(ws, { type: 'error', msg: 'Room full' });
      else r.m.set(id, { name: String(m.name || 'Guest').slice(0, 20), ws });
      return push(r);                            // late joiners get live-computed time
    }
    if (!r) return;
    const name = r.m.get(id)?.name;
    switch (m.type) {
      case 'play': r.playing = true; r.time = +m.t || 0; r.at = Date.now(); push(r); break;
      case 'pause': r.playing = false; r.time = +m.t || 0; r.at = Date.now(); push(r); break;
      case 'seek': r.time = +m.t || 0; r.at = Date.now(); push(r); break;
      case 'load': { const mv = MOVIES.find(x => x.id === m.movieId); if (mv) { setMovie(r, mv, true); push(r); } break; }
      case 'queueAdd': { const mv = MOVIES.find(x => x.id === m.movieId); if (mv) { r.playlist.push({ ...mv, by: name }); push(r); } break; }
      case 'queueRemove': r.playlist.splice(m.i, 1); push(r); break;
      case 'ended':                              // dedupe: only first 'ended' for this movie advances
        if (r.movie && r.movie.id === m.movieId) { const n = r.playlist.shift(); n ? setMovie(r, n, true) : (r.playing = false); push(r); } break;
      case 'chat': bcast(r, { type: 'chat', name, text: String(m.text).slice(0, 300), ts: Date.now() }); break;
      case 'react': bcast(r, { type: 'react', name, emoji: String(m.emoji).slice(0, 4) }); break;
      case 'pollStart': r.poll = { q: String(m.q).slice(0, 100), opts: m.opts.slice(0, 6).map(String), votes: {} }; push(r); break;
      case 'vote': if (r.poll && m.i >= 0 && m.i < r.poll.opts.length) { r.poll.votes[id] = m.i; push(r); } break;
      case 'pollClose': r.poll = null; push(r); break;
      case 'transfer': if (r.host === id && r.m.has(m.to)) { r.host = m.to; push(r); } break;
    }
  });
  ws.on('close', () => {
    const u = r?.m.get(id); if (!u || u.ws !== ws) return;
    u.ws = null;
    u.t = setTimeout(() => {                     // grace period for reconnects
      r.m.delete(id);
      if (!r.m.size) return rooms.delete(r.code);
      if (r.host === id) r.host = r.m.keys().next().value;  // auto host transfer
      push(r);
    }, GRACE);
    push(r);
  });
});
setInterval(() => rooms.forEach(r => r.playing && bcast(r, snap(r))), 5000); // periodic re-anchor for drift correction
server.listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
