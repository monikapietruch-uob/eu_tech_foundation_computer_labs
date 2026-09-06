/*
  js/progress.js — remembers a student's work in this browser only.

  Everything lives under one localStorage key, "asf-progress-v1":

    {
      "<taskId>": {
        "title": "Move to the wall",        so exports make sense without the index
        "week": 2,
        "status": "started" | "passed",
        "attempts": 3,                      how many times Run was pressed
        "firstPassedAt": "2026-09-21T10:12:00.000Z" | null,
        "lastCode": "def main(): ...",      restored when the task is reopened
        "reflections": { "tried": "...", "word": "..." },
        "updatedAt": "..."
      }
    }

  Nothing here goes to a server. localStorage can be missing or blocked
  (private windows, locked-down machines), so every read and write is
  wrapped in try/catch and the site keeps working with nothing saved —
  Progress.available() says which situation we are in.

  Exposes a global object called Progress:
    get(taskId)                       -> entry or null
    getAll()                          -> the whole object (a copy)
    markStarted(taskId, task)         status "started" unless already passed
    recordAttempt(taskId, task)       attempts + 1
    markPassed(taskId, task)          status "passed", firstPassedAt if new
    saveCode(taskId, task, code)      debounced; use flushCode() before leaving
    flushCode()
    saveReflection(taskId, task, key, text)   key is "tried" or "word"
    summary(index)                    -> [{week, title, done, total}]
    reflectionsAsText(index)          -> plain text for Padlet
    clearAll()
    available()                       -> true if localStorage works here
*/
var Progress = (function () {
  "use strict";

  var KEY = "asf-progress-v1";
  var DEBOUNCE_MS = 400;

  var storageWorks = (function () {
    try {
      var probe = "__asf_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) { return false; }
  })();

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var data = raw ? JSON.parse(raw) : {};
      return (data && typeof data === "object") ? data : {};
    } catch (e) { return {}; }
  }

  function save(data) {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }

  function now() { return new Date().toISOString(); }

  function entryFor(data, taskId, task) {
    var e = data[taskId] || {
      title: "", week: null, status: "started", attempts: 0,
      firstPassedAt: null, lastCode: null, reflections: { tried: "", word: "" }, updatedAt: null
    };
    if (task) { e.title = task.title || e.title; e.week = task.week != null ? task.week : e.week; }
    if (!e.reflections) { e.reflections = { tried: "", word: "" }; }
    e.updatedAt = now();
    data[taskId] = e;
    return e;
  }

  function get(taskId) {
    var e = load()[taskId];
    return e ? JSON.parse(JSON.stringify(e)) : null;
  }

  function getAll() { return load(); }

  function markStarted(taskId, task) {
    var data = load(); var e = entryFor(data, taskId, task);
    if (e.status !== "passed") { e.status = "started"; }
    save(data);
  }

  function recordAttempt(taskId, task) {
    var data = load(); var e = entryFor(data, taskId, task);
    e.attempts = (e.attempts || 0) + 1;
    if (e.status !== "passed") { e.status = "started"; }
    save(data);
  }

  function markPassed(taskId, task) {
    var data = load(); var e = entryFor(data, taskId, task);
    e.status = "passed";
    if (!e.firstPassedAt) { e.firstPassedAt = now(); }
    save(data);
  }

  // Code is saved a moment after the student stops typing, not on every key.
  var pending = null, pendingTimer = null;
  function saveCode(taskId, task, code) {
    pending = { taskId: taskId, task: task, code: code };
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flushCode, DEBOUNCE_MS);
  }

  function flushCode() {
    clearTimeout(pendingTimer);
    if (!pending) { return; }
    var data = load(); var e = entryFor(data, pending.taskId, pending.task);
    e.lastCode = pending.code;
    if (e.status !== "passed") { e.status = "started"; }
    save(data);
    pending = null;
  }
  window.addEventListener("beforeunload", flushCode);
  window.addEventListener("pagehide", flushCode);

  function saveReflection(taskId, task, key, textValue) {
    var data = load(); var e = entryFor(data, taskId, task);
    e.reflections[key] = String(textValue || "");
    save(data);
  }

  function summary(index) {
    var data = load();
    return (index.weeks || []).map(function (week) {
      var done = 0;
      (week.tasks || []).forEach(function (t) {
        if (data[t.id] && data[t.id].status === "passed") { done++; }
      });
      return { week: week.week, title: week.title, done: done, total: (week.tasks || []).length };
    });
  }

  function hasReflection(e) {
    return e && e.reflections && ((e.reflections.tried || "").trim() || (e.reflections.word || "").trim());
  }

  // Plain text, in teaching order, only for tasks with something written.
  function reflectionsAsText(index) {
    var data = load();
    var lines = ["My reflections — Tech Practice Hub", "Copied on " + new Date().toLocaleDateString("en-GB"), ""];
    var ordered = [];
    (index.weeks || []).forEach(function (week) {
      (week.tasks || []).forEach(function (t) { ordered.push({ id: t.id, title: t.title, week: week.week }); });
    });
    Object.keys(data).forEach(function (id) {
      if (!ordered.some(function (o) { return o.id === id; })) {
        ordered.push({ id: id, title: data[id].title || id, week: data[id].week });
      }
    });
    var count = 0;
    ordered.forEach(function (o) {
      var e = data[o.id];
      if (!hasReflection(e)) { return; }
      count++;
      lines.push(o.title + (o.week != null ? " (week " + o.week + ")" : ""));
      lines.push("What did you try first, and what happened?");
      lines.push((e.reflections.tried || "").trim() || "(no answer yet)");
      lines.push("What is one word from this task you could now explain to a classmate?");
      lines.push((e.reflections.word || "").trim() || "(no answer yet)");
      lines.push("");
    });
    if (count === 0) { return ""; }
    return lines.join("\n").trim() + "\n";
  }

  function clearAll() {
    pending = null;
    clearTimeout(pendingTimer);
    try { window.localStorage.removeItem(KEY); return true; } catch (e) { return false; }
  }

  return {
    get: get, getAll: getAll,
    markStarted: markStarted, recordAttempt: recordAttempt, markPassed: markPassed,
    saveCode: saveCode, flushCode: flushCode,
    saveReflection: saveReflection,
    summary: summary, reflectionsAsText: reflectionsAsText,
    clearAll: clearAll,
    available: function () { return storageWorks; }
  };
})();
