/*
  worker/worker.js — the AI proxy. A Cloudflare Worker: the only server-side
  code in the project.

  The students' Python calls call_gpt("..."). That becomes a POST to this
  Worker with {classCode, prompt, clientId}. The Worker checks the class
  code, the prompt length and the caller's rate limit, then asks the AI
  provider with a fixed system prompt and a token cap, and returns
  {ok: true, text} or {ok: false, error} where error is a sentence a
  student can read.

  The provider's API key is a Worker secret (API_KEY). It is never in this
  repo and never reaches a browser. The class code is a second secret
  (CLASS_CODE). Everything else is set in wrangler.toml.

  Rate limits are counted per client id (a random id each browser tab
  makes), not per IP address, because a computer room shares one IP.
  Counters are stored in Workers KV: one read and one write per request.
*/

// ---------------------------------------------------------------- settings

// The instructions the model always gets before the student's prompt.
// Edit this to change how the AI answers. Keep it short: it costs tokens.
const SYSTEM_PROMPT =
  "You are helping a first-year university student who is a beginner at " +
  "programming and whose first language is not English. Answer briefly, in " +
  "simple English (CEFR B1), in plain text with no markdown and no bullet " +
  "points. Three sentences at most unless the question asks for a list. If " +
  "you are not sure, say so.";

const DEFAULT_ERROR = "The AI service did not answer. Check your class code, or try again in a minute.";
const BUSY_MESSAGE = "Lots of people are asking at once. Wait a few seconds and run it again.";

const RETRY_DELAYS_MS = [800, 1600, 2400];   // back-off between retries on 429/503

// ---------------------------------------------------------------- entry point

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (!originAllowed(origin, env)) {
      return reply({ ok: false, error: "This page is not allowed to use the AI service." }, 403, cors);
    }
    if (request.method !== "POST") {
      return reply({ ok: false, error: "Only POST requests are accepted." }, 405, cors);
    }

    let body;
    try { body = await request.json(); }
    catch (e) { return reply({ ok: false, error: "The request was not valid JSON." }, 400, cors); }

    const classCode = String(body.classCode || "").trim();
    const prompt = String(body.prompt || "").trim();
    const clientId = String(body.clientId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);

    if (!env.CLASS_CODE || classCode !== env.CLASS_CODE) {
      return reply({ ok: false, error: "That class code is not right. Check the code on the board." }, 403, cors);
    }

    const maxChars = num(env.MAX_PROMPT_CHARS, 500);
    if (!prompt) {
      return reply({ ok: false, error: "The prompt is empty. Give call_gpt() a question to ask." }, 400, cors);
    }
    if (prompt.length > maxChars) {
      return reply({ ok: false, error: "Your prompt is " + prompt.length + " characters. The limit is " + maxChars + "." }, 400, cors);
    }

    // Rate limit per client (falls back to the IP if the page sent no id).
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const limited = await checkRateLimit(env, clientId || ("ip:" + ip));
    if (limited) {
      return reply({ ok: false, error: limited, busy: true }, 429, cors);
    }

    // Ask the model, retrying briefly if the provider is rate-limited.
    try {
      const text = await askWithRetry(prompt, env);
      return reply({ ok: true, text: text }, 200, cors);
    } catch (err) {
      if (err && err.busy) {
        // Friendly, and 200 so the browser treats it as an answer, not a failure.
        return reply({ ok: false, error: BUSY_MESSAGE, busy: true }, 200, cors);
      }
      console.error("provider error:", err && err.message ? err.message : err);
      return reply({ ok: false, error: DEFAULT_ERROR }, 502, cors);
    }
  }
};

// ---------------------------------------------------------------- helpers

function reply(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers)
  });
}

function num(value, fallback) {
  const n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
}

function originAllowed(origin, env) {
  return allowedOrigins(env).indexOf(origin) !== -1;
}

