# 🎬 Watch Party
Real-time watch-party app (Node.js + WebSocket, vanilla JS client).

## Run
```
npm install
npm start          # http://localhost:3000
npm run loadtest   # measures propagation latency with 10 clients
```
Open two browser tabs, create a room in one, join with the code or `?room=CODE` link in the other.

## Features
Rooms (code / invite link) · synced play/pause/seek · categories, rating filter, fuzzy search · emoji reactions · live chat · shared playlist (auto-advance) · group polls · host transfer (manual + auto on host leave) · drift detection/correction · late join & reconnect handling.

## Design
- **Server is the source of truth.** Room state = `{movie, playing, time, at}`; current time is computed as `time + (now-at)` so late joiners land on the exact live position.
- **Concurrency:** all actions are serialised by the single Node event loop and broadcast as a full state snapshot with a version counter (last-write-wins, same order for everyone). `ended` is deduped by movie id so simultaneous end events advance the playlist only once.
- **Drift correction:** client compares `video.currentTime` against the expected time every 1s. 80–500 ms drift → playbackRate 0.95/1.05 (smooth); >500 ms → hard seek. Server re-broadcasts state every 5s to re-anchor. Programmatic changes are muted for 600 ms so they don't echo back.
- **Reconnects:** client has a persistent id (localStorage), auto-reconnects every 1s and re-attaches to the same member; server keeps the member for 15s grace before removing it.

## Latency measurements
Run `npm run loadtest`, then paste your results here:
| Clients | Samples | p50 | p95 | Conditions |
|---|---|---|---|---|
| 10 | | | | localhost, your machine specs |

Failure handling tested: close a tab and reopen (reconnect), kill/restart server (clients retry), join mid-playback (late join), two people pressing play/pause at once.
