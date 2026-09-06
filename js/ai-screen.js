/*
  js/ai-screen.js — the AI panel on practice-ai.html.

  Keeps the class code in sessionStorage (this tab only), makes a random
  client id for the rate limiter (also sessionStorage), tells the runner
  where the proxy is (AI_PROXY_URL from js/ai-config.js), runs a one-line
  connection test, and shows every call_gpt() call — prompt, answer or
  error, time taken — in a log so students can compare answers to the
  same question. The tasks themselves use the ordinary Python task screen
  (js/task-screen.js) with task type "ai".
*/
(function () {
  "use strict";

  var el = {};
  ["classCode", "aiTest", "aiStatus", "aiLog", "aiLogCount", "aiLogClear", "aiLogWrap"]
    .forEach(function (id) { el[id] = document.getElementById(id); });

  var CODE_KEY = "asf-class-code";
  var CLIENT_KEY = "asf-client-id";
  var proxyUrl = (typeof AI_PROXY_URL === "string") ? AI_PROXY_URL.trim() : "";

  function session(key, value) {
    try {
      if (value === undefined) { return window.sessionStorage.getItem(key) || ""; }
      window.sessionStorage.setItem(key, value);
    } catch (e) { return ""; }
  }

  function clientId() {
    var id = session(CLIENT_KEY);
    if (!id) {
      id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      session(CLIENT_KEY, id);
    }
    return id;
  }

  function pushConfig() {
    Runner.setAi({ proxyUrl: proxyUrl, classCode: el.classCode.value.trim(), clientId: clientId() });
  }

  function status(kind, message) {
    el.aiStatus.className = "ai-status " + kind;
    el.aiStatus.textContent = message;
  }

  // ---- class code
  el.classCode.value = session(CODE_KEY);
  el.classCode.addEventListener("input", function () {
    session(CODE_KEY, el.classCode.value.trim());
    pushConfig();
    status("", "");
  });

  if (!proxyUrl) {
    status("bad", "The AI service is not set up on this site yet (js/ai-config.js is empty).");
    el.aiTest.disabled = true;
  }
  pushConfig();

  // ---- connection test: one real call through the same route the tasks use
  el.aiTest.addEventListener("click", function () {
    if (!el.classCode.value.trim()) { status("bad", "Type the class code first."); el.classCode.focus(); return; }
    if (Runner.isRunning) { status("bad", "A program is running. Press Stop first."); return; }
    status("wait", "Asking the AI…");
    el.aiTest.disabled = true;
    Runner.runPython({ code: 'print(call_gpt("Say hello to a class of students in one short sentence."))', timeoutMs: 60000 })
      .then(function (r) {
        el.aiTest.disabled = false;
        if (r.error) { status("bad", r.error.explanation || r.error.message); }
        else if (r.timedOut) { status("bad", "No answer after 60 seconds. Try again."); }
        else { status("good", "Connected. The AI said: " + r.stdout.trim()); }
      });
  });

  // ---- call log
  var count = 0;
  Runner.onAiCall(function (call) {
    count++;
    var li = document.createElement("li");
    li.className = "ai-call " + (call.ok ? "ok" : "failed");
    var head = document.createElement("div");
    head.className = "ai-call-head";
    head.textContent = "#" + count + " · " + new Date().toLocaleTimeString("en-GB") + " · " + (call.ms / 1000).toFixed(1) + " s";
    var q = document.createElement("p"); q.className = "ai-q";
    var qLabel = document.createElement("strong"); qLabel.textContent = "You asked: ";
    q.appendChild(qLabel); q.appendChild(document.createTextNode(call.prompt));
    var a = document.createElement("p"); a.className = "ai-a";
    var aLabel = document.createElement("strong"); aLabel.textContent = call.ok ? "AI answered: " : "No answer: ";
    a.appendChild(aLabel); a.appendChild(document.createTextNode(call.ok ? call.text : call.error));
    li.appendChild(head); li.appendChild(q); li.appendChild(a);
    el.aiLog.insertBefore(li, el.aiLog.firstChild);
    el.aiLogCount.textContent = "(" + count + " call" + (count === 1 ? "" : "s") + ")";
    el.aiLogWrap.open = true;
  });
  el.aiLogClear.addEventListener("click", function () {
    while (el.aiLog.firstChild) { el.aiLog.removeChild(el.aiLog.firstChild); }
    count = 0;
    el.aiLogCount.textContent = "(0 calls)";
  });
})();
