/**
 * Mini Brain capture bridge — lets thoughts arrive from outside the browser
 * (Telegram, OpenClaw, curl, anything that can POST JSON).
 *
 * Run:  npm run bridge
 * Env:  TELEGRAM_BOT_TOKEN  — optional; enables the Telegram bot (long polling)
 *       TELEGRAM_CHAT_ID    — optional; locks the bot to your chat id
 *
 * Endpoints (127.0.0.1:4820):
 *   POST /capture  {"text": "...", "via": "openclaw"}  → queue a thought
 *   GET  /pending                                       → queued thoughts
 *   POST /ack      {"ids": ["..."]}                     → remove imported ones
 *
 * The queue lives in server/inbox.json, so nothing is lost while the app is
 * closed. The Mini Brain web app polls /pending and imports into IndexedDB.
 * Node standard library only — no dependencies.
 */
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const PORT = 4820;
const QUEUE_FILE = fileURLToPath(new URL('./inbox.json', import.meta.url));
const STATE_FILE = fileURLToPath(new URL('./telegram-state.json', import.meta.url));

const load = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

let queue = load(QUEUE_FILE, []);
const saveQueue = () => writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

function enqueue(text, via) {
  const item = {
    id: randomUUID(),
    text: String(text).trim().slice(0, 2000),
    via,
    receivedAt: Date.now(),
  };
  queue.push(item);
  saveQueue();
  console.log(`[capture] queued via ${via}: ${item.text.slice(0, 60)}${item.text.length > 60 ? '…' : ''}`);
  return item;
}

// ---- HTTP API ----

const server = http.createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/pending') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(queue));
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      let data;
      try {
        data = JSON.parse(body || '{}');
      } catch {
        res.writeHead(400);
        return res.end('{"error":"bad json"}');
      }
      if (url.pathname === '/capture') {
        if (typeof data.text !== 'string' || !data.text.trim()) {
          res.writeHead(400);
          return res.end('{"error":"text required"}');
        }
        return res.end(JSON.stringify(enqueue(data.text, typeof data.via === 'string' ? data.via : 'api')));
      }
      if (url.pathname === '/ack') {
        const ids = new Set(Array.isArray(data.ids) ? data.ids : []);
        const before = queue.length;
        queue = queue.filter((i) => !ids.has(i.id));
        saveQueue();
        console.log(`[capture] acked ${before - queue.length}, ${queue.length} still queued`);
        return res.end('{"ok":true}');
      }
      res.writeHead(404);
      res.end('{"error":"not found"}');
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[capture] Mini Brain bridge on http://127.0.0.1:${PORT} — ${queue.length} queued`);
});

// ---- Telegram bot (optional, official Bot API via long polling) ----

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChat = process.env.TELEGRAM_CHAT_ID;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendTelegram(chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error('[telegram] send failed:', e?.message ?? e);
  }
}

async function pollTelegram() {
  const state = load(STATE_FILE, { offset: 0 });
  console.log('[telegram] bot polling started');
  for (;;) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?timeout=50&offset=${state.offset}`,
      );
      const data = await res.json();
      if (!data.ok) {
        console.error('[telegram] getUpdates error:', data.description ?? res.status);
        await sleep(5000);
        continue;
      }
      for (const update of data.result) {
        state.offset = update.update_id + 1;
        writeFileSync(STATE_FILE, JSON.stringify(state));
        const msg = update.message;
        if (!msg?.text) continue;
        const chatId = String(msg.chat.id);
        if (allowedChat && chatId !== allowedChat) {
          await sendTelegram(chatId, 'This brain belongs to someone else.');
          continue;
        }
        enqueue(msg.text, 'telegram');
        const lockHint = allowedChat
          ? ''
          : ` (Your chat id is ${chatId} — set TELEGRAM_CHAT_ID to lock this bot to you.)`;
        await sendTelegram(chatId, `Filed. ${queue.length} waiting for the brain to open.${lockHint}`);
      }
    } catch (e) {
      console.error('[telegram]', e?.message ?? e);
      await sleep(5000);
    }
  }
}

if (token) {
  void pollTelegram();
} else {
  console.log('[telegram] TELEGRAM_BOT_TOKEN not set — bot disabled (POST /capture still works)');
}
