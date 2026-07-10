# Phone capture — Telegram & OpenClaw → Mini Brain

Thoughts can arrive from outside the browser through the **capture bridge**
(`server/capture.mjs`): a tiny dependency-free Node server on
`http://127.0.0.1:4820` that queues incoming thoughts to `server/inbox.json`.
The Mini Brain web app polls it every 15 s (and on window focus), categorizes
each thought, imports it into IndexedDB with dedupe, and shows a 📨 badge.
Nothing is lost while the app is closed — the queue is a file.

## Run the bridge

```powershell
npm run bridge
```

Keep it running alongside `npm run dev`. Without any env vars it still accepts
`POST /capture`, so anything local can push thoughts.

## Telegram (works today, official Bot API, free)

1. In Telegram, message **@BotFather** → `/newbot` → pick a name and username.
   BotFather replies with a bot token like `1234567890:AA...`.
2. Start the bridge with the token:

   ```powershell
   $env:TELEGRAM_BOT_TOKEN = "1234567890:AA..."
   npm run bridge
   ```

3. Message your bot any thought. It replies "Filed…" and includes **your chat
   id** the first time.
4. Lock the bot to yourself (recommended — otherwise anyone who finds the bot
   can fill your brain):

   ```powershell
   $env:TELEGRAM_BOT_TOKEN = "1234567890:AA..."
   $env:TELEGRAM_CHAT_ID = "<your chat id>"
   npm run bridge
   ```

Open Mini Brain and the queued thoughts flow in within ~15 seconds.

## OpenClaw / WhatsApp (same door, later)

The bridge is intentionally generic — anything that can POST JSON can capture:

```bash
curl -X POST http://127.0.0.1:4820/capture \
  -H "content-type: application/json" \
  -d '{"text": "idea: trionda slow-mo short", "via": "openclaw"}'
```

For OpenClaw, give its agent a skill/instruction along these lines (adjust to
your OpenClaw setup — the only contract is the POST above):

```markdown
## mini-brain-capture
When the user sends a message that is a thought, idea, or task to remember
(or prefixes a message with "brain:"), capture it by running:
curl -s -X POST http://127.0.0.1:4820/capture -H "content-type: application/json" \
  -d '{"text": "<the thought text>", "via": "openclaw"}'
Confirm with one short sentence. Do not capture questions addressed to you.
```

Because OpenClaw connects to WhatsApp, this gives WhatsApp → Mini Brain without
Mini Brain knowing anything about WhatsApp.

## Bridge API

| Endpoint | Body | Effect |
|---|---|---|
| `POST /capture` | `{"text": "...", "via": "telegram\|openclaw\|api"}` | Queue a thought |
| `GET /pending` | — | List queued thoughts |
| `POST /ack` | `{"ids": ["..."]}` | Remove imported thoughts |

The bridge binds to `127.0.0.1` only — nothing on your network can reach it.
Telegram messages arrive via outbound long-polling (no ports opened).
