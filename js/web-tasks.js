/*
  js/web-tasks.js — the four task types on practice-web.html (weeks 6–8).

  js/task-shell.js owns the task list, brief, hints, verdict, reflections
  and Next link; this file fills the #webArea box for the open task:

    html-editor  HTML and CSS boxes, a live preview (an iframe fed with
                 srcdoc, updated a moment after typing stops), a Reset
                 button, and a checklist that is checked automatically
                 against the preview document — so "the page has one h1"
                 turns green the moment it is true.
    inspect      a deliberately flawed sample page from samples/ in an
                 iframe, beside a checklist of possible problems (five
                 real, two not). The student ticks what they find and
                 writes why it matters; Check marks the answers; Reveal
                 reloads the sample with ?reveal=1 so samples/reveal.js
                 outlines the real problems.
    walkthrough  type a URL, press Enter, step through browser → DNS →
                 request → server → database → response → render; then
                 a matching exercise and a two-sentence writing box.
    summary      a text, a note-taking frame, a summary box with a live
                 word count, and three self-check boxes.

  Everything the student types is saved in this browser through
  js/progress.js (Progress.saveData) and restored when they come back.
  A task is marked passed through TaskShell.taskPassed().
*/
(function () {
  "use strict";

  var area = document.getElementById("webArea");
  var make = TaskShell.make, clear = TaskShell.clear, text = TaskShell.text;
  var task = null;
  var passedThisOpen = false;

  function el(tag, className, content) { return make(tag, className, content); }

  function save(patch) { Progress.saveData(task.id, task, patch); }

  function words(s) { return String(s || "").trim().split(/\s+/).filter(Boolean); }

  function pass(message) {
    TaskShell.showVerdict("good", message);
    if (!passedThisOpen) {
      passedThisOpen = true;
      TaskShell.taskPassed();
    }
  }

  function render(t) {
    task = t;
    passedThisOpen = false;
    clear(area);
    var data = Progress.getData(task.id);
    switch (task.type) {
      case "html-editor": renderEditor(data); break;
      case "inspect":     renderInspect(data); break;
      case "walkthrough": renderWalkthrough(data); break;
      case "summary":     renderSummary(data); break;
      default:
        area.appendChild(el("p", "muted", "This task type (" + task.type + ") is not supported on this page."));
    }
  }

  // =====================================================================
  // 1. HTML + CSS editor with live preview and automatic checklist
  // =====================================================================
  function renderEditor(data) {
    var wrap = el("div", "web-editor");

    var boxes = el("div", "web-editor-boxes");
    var htmlBox = codeBox("HTML", "webHtml", data.html != null ? data.html : (task.starterHtml || ""), 12);
    var cssBox = codeBox("CSS", "webCss", data.css != null ? data.css : (task.starterCss || ""), 12);
    boxes.appendChild(htmlBox.wrap);
    boxes.appendChild(cssBox.wrap);
    wrap.appendChild(boxes);

    var previewHead = el("div", "web-preview-head");
    previewHead.appendChild(el("span", null, "Preview"));
    var reset = el("button", "btn outline small-btn", "Reset");
    reset.type = "button";
    previewHead.appendChild(reset);
    wrap.appendChild(previewHead);

    var frame = el("iframe", "web-preview");
    frame.setAttribute("title", "Preview of your page");
    frame.setAttribute("sandbox", "allow-same-origin");
    wrap.appendChild(frame);

    wrap.appendChild(el("h3", "tests-title", "Checklist"));
    wrap.appendChild(el("p", "muted small", "Checked automatically from the preview as you type. The task is complete when every item is green."));
    var list = el("ul", "checklist");
    var items = (task.checks || []).map(function (check) {
      var li = el("li", "check pending");
      li.appendChild(el("span", "check-status", "…"));
      li.appendChild(el("span", "check-label", check.label));
      list.appendChild(li);
      return li;
    });
    wrap.appendChild(list);
    area.appendChild(wrap);

    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(update, 300);
      save({ html: htmlBox.textarea.value, css: cssBox.textarea.value });
    }

    function update() {
      var html = htmlBox.textarea.value;
      var css = "<style>\n" + cssBox.textarea.value + "\n</style>";
      var doc = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, css + "\n</head>") : css + "\n" + html;
      frame.srcdoc = doc;
    }

    frame.addEventListener("load", function () {
      var doc = frame.contentDocument;
      if (!doc) { return; }
      var allOk = true;
      (task.checks || []).forEach(function (check, i) {
        var ok = false;
        try { ok = runCheck(check, doc, frame.contentWindow); } catch (e) { ok = false; }
        items[i].className = "check " + (ok ? "pass" : "fail");
        text(items[i].firstChild, ok ? "✓" : "✗");
        if (!ok) { allOk = false; }
      });
      if (allOk && (task.checks || []).length) {
        pass("Every item on the checklist is green. Well done!");
      }
    });

    htmlBox.textarea.addEventListener("input", schedule);
    cssBox.textarea.addEventListener("input", schedule);
    reset.addEventListener("click", function () {
      if (!window.confirm("Put the starter code back? Your changes in this task will be lost.")) { return; }
      htmlBox.textarea.value = task.starterHtml || "";
      cssBox.textarea.value = task.starterCss || "";
      htmlBox.refresh(); cssBox.refresh();
      schedule();
    });
    update();
  }

  function runCheck(check, doc, win) {
    if (check.kind === "title") {
      return (doc.title || "").trim().length > 0;
    }
    if (check.kind === "count") {
      var n = doc.querySelectorAll(check.selector).length;
      if (check.exact != null && n !== check.exact) { return false; }
      if (check.min != null && n < check.min) { return false; }
      if (check.max != null && n > check.max) { return false; }
      return true;
    }
    if (check.kind === "style") {
      var node = doc.querySelector(check.selector);
      if (!node) { return false; }
      var value = win.getComputedStyle(node)[check.property];
      if (check.notIn && check.notIn.indexOf(value) !== -1) { return false; }
      if (check.equals != null && value !== check.equals) { return false; }
      if (check.min != null) {
        var num = parseFloat(value);
        if (isNaN(num) || num < check.min) { return false; }
      }
      return true;
    }
    if (check.kind === "text") {
      var found = doc.querySelector(check.selector);
      return !!found && found.textContent.indexOf(check.contains) !== -1;
    }
    return false;
  }

  // A labelled textarea with line numbers, like the Python editor's.
  function codeBox(label, id, value, rows) {
    var wrap = el("div", "web-codebox");
    var lab = el("label", null, label);
    lab.htmlFor = id;
    wrap.appendChild(lab);
    var editor = el("div", "editor");
    var gutter = el("pre", "gutter");
    gutter.setAttribute("aria-hidden", "true");
    var ta = el("textarea");
    ta.id = id; ta.rows = rows; ta.spellcheck = false; ta.wrap = "off";
    ta.value = value;
    editor.appendChild(gutter);
    editor.appendChild(ta);
    wrap.appendChild(editor);

    function refresh() {
      var n = ta.value.split("\n").length, nums = [];
      for (var i = 1; i <= n; i++) { nums.push(i); }
      gutter.textContent = nums.join("\n");
      gutter.scrollTop = ta.scrollTop;
    }
    var escapePressed = false;
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { escapePressed = true; return; }
      if (e.key === "Tab" && !escapePressed) {
        e.preventDefault();
        var s = ta.selectionStart, t = ta.selectionEnd;
        ta.value = ta.value.substring(0, s) + "  " + ta.value.substring(t);
        ta.selectionStart = ta.selectionEnd = s + 2;
        ta.dispatchEvent(new Event("input"));
      }
      escapePressed = false;
    });
    ta.addEventListener("input", refresh);
    ta.addEventListener("scroll", function () { gutter.scrollTop = ta.scrollTop; });
    refresh();
    return { wrap: wrap, textarea: ta, refresh: refresh };
  }

  // =====================================================================
  // 2. Inspect this page
  // =====================================================================
  function renderInspect(data) {
    var wrap = el("div", "web-inspect");
    var ticks = data.ticks || {};
    var whys = data.whys || {};
    var revealed = !!data.revealed;

    var head = el("div", "web-preview-head");
    head.appendChild(el("span", null, "The sample page"));
    var openLink = el("a", "small-link", "Open it in a new tab (easier for DevTools) ↗");
    openLink.href = task.sample; openLink.target = "_blank"; openLink.rel = "noopener";
    head.appendChild(openLink);
    wrap.appendChild(head);

    var frame = el("iframe", "web-sample");
    frame.setAttribute("title", "Sample page to inspect");
    frame.src = task.sample + (revealed ? "?reveal=1" : "");
    wrap.appendChild(frame);

    var tip = el("div", "tip");
    tip.appendChild(el("strong", null, "How to look at the real HTML: "));
    tip.appendChild(document.createTextNode("right-click the image (or anything else) and choose Inspect. The developer tools open and show the tag under your mouse. Press Escape then Tab to leave a box on this page with the keyboard."));
    wrap.appendChild(tip);

    wrap.appendChild(el("h3", "tests-title", "What is wrong with this page?"));
    wrap.appendChild(el("p", "muted small", "Tick the problems you find. Then write one sentence for each: why does it matter for a real user?"));

    var list = el("ul", "problems");
    var rows = (task.problems || []).map(function (p) {
      var li = el("li", "problem");
      var top = el("div", "problem-top");
      var cb = el("input"); cb.type = "checkbox"; cb.id = "prob-" + p.id; cb.checked = !!ticks[p.id];
      var lab = el("label", null, p.label); lab.htmlFor = cb.id;
      top.appendChild(cb); top.appendChild(lab);
      li.appendChild(top);
      var whyWrap = el("div", "problem-why");
      whyWrap.hidden = !cb.checked;
      var whyLab = el("label", "small", "Why does it matter for a real user?"); whyLab.htmlFor = "why-" + p.id;
      var why = el("input"); why.type = "text"; why.id = "why-" + p.id; why.value = whys[p.id] || "";
      why.placeholder = "One sentence…";
      whyWrap.appendChild(whyLab); whyWrap.appendChild(why);
      li.appendChild(whyWrap);
      var feedback = el("p", "problem-feedback"); feedback.hidden = true;
      li.appendChild(feedback);
      cb.addEventListener("change", function () {
        ticks[p.id] = cb.checked; whyWrap.hidden = !cb.checked; feedback.hidden = true; li.className = "problem";
        save({ ticks: ticks });
      });
      why.addEventListener("input", function () { whys[p.id] = why.value; save({ whys: whys }); });
      return { p: p, li: li, cb: cb, why: why, feedback: feedback };
    });
    wrap.appendChild(list);
    rows.forEach(function (r) { list.appendChild(r.li); });

    var buttons = el("div", "controls");
    var check = el("button", "btn", "Check my answers"); check.type = "button";
    var reveal = el("button", "btn outline", revealed ? "Answers are revealed" : "Reveal the answers"); reveal.type = "button";
    reveal.disabled = revealed;
    buttons.appendChild(check); buttons.appendChild(reveal);
    wrap.appendChild(buttons);
    area.appendChild(wrap);

    check.addEventListener("click", function () {
      Progress.recordAttempt(task.id, task);
      var allGood = true, found = 0, real = 0, decoysTicked = 0, unexplained = 0;
      rows.forEach(function (r) {
        var isReal = !r.p.decoy;
        if (isReal) { real++; }
        var msg = "", kind = "";
        if (isReal && r.cb.checked) {
          found++;
          if (words(r.why.value).length < 4) { msg = "Found it — now write a sentence about why it matters."; kind = "warn"; allGood = false; unexplained++; }
          else { msg = "Yes. " + (r.p.why || ""); kind = "good"; }
        } else if (isReal && !r.cb.checked) {
          msg = "Not found yet."; kind = "bad"; allGood = false;
        } else if (!isReal && r.cb.checked) {
          msg = "This is not a problem on this page — look again."; kind = "bad"; allGood = false; decoysTicked++;
        }
        r.feedback.hidden = !msg;
        text(r.feedback, msg);
        r.li.className = "problem " + kind;
      });
      if (allGood) {
        pass("You found all " + real + " problems and explained why each one matters. Well done!");
      } else {
        var parts = ["You have found " + found + " of " + real + " problems."];
        if (decoysTicked) { parts.push(decoysTicked + (decoysTicked === 1 ? " item you ticked is" : " items you ticked are") + " not a problem on this page."); }
        if (unexplained) { parts.push(unexplained + (unexplained === 1 ? " needs" : " need") + " a sentence about why it matters."); }
        parts.push("Read the notes under each item and check again.");
        TaskShell.showVerdict("bad", parts.join(" "));
      }
    });

    reveal.addEventListener("click", function () {
      revealed = true;
      save({ revealed: true });
      frame.src = task.sample + "?reveal=1";
      reveal.disabled = true;
      text(reveal, "Answers are revealed");
      rows.forEach(function (r) {
        if (!r.p.decoy) {
          r.feedback.hidden = false;
          text(r.feedback, "Model answer: " + (r.p.why || ""));
          r.li.className = "problem revealed";
        }
      });
      TaskShell.showVerdict("neutral", "The five real problems are outlined in red on the sample page. Tick them and write your own sentence for each, then Check.");
    });
  }

  // =====================================================================
  // 3. Request and response walkthrough
  // =====================================================================
  function renderWalkthrough(data) {
    var steps = task.steps || [];
    var state = { url: data.url || "", step: data.step != null ? data.step : -1, answers: data.answers || {} };
    var wrap = el("div", "web-walk");

    // URL bar
    var bar = el("form", "url-bar");
    var lab = el("label", null, "Type a website address and press Enter"); lab.htmlFor = "walkUrl";
    var input = el("input"); input.type = "text"; input.id = "walkUrl"; input.placeholder = "www.beds.ac.uk"; input.value = state.url;
    input.autocomplete = "off";
    var go = el("button", "btn", "Go"); go.type = "submit";
    bar.appendChild(lab);
    var row = el("div", "url-row"); row.appendChild(input); row.appendChild(go); bar.appendChild(row);
    wrap.appendChild(bar);

    // diagram
    var diagram = el("ol", "walk-diagram");
    var nodes = steps.map(function (s, i) {
      var li = el("li", "walk-node");
      li.appendChild(el("span", "walk-node-num", String(i + 1)));
      li.appendChild(el("span", "walk-node-term", s.term));
      diagram.appendChild(li);
      return li;
    });
    wrap.appendChild(diagram);

    var card = el("div", "walk-card"); card.hidden = true;
    var cardTitle = el("h3"); var cardText = el("p"); var cardCount = el("p", "muted small");
    card.appendChild(cardTitle); card.appendChild(cardText); card.appendChild(cardCount);
    var nav = el("div", "controls");
    var back = el("button", "btn outline small-btn", "← Back"); back.type = "button";
    var next = el("button", "btn small-btn", "Next step →"); next.type = "button";
    nav.appendChild(back); nav.appendChild(next);
    card.appendChild(nav);
    wrap.appendChild(card);

    // matching
    var matching = el("section", "walk-matching"); matching.hidden = true;
    matching.appendChild(el("h3", "tests-title", "Match the words to their meanings"));
    matching.appendChild(el("p", "muted small", "Choose the right word for each meaning, then press Check."));
    var terms = (task.matching || []).map(function (m) { return m.term; });
    var defs = shuffled(task.matching || [], task.id);
    var table = el("div", "match-table");
    var selects = defs.map(function (m, i) {
      var r = el("div", "match-row");
      var sel = el("select"); sel.id = "match-" + i;
      sel.appendChild(new Option("choose…", ""));
      terms.forEach(function (t) { sel.appendChild(new Option(t, t)); });
      sel.value = state.answers[m.term] || "";
      var l = el("label", null, m.definition); l.htmlFor = sel.id;
      var fb = el("span", "match-fb");
      r.appendChild(sel); r.appendChild(l); r.appendChild(fb);
      table.appendChild(r);
      sel.addEventListener("change", function () { state.answers[m.term] = sel.value; save({ answers: state.answers }); fb.textContent = ""; r.className = "match-row"; });
      return { m: m, sel: sel, fb: fb, row: r };
    });
    matching.appendChild(table);
    var checkBtn = el("button", "btn", "Check answers"); checkBtn.type = "button";
    matching.appendChild(checkBtn);
    wrap.appendChild(matching);

    // writing
    var writing = el("section", "walk-writing"); writing.hidden = true;
    var wLab = el("label", null, task.writingPrompt || "Explain it in your own words."); wLab.htmlFor = "walkWriting";
    var wTa = el("textarea"); wTa.id = "walkWriting"; wTa.rows = 4;
    var savedR = Progress.get(task.id);
    wTa.value = (savedR && savedR.reflections && savedR.reflections.writing) || "";
    var wCount = el("p", "muted small");
    var finish = el("button", "btn", "Finish the task"); finish.type = "button";
    writing.appendChild(el("h3", "tests-title", "Now explain it yourself"));
    writing.appendChild(wLab); writing.appendChild(wTa); writing.appendChild(wCount); writing.appendChild(finish);
    wrap.appendChild(writing);
    area.appendChild(wrap);

    function boldTerm(node, s) {
      // Show the key term in bold wherever it appears in the sentence.
      clear(node);
      var re = new RegExp("(" + s.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i");
      s.text.split(re).forEach(function (part) {
        if (part.toLowerCase() === s.term.toLowerCase()) { node.appendChild(el("strong", "key-term", part)); }
        else { node.appendChild(document.createTextNode(part)); }
      });
    }

    function showStep() {
      nodes.forEach(function (n, i) {
        n.className = "walk-node" + (i === state.step ? " current" : i < state.step ? " done" : "");
      });
      if (state.step < 0) { card.hidden = true; return; }
      var s = steps[state.step];
      card.hidden = false;
      text(cardTitle, (state.step + 1) + ". " + s.title);
      boldTerm(cardText, s);
      text(cardCount, "Step " + (state.step + 1) + " of " + steps.length);
      back.disabled = state.step === 0;
      text(next, state.step === steps.length - 1 ? "Done — go to the matching exercise ↓" : "Next step →");
      var finished = state.step >= steps.length - 1 || data.stepsDone;
      matching.hidden = !finished;
      writing.hidden = !finished;
      save({ step: state.step });
    }

    bar.addEventListener("submit", function (e) {
      e.preventDefault();
      state.url = input.value.trim() || "www.beds.ac.uk";
      input.value = state.url;
      state.step = 0;
      save({ url: state.url });
      showStep();
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    back.addEventListener("click", function () { if (state.step > 0) { state.step--; showStep(); } });
    next.addEventListener("click", function () {
      if (state.step < steps.length - 1) { state.step++; showStep(); }
      else { data.stepsDone = true; save({ stepsDone: true }); matching.hidden = false; writing.hidden = false; matching.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });

    var matchingCorrect = false;
    checkBtn.addEventListener("click", function () {
      Progress.recordAttempt(task.id, task);
      var right = 0;
      selects.forEach(function (s) {
        var ok = s.sel.value === s.m.term;
        s.row.className = "match-row " + (ok ? "good" : "bad");
        s.fb.textContent = ok ? "✓" : (s.sel.value ? "✗ not this one" : "✗ choose a word");
        if (ok) { right++; }
      });
      matchingCorrect = right === selects.length;
      TaskShell.showVerdict(matchingCorrect ? "good" : "bad",
        matchingCorrect ? "All " + right + " matched. Now write your explanation below." : right + " of " + selects.length + " correct. Change the ones marked ✗ and check again.");
    });

    function updateCount() {
      var n = words(wTa.value).length;
      text(wCount, n + " word" + (n === 1 ? "" : "s") + " — two sentences is about 20 to 40 words.");
    }
    var wTimer = null;
    wTa.addEventListener("input", function () {
      updateCount();
      clearTimeout(wTimer);
      wTimer = setTimeout(function () {
        Progress.saveReflection(task.id, task, "writing", wTa.value);
        Progress.saveReflection(task.id, task, "writingPrompt", task.writingPrompt || "");
      }, 400);
    });
    updateCount();

    finish.addEventListener("click", function () {
      var n = words(wTa.value).length;
      if (!matchingCorrect) {
        // allow a saved-correct state from an earlier visit
        var allSaved = selects.every(function (s) { return s.sel.value === s.m.term; });
        if (!allSaved) { TaskShell.showVerdict("bad", "Check the matching exercise first — every word must be right."); return; }
        matchingCorrect = true;
      }
      if (n < 15) { TaskShell.showVerdict("bad", "Your explanation is " + n + " words. Two full sentences are usually at least 15. Say what a server is, then what it does."); return; }
      Progress.saveReflection(task.id, task, "writing", wTa.value);
      Progress.saveReflection(task.id, task, "writingPrompt", task.writingPrompt || "");
      pass("Matching complete and your explanation is saved with your reflections. Well done!");
    });

    if (state.step >= 0) { showStep(); }
  }

  // Same order every time for the same task, but not the order in the file.
  function shuffled(list, seed) {
    var arr = list.slice();
    var h = 0;
    for (var i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) >>> 0; }
    for (var j = arr.length - 1; j > 0; j--) {
      h = (h * 1103515245 + 12345) >>> 0;
      var k = h % (j + 1);
      var tmp = arr[j]; arr[j] = arr[k]; arr[k] = tmp;
    }
    return arr;
  }

  // =====================================================================
  // 4. Summarising
  // =====================================================================
  function renderSummary(data) {
    var wrap = el("div", "web-summary");
    var notes = data.notes || {};

    var reading = el("section", "reading");
    reading.appendChild(el("h3", "tests-title", "Read"));
    reading.appendChild(el("p", "muted small", words(task.text).length + " words"));
    reading.appendChild(el("p", "reading-text", task.text));
    wrap.appendChild(reading);

    var frame = el("section", "note-frame");
    frame.appendChild(el("h3", "tests-title", "Take notes"));
    (task.noteFrame || []).forEach(function (f) {
      var l = el("label", null, f.label); l.htmlFor = "note-" + f.key;
      var i = el("input"); i.type = "text"; i.id = "note-" + f.key; i.value = notes[f.key] || "";
      i.addEventListener("input", function () { notes[f.key] = i.value; save({ notes: notes }); });
      frame.appendChild(l); frame.appendChild(i);
    });
    wrap.appendChild(frame);

    var write = el("section", "summary-write");
    write.appendChild(el("h3", "tests-title", "Write your summary"));
    var lab = el("label", null, "About " + (task.targetWords || 30) + " words, in your own words"); lab.htmlFor = "summaryText";
    var ta = el("textarea"); ta.id = "summaryText"; ta.rows = 4;
    var savedR = Progress.get(task.id);
    ta.value = (savedR && savedR.reflections && savedR.reflections.writing) || "";
    var count = el("p", "word-count");
    write.appendChild(lab); write.appendChild(ta); write.appendChild(count);

    var checks = el("ul", "selfchecks");
    var boxes = (task.selfChecks || []).map(function (label, i) {
      var li = el("li");
      var cb = el("input"); cb.type = "checkbox"; cb.id = "self-" + i; cb.checked = !!(data.selfChecks || {})[i];
      var l = el("label", null, label); l.htmlFor = cb.id;
      li.appendChild(cb); li.appendChild(l); checks.appendChild(li);
      cb.addEventListener("change", function () { var sc = data.selfChecks || {}; sc[i] = cb.checked; data.selfChecks = sc; save({ selfChecks: sc }); });
      return cb;
    });
    write.appendChild(el("p", "small muted", "Self-check before you finish:"));
    write.appendChild(checks);
    var finish = el("button", "btn", "Finish the task"); finish.type = "button";
    write.appendChild(finish);
    wrap.appendChild(write);
    area.appendChild(wrap);

    var min = task.minWords || 20, max = task.maxWords || 40, target = task.targetWords || 30;
    function updateCount() {
      var n = words(ta.value).length;
      var note = n === 0 ? "" : n < min ? " — a bit short" : n > max ? " — a bit long" : " — good length";
      text(count, n + " word" + (n === 1 ? "" : "s") + " (aim for about " + target + ", between " + min + " and " + max + ")" + note);
      count.className = "word-count " + (n === 0 ? "" : n < min || n > max ? "warn" : "good");
    }
    var tTimer = null;
    ta.addEventListener("input", function () {
      updateCount();
      clearTimeout(tTimer);
      tTimer = setTimeout(function () {
        Progress.saveReflection(task.id, task, "writing", ta.value);
        Progress.saveReflection(task.id, task, "writingPrompt", "My summary of: " + task.title.replace(/^Summarise: /, ""));
      }, 400);
    });
    updateCount();

    // Eight or more words in a row copied from the text is not "your own words".
    function copiedRun(summary, source) {
      var s = words(summary.toLowerCase().replace(/[^\w\s]/g, ""));
      var src = words(source.toLowerCase().replace(/[^\w\s]/g, "")).join(" ");
      for (var i = 0; i + 8 <= s.length; i++) {
        var run = s.slice(i, i + 8).join(" ");
        if (src.indexOf(run) !== -1) { return run; }
      }
      return null;
    }

    finish.addEventListener("click", function () {
      Progress.recordAttempt(task.id, task);
      var n = words(ta.value).length;
      if (n < min) { TaskShell.showVerdict("bad", "Your summary is " + n + " words. Aim for about " + target + ". What is the main idea? Say it in one more sentence."); return; }
      if (n > max) { TaskShell.showVerdict("bad", "Your summary is " + n + " words — too long for a summary. Which examples or details can you leave out?"); return; }
      var run = copiedRun(ta.value, task.text);
      if (run) { TaskShell.showVerdict("bad", "Part of your summary copies the text word for word (\"" + run + "…\"). Say it in your own words."); return; }
      var unticked = boxes.filter(function (cb) { return !cb.checked; }).length;
      if (unticked) { TaskShell.showVerdict("bad", "Go through the self-check list: " + unticked + " item" + (unticked === 1 ? " is" : "s are") + " not ticked. If you cannot tick one, change your summary first."); return; }
      Progress.saveReflection(task.id, task, "writing", ta.value);
      Progress.saveReflection(task.id, task, "writingPrompt", "My summary of: " + task.title.replace(/^Summarise: /, ""));
      pass("A " + n + "-word summary in your own words, checked against the list. Well done! It is saved with your reflections.");
    });
  }

  TaskShell.init({ types: ["html-editor", "inspect", "walkthrough", "summary"], render: render });
})();
