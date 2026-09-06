# worker/ — the AI proxy

This folder is the one server-side part of the site: a small program that
runs on Cloudflare's network. When a student's Python calls
`call_gpt("...")`, the browser sends the question here; this program checks
the class code and the limits, asks the AI provider, and sends the answer
back. The provider's API key lives only here, as a secret. The browser
never sees it.

You deploy it once, from your Mac, in about fifteen minutes. After that
you only come back to change the class code.

```
worker/
  worker.js       the program (edit SYSTEM_PROMPT at the top to change how the AI answers)
  wrangler.toml   settings: allowed origins, provider, model, limits
  README.md       this file
```

## What it does

| check | result |
|---|---|
| request is not from your site's address (or localhost) | 403 |
| class code wrong | 403 — *"That class code is not right. Check the code on the board."* |
| prompt empty or over 500 characters | 400 with a sentence saying so |
| a browser sends more than 20 requests in a minute, or 200 in a day | 429 with a sentence saying so |
| the AI provider says it is busy (rate-limited) | retries 3 times over ~5 s, then *"Lots of people are asking at once. Wait a few seconds and run it again."* |
| anything else goes wrong | *"The AI service did not answer. Check your class code, or try again in a minute."* |

Limits are counted **per browser**, not per IP address: a computer room
shares one IP, so a per-IP limit would lock out the whole class after 20
requests. Each page tab makes a random client id and the Worker counts
against that. The IP is used only if a request arrives with no id.

Counting uses Cloudflare KV (a tiny database): one write per request. The
free plan allows **1,000 KV writes a day**, so the whole site can make at
most about 1,000 AI calls a day. For a class of 20 doing three tasks that
is plenty, and it is a hard ceiling on cost.

## Costs and limits (checked 6 September 2026 — they change; re-check before week 9)

**Cloudflare Workers, free plan:** 100,000 requests a day, KV 100,000
reads and 1,000 writes a day. No card needed. Nothing here can create a
bill on the free plan.

**AI provider — default is Groq** (`PROVIDER = "groq"`, model
`openai/gpt-oss-20b`):

- Sign up at https://console.groq.com — no card needed for the free tier.
- Free-tier limits for that model on the day of writing: **30 requests per
  minute, 1,000 requests per day, 8,000 tokens per minute.** Each call from
  this Worker uses roughly 350–450 tokens (system prompt + question +
  answer), so in practice the free tier allows about **17 calls a minute**
  before the provider starts saying "busy". With 20 students that *will*
  happen when everyone presses Run at once; the Worker retries and then
  gives the friendly message. Plan the lesson in two halves.
- Current limits: https://console.groq.com/docs/rate-limits and, for your
  own account, Settings → Limits in the console.
- Spending cap: there is nothing to spend on the free tier. If you ever
  add a card, set a monthly limit in Settings → Billing before doing so.

**Alternatives** (change `PROVIDER` and `MODEL` in `wrangler.toml`, set the
matching `API_KEY`, redeploy):

- `gemini` — Google AI Studio, https://aistudio.google.com. Free tier, no
  card. Its limits are shown only after you sign in (AI Studio → Rate
  limits); flash-lite models have typically had ~15 requests per minute,
  which is tighter than Groq for a whole class. Model name goes in `MODEL`,
  for example `gemini-2.5-flash-lite`.
- `openai-compatible` — any service using the OpenAI chat format (OpenAI,
  Mistral, Cerebras, Together…). Put its base URL in `API_BASE_URL` (for
  OpenAI: `https://api.openai.com/v1`) and the model name in `MODEL`. These
  are usually paid: set a **hard monthly spending limit** in the provider's
  billing page *before* you create the key. A class of 20 doing all three
  tasks uses well under £1 on a small model.

## Deploying — step by step

You need: a free Cloudflare account, a free Groq account, and Node.js on
your Mac (you have it if `node --version` prints a number in Terminal; if
not, install it from https://nodejs.org).

### 1. Accounts

1. Create a Cloudflare account at https://dash.cloudflare.com/sign-up
   (free plan; no card).
2. Create a Groq account at https://console.groq.com. Go to **API Keys →
   Create API Key**, name it `asf-practice-hub`, and copy the key — it
   starts with `gsk_` and is shown once. Keep it somewhere safe for the
   next five minutes.

### 2. Install the Cloudflare tool and log in

In Terminal:

```bash
cd ~/projects/tech-group-my/worker
npm install -g wrangler
wrangler login
```

A browser window opens; click **Allow**. Terminal says you are logged in.

### 3. Check the settings file

Open `wrangler.toml`. `ALLOWED_ORIGINS` must contain your site's address
exactly as it appears in the browser, without a path or trailing slash:
`https://monikapietruch-uob.github.io`. It already does; change it only if
the site moves.

### 4. Create the KV namespace (the counter storage)

```bash
wrangler kv namespace create RATE_LIMITS
```

It prints a few lines including `id = "…"`. Copy that id into
`wrangler.toml` in place of `PASTE_YOUR_KV_NAMESPACE_ID_HERE`.

### 5. Set the two secrets

```bash
wrangler secret put API_KEY
```

Paste the Groq key when asked (nothing shows while you paste), press Enter.

```bash
wrangler secret put CLASS_CODE
```

Type the class code you will write on the board, for example `tiger42`,
press Enter. Letters and numbers, no spaces. You can change it any time by
running this command again.

### 6. Deploy

```bash
wrangler deploy
```

The last line is the Worker's address, something like
`https://asf-ai-proxy.<your-name>.workers.dev`. Copy it.

### 7. Tell the site where the Worker is

Open `js/ai-config.js` in the repo and paste the address between the
quotes:

```js
var AI_PROXY_URL = "https://asf-ai-proxy.<your-name>.workers.dev";
```

Commit and push. (This address is not secret — the key is on Cloudflare,
not in the address.)

### 8. Test

Open the site's **AI task** page, type the class code, press **Test the
connection**. You should see an answer within a few seconds. If you see
*"This page is not allowed to use the AI service"*, the address in
`ALLOWED_ORIGINS` does not match the address in the browser's bar.

## Day to day

- **New class code:** `wrangler secret put CLASS_CODE` in the `worker`
  folder, type the new one. Takes effect in seconds.
- **Change how the AI answers:** edit `SYSTEM_PROMPT` at the top of
  `worker.js`, then `wrangler deploy`.
- **Change the caps:** edit `wrangler.toml` (`MAX_TOKENS`, `PER_MINUTE`,
  `PER_DAY`, `MAX_PROMPT_CHARS`), then `wrangler deploy`.
- **See what is happening during a lesson:** `wrangler tail` in Terminal
  prints each request as it arrives (no prompts are logged, only errors).
- **Turn it off after week 9:** on https://dash.cloudflare.com → Workers &
  Pages → asf-ai-proxy → Settings → Delete, or just change the class code.

## If something goes wrong

| message on the page | likely cause |
|---|---|
| The AI service is not set up on this site yet | `js/ai-config.js` is empty or not pushed |
| That class code is not right | typo, or the secret was set with different letters |
| This page is not allowed to use the AI service | `ALLOWED_ORIGINS` in `wrangler.toml` does not match the site address; redeploy after fixing |
| Lots of people are asking at once | the provider's per-minute limit; wait, or split the class |
| The AI service did not answer | the API key is wrong or expired, the provider is down, or the network blocks `*.workers.dev` — run `wrangler tail` to see the real error |
