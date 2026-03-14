const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;

// ─── Timer State ────────────────────────────────────────────────────────────
const state = {
  mode: 'study',
  study: { label: 'Study Session', duration: 25 * 60, remaining: 25 * 60, running: false },
  break: { label: 'Break Time',   duration:  5 * 60, remaining:  5 * 60, running: false },
  focusCount: 0,
  focusTotal: 5,
  forestCode: '',
  notifEnabled: true,
  notifSound: 'notification.mp3',
};

let timerInterval = null;

function current() { return state[state.mode]; }

function getSnapshot() {
  return {
    mode: state.mode,
    study: { ...state.study },
    break: { ...state.break },
    focusCount: state.focusCount,
    focusTotal: state.focusTotal,
    forestCode: state.forestCode,
    notifEnabled: state.notifEnabled,
    notifSound: state.notifSound,
  };
}

function broadcast(type, extra = {}) {
  const msg = JSON.stringify({ type, ...getSnapshot(), ...extra });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function stopInterval() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function tick() {
  const t = current();
  if (t.remaining > 0) {
    t.remaining--;
    broadcast('state');
  } else {
    stopInterval();
    t.running = false;
    if (state.mode === 'study') {
      state.focusCount = Math.min(state.focusCount + 1, state.focusTotal);
    }
    broadcast('finished');
    console.log(`[${state.mode.toUpperCase()}] timer finished`);
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────
const commands = {
  start() {
    const t = current();
    if (t.remaining <= 0) return { error: 'Timer is at 0. Reset first.' };
    if (t.running) return { error: 'Already running.' };
    stopInterval();
    t.running = true;
    timerInterval = setInterval(tick, 1000);
    broadcast('state');
    return { ok: `Started ${state.mode} timer.` };
  },

  pause() {
    if (!current().running) return { error: 'Not running.' };
    stopInterval();
    current().running = false;
    broadcast('state');
    return { ok: 'Paused.' };
  },

  reset() {
    stopInterval();
    const t = current();
    t.running = false;
    t.remaining = t.duration;
    broadcast('state');
    return { ok: `Reset ${state.mode} timer to ${formatTime(t.duration)}.` };
  },

  switch(mode) {
    stopInterval();
    current().running = false;
    state.mode = mode || (state.mode === 'study' ? 'break' : 'study');
    broadcast('state');
    return { ok: `Switched to ${state.mode}.` };
  },

  setTime(mode, seconds) {
    if (seconds < 1 || seconds > 24 * 3600) return { error: 'Invalid time.' };
    const t = state[mode];
    stopInterval();
    t.running = false;
    t.duration = seconds;
    t.remaining = seconds;
    broadcast('state');
    return { ok: `${mode} timer set to ${formatTime(seconds)}.` };
  },

  addTime(seconds) {
    const t = current();
    t.remaining = Math.min(t.remaining + seconds, 24 * 3600);
    t.duration  = Math.max(t.duration, t.remaining);
    broadcast('state');
    return { ok: `Added ${formatTime(Math.abs(seconds))} to ${state.mode} timer.` };
  },

  setLabel(mode, label) {
    state[mode].label = label.slice(0, 40);
    broadcast('state');
    return { ok: `Label updated.` };
  },
};

// ─── Parse chat commands ──────────────────────────────────────────────────────
function parseSeconds(str) {
  if (!str) return null;
  if (str.includes(':')) {
    const [m, s] = str.split(':').map(Number);
    return m * 60 + (s || 0);
  }
  return parseFloat(str) * 60;
}

function handleChatCommand(raw) {
  const parts = raw.trim().replace(/^!/, '').split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const args  = parts.slice(1);

  switch (cmd) {
    case 'start':  return commands.start();
    case 'pause':
    case 'stop':   return commands.pause();
    case 'reset':  return commands.reset();

    case 'switch':
      return commands.switch(args[0] === 'study' || args[0] === 'break' ? args[0] : null);

    case 'study': {
      if (state.mode !== 'study') commands.switch('study');
      if (args[0]) {
        const s = parseSeconds(args[0]);
        if (s) return commands.setTime('study', Math.round(s));
      }
      return { ok: 'Switched to study mode.' };
    }

    case 'break': {
      if (state.mode !== 'break') commands.switch('break');
      if (args[0]) {
        const s = parseSeconds(args[0]);
        if (s) return commands.setTime('break', Math.round(s));
      }
      return { ok: 'Switched to break mode.' };
    }

    case 'time':
    case 'set': {
      const s = parseSeconds(args[0]);
      if (!s) return { error: 'Usage: !time MM:SS or !time <minutes>' };
      return commands.setTime(state.mode, Math.round(s));
    }

    case 'add': {
      const s = parseSeconds(args[0]);
      if (!s) return { error: 'Usage: !add <minutes>' };
      return commands.addTime(Math.round(s));
    }

    case 'label': {
      const label = args.join(' ');
      if (!label) return { error: 'Usage: !label <text>' };
      return commands.setLabel(state.mode, label);
    }

    case 'studylabel': {
      const label = args.join(' ');
      return commands.setLabel('study', label || 'Study Session');
    }

    case 'breaklabel': {
      const label = args.join(' ');
      return commands.setLabel('break', label || 'Break Time');
    }

    case 'notify': {
      const val = args[0]?.toLowerCase();
      if (val === 'on') state.notifEnabled = true;
      else if (val === 'off') state.notifEnabled = false;
      else state.notifEnabled = !state.notifEnabled;
      broadcast('state');
      return { ok: `Notification sound ${state.notifEnabled ? 'enabled' : 'disabled'}.` };
    }

    case 'notifysound': {
      const file = args[0];
      if (!file) return { error: 'Usage: !notifysound <filename.mp3>' };
      state.notifSound = file;
      broadcast('state');
      return { ok: `Notification sound set to ${file}.` };
    }

    case 'forestcode': {
      state.forestCode = args[0] ? args[0].toUpperCase().slice(0, 12) : '';
      broadcast('state');
      return { ok: state.forestCode ? `Forest code set to ${state.forestCode}.` : 'Forest code cleared.' };
    }

    case 'pomodoros': {
      const total = parseInt(args[0]);
      if (!total || total < 1 || total > 99) return { error: 'Usage: !pomodoros <1-99>' };
      state.focusTotal = total;
      state.focusCount = Math.min(state.focusCount, total);
      broadcast('state');
      return { ok: `Focus goal set to ${total}.` };
    }

    case 'resetfocus': {
      state.focusCount = 0;
      broadcast('state');
      return { ok: 'Focus count reset to 0.' };
    }

    case 'setfocus': {
      const n = parseInt(args[0]);
      if (isNaN(n) || n < 0 || n > 99) return { error: 'Usage: !setfocus <0-99>' };
      state.focusCount = Math.min(n, state.focusTotal);
      broadcast('state');
      return { ok: `Focus count set to ${state.focusCount}.` };
    }

    case 'help':
      return {
        ok: [
          '!start · !pause · !reset · !switch',
          '!study [min] · !break [min]',
          '!time MM:SS · !add <min>',
          '!label <text> · !studylabel · !breaklabel',
          '!forestcode <CODE> · !pomodoros <N> · !resetfocus',
        ].join('\n'),
      };

    default:
      return { error: `Unknown command: !${cmd}. Try !help` };
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = req.url === '/' ? '/control.html' : req.url;
  const filePath = path.join(__dirname, 'public', url);

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'state', ...getSnapshot() }));
  console.log(`[WS] client connected (${clients.size} total)`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'command') {
        const result = handleChatCommand(msg.text);
        ws.send(JSON.stringify({ type: 'commandResult', input: msg.text, ...result }));
      }
    } catch (e) {
      console.error('[WS] bad message:', e.message);
    }
  });

  ws.on('close', () => { clients.delete(ws); console.log(`[WS] client left (${clients.size} total)`); });
  ws.on('error', (e) => console.error('[WS] error:', e.message));
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔════════════════════════════════════╗');
  console.log('  ║   YouTube Timer Overlay — Ready    ║');
  console.log('  ╠════════════════════════════════════╣');
  console.log(`  ║  Control panel → http://localhost:${PORT}             ║`);
  console.log(`  ║  OBS overlay   → http://localhost:${PORT}/overlay.html ║`);
  console.log('  ╚════════════════════════════════════╝');
  console.log('');
});