function corsHeaders(origin, env) {
  const allowed = originAllowed(origin, env) ? origin : allowedOrigins(env)[0] || "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

// One KV key per client: { m: <minute number>, mc: <count>, d: <day>, dc: <count> }.
// Returns a message if the caller is over a limit, else null.
async function checkRateLimit(env, key) {
  const perMinute = num(env.PER_MINUTE, 20);
  const perDay = num(env.PER_DAY, 200);
  const nowMinute = Math.floor(Date.now() / 60000);
  const today = new Date().toISOString().slice(0, 10);

  let record = { m: nowMinute, mc: 0, d: today, dc: 0 };
  try {
    const raw = env.RATE_LIMITS ? await env.RATE_LIMITS.get("c:" + key) : null;
    if (raw) { record = JSON.parse(raw); }
  } catch (e) { /* treat as fresh */ }

  if (record.m !== nowMinute) { record.m = nowMinute; record.mc = 0; }
  if (record.d !== today) { record.d = today; record.dc = 0; }

  if (record.mc >= perMinute) {
    return "You have sent " + perMinute + " requests in one minute. Wait a minute, then try again.";
  }
  if (record.dc >= perDay) {
    return "You have used today's limit of " + perDay + " AI requests. It resets tomorrow.";
  }

  record.mc += 1;
  record.dc += 1;
  try {
    // Best effort: KV allows one write per second per key, and a lost count
    // is not worth failing the request over.
    if (env.RATE_LIMITS) {
      await env.RATE_LIMITS.put("c:" + key, JSON.stringify(record), { expirationTtl: 60 * 60 * 26 });
    }
  } catch (e) { /* ignore */ }
  return null;
}

async function askWithRetry(prompt, env) {
  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await askModel(prompt, env);
    } catch (err) {
      lastErr = err;
      if (!err.retryable || attempt === RETRY_DELAYS_MS.length) { break; }
      await new Promise(function (r) { setTimeout(r, RETRY_DELAYS_MS[attempt]); });
    }
  }
  if (lastErr && lastErr.retryable) { lastErr.busy = true; }
  throw lastErr;
}

// ---------------------------------------------------------------- providers
//
// To change provider, set PROVIDER (and MODEL / API_BASE_URL) in wrangler.toml
// and set the matching API_KEY secret. Nothing else needs to change.

async function askModel(prompt, env) {
  const provider = String(env.PROVIDER || "groq").toLowerCase();
  const maxTokens = num(env.MAX_TOKENS, 200);
  const model = env.MODEL || "";

  if (provider === "groq") {
    return askOpenAiCompatible("https://api.groq.com/openai/v1/chat/completions", model || "openai/gpt-oss-20b", prompt, maxTokens, env, { reasoning_effort: "low" });
  }
  if (provider === "openai-compatible") {
    const base = String(env.API_BASE_URL || "").replace(/\/+$/, "");
    if (!base) { throw new Error("API_BASE_URL is not set"); }
    return askOpenAiCompatible(base + "/chat/completions", model, prompt, maxTokens, env, {});
  }
  if (provider === "gemini") {
    return askGemini(model || "gemini-2.5-flash-lite", prompt, maxTokens, env);
  }
  throw new Error("Unknown PROVIDER: " + provider);
}

// Groq, OpenAI, Mistral, Cerebras, Together and many others share this shape.
async function askOpenAiCompatible(url, model, prompt, maxTokens, env, extra) {
  const payload = Object.assign({
    model: model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    max_completion_tokens: maxTokens,
    temperature: 0.7
  }, extra);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.API_KEY },
    body: JSON.stringify(payload)
  });
  if (res.status === 429 || res.status === 503 || res.status === 502) {
    const e = new Error("provider busy: " + res.status); e.retryable = true; throw e;
  }
  if (!res.ok) {
    throw new Error("provider returned " + res.status + ": " + (await res.text()).slice(0, 300));
  }
  const data = await res.json();
  const choice = data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content ? String(choice.message.content).trim() : "";
  if (!text) {
    if (choice && choice.finish_reason === "length") {
      return "(The AI ran out of space before it finished. Ask a shorter question, or ask for a shorter answer.)";
    }
    throw new Error("provider returned no text");
  }
  return text;
}

async function askGemini(model, prompt, maxTokens, env) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
    })
  });
  if (res.status === 429 || res.status === 503) {
    const e = new Error("provider busy: " + res.status); e.retryable = true; throw e;
  }
  if (!res.ok) {
    throw new Error("provider returned " + res.status + ": " + (await res.text()).slice(0, 300));
  }
  const data = await res.json();
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = parts ? parts.map(function (p) { return p.text || ""; }).join("").trim() : "";
  if (!text) { throw new Error("provider returned no text"); }
  return text;
}
