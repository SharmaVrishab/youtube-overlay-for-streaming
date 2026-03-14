# YouTube Timer Overlay

A real-time study/break timer overlay for YouTube streams and OBS, controlled via a chat-style command panel.

![Overlay Preview](https://img.shields.io/badge/OBS-Browser%20Source-orange) ![Node.js](https://img.shields.io/badge/Node.js-WebSocket-green)

## Features

- Warm card overlay designed for OBS browser source
- Study / break timer with live countdown
- Focus session counter (e.g. 2/5)
- Forest app room code display
- Current session label (updates live)
- "Next break" label shown on overlay
- Chat-style control panel — type commands like Twitch chat
- WebSocket — overlay updates instantly, no refresh needed

## Overlay Preview

```
┌─────────────────────────┐
│        25:00            │
│     Study Session       │
│   Focus - 2/5           │
│  🌳 5AFB8YHSG           │
│  Next break: Coffee     │
└─────────────────────────┘
```

## Setup

### Local

```bash
npm install
npm start
```

- Control panel → http://localhost:3001
- OBS overlay → http://localhost:3001/overlay.html

### Deploy (Railway)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select this repo — Railway auto-detects Node.js and runs `npm start`
4. Use the Railway public URL as your OBS browser source

## OBS Setup

1. In OBS, add a **Browser Source**
2. Set the URL to `https://your-railway-url.up.railway.app/overlay.html`
3. Width: `320` Height: `250`
4. Check **Refresh browser when scene becomes active**

## Commands

Type these in the control panel chat (with or without `!`):

| Command | Description |
|---|---|
| `!start` | Start the current timer |
| `!pause` | Pause the timer |
| `!reset` | Reset timer to full duration |
| `!switch` | Toggle between study and break |
| `!study [min]` | Switch to study mode (optionally set duration) |
| `!break [min]` | Switch to break mode (optionally set duration) |
| `!time MM:SS` | Set timer to specific time |
| `!add <min>` | Add minutes to current timer |
| `!studylabel <text>` | Set the study session label |
| `!breaklabel <text>` | Set the break label shown on overlay |
| `!forestcode <CODE>` | Set the Forest app room code |
| `!pomodoros <N>` | Set the focus session goal (e.g. 5) |
| `!setfocus <N>` | Manually set the current focus count |
| `!resetfocus` | Reset focus count to 0 |
| `!help` | Show all commands |

## Stack

- Node.js + `ws` (WebSocket server)
- Vanilla HTML/CSS/JS (no framework)
- Google Fonts: Space Mono, Poppins
