/*
  js/web-shell.js — the page shell for practice-web.html (weeks 6 to 8),
  built the same way as the hub's Python pages in index.html.

  Two screens, chosen by the URL:
    practice-web.html                the task list: red page head with the
                                     progress chips, then the tasks grouped
                                     under big headings, one numbered row each
    practice-web.html?task=<id>      one task: red task bar with the step
                                     squares, the brief / word bank / hints on
                                     the left, the task itself on the right
                                     (an inspect task shows its website
                                     full-width above both), then the verdict,
                                     the Padlet button and the previous / next
                                     buttons

  js/web-tasks.js fills the right-hand #webArea for the open task; it only
  needs the small API at the bottom of this file (the same names the old
  js/task-shell.js had, so web-tasks.js did not have to change much):

    TaskShell.init({ render: function (task) {...} })
    TaskShell.task, TaskShell.index
    TaskShell.stage()               the full-width box above the two columns
                                    (the inspect tasks put the sample website there)
    TaskShell.showVerdict(kind, message[, title])   kind: good | bad | neutral | wait
    TaskShell.clearVerdict()
    TaskShell.taskPassed()          records the pass, shows the next-task link
    TaskShell.make / clear / text   small DOM helpers

  Progress and reflections are saved in this browser by js/progress.js.
  Header, nav and footer come from js/layout.js.
*/
var TaskShell = (function () {
  "use strict";

  var TYPES = ["html-editor", "inspect", "walkthrough", "summary"];
  var PADLET = "#padlet"; // TODO: the class Padlet link - the same one as in index.html
  var PAGE = "practice-web.html";

  // The groups on the list page, in order. Each web task belongs to the
  // first group whose week and type match it. The text is also the
  // "scenario" box at the top of the brief, like the robot intros on the
  // Python tasks.
  var GROUPS = [
    { week: 6, type: "html-editor", sub: "Week 6 · HTML & CSS", title: "Build a page",
      text: "The Robotics Club needs a website, and you are building it one task at a time: first the page structure, then the links, image and list, then the CSS. Edit the HTML and CSS boxes, watch the preview change as you type, and keep going until every item on the checklist is green.",
      // Two YouTube Shorts from the University of Bedfordshire to watch
      // BEFORE the three Robotics Club tasks. Shown as "Step 1" on the list
      // page and as a short reminder on each of the three task pages.
      watch: {
        title: "Watch first: meet the university's robots",
        intro: "Two short videos from the University of Bedfordshire: a robot dog and a humanoid robot. Watch both before you start - the website you are about to build is for a student club that works with robots like these.",
        videos: [
          { id: "GFr7eIgJTuI", title: "Meet Go2: The Robotic Dog at the University of Bedfordshire", short: "Go2, the robot dog" },
          { id: "hPcvy42bEQQ", title: "Meet Nao: The Humanoid Robot at the University of Bedfordshire", short: "Nao, the humanoid robot" }
        ],
        then: "Now build the Robotics Club website. Do the three tasks below in order: fix the page structure, add the links, image and list, then style it with CSS."
      } },
    { week: 6, type: "inspect", sub: "Week 6 · Accessibility", title: "Inspect this page",
      text: "Three websites that look fine at first glance: a cafe, a gym and a library. Each one hides five problems that make it hard for some people to use. Open the developer tools, find the problems, and say why each one matters for a real user." },
    { week: 7, type: "walkthrough", sub: "Week 7 · Behind the web", title: "Request and response",
      text: "Type an address, press Enter and follow what happens in the next second: the browser, DNS, the request, the server, the database, the response. Then match the terms to their meanings and explain one of them in your own words." },
    { week: 8, type: "summary", sub: "Week 8 · Consolidation", title: "Summarise the web",
      text: "Read a short text about HTTPS, take notes in a frame, and write a summary of about thirty words in your own words. It is the same skill you need for the week 8 summarising test." },

    // The second round of each skill. These groups name their tasks in
    // `ids`, so groupFor() gives them exactly those and the groups above
    // keep the originals. Each one shows on the list page after the group
    // it extends.
    { week: 6, type: "html-editor", ids: ["web-w6-07", "web-w6-08", "web-w6-09"], sub: "Week 6 · HTML & CSS · round two", title: "Build a page: more practice",
      text: "Three more pages, each with its own look: a sign-up form for the Drone Society, a timetable for the computer labs, and a night-bus page that is almost impossible to read. Same rules: fix the HTML and CSS, watch the preview change, and stop when every item on the checklist is green." },
    { week: 6, type: "inspect", ids: ["web-w6-10", "web-w6-11"], sub: "Week 6 · Accessibility · round two", title: "Inspect this page: new problems",
      text: "Two more websites: the students' union's what's-on page and a phone repair shop. Some of the problems are ones you have already found three times; some are new, so read every item in the list carefully before you tick." },
    { week: 7, type: "walkthrough", ids: ["web-w7-02"], sub: "Week 7 · Behind the web · round two", title: "Logging in",
      text: "Type a username, press Log in and follow what happens: the form, the POST request, the server, the password check, the database and the cookie that keeps you logged in. Then match the terms and explain one of them in your own words." },
    { week: 8, type: "summary", ids: ["web-w8-02"], sub: "Week 8 · Consolidation · round two", title: "Summarise: cookies",
      text: "A second text to summarise, this time about cookies: what they are, what they are for, and why websites ask you about them. Notes first, then about thirty words in your own words." }
  ];

  // Sort the groups so each "round two" sits right after the group it
  // extends, whatever order they are written in above.
  GROUPS.sort(function (a, b) {
    var ka = (a.week * 10 + ["html-editor", "inspect", "walkthrough", "summary"].indexOf(a.type)) * 2 + (a.ids ? 1 : 0);
    var kb = (b.week * 10 + ["html-editor", "inspect", "walkthrough", "summary"].indexOf(b.type)) * 2 + (b.ids ? 1 : 0);
    return ka - kb;
  });

  // The one reflection question under each task, posted on Padlet (the
  // task file can override it with its own "reflect").
  var REFLECT = {
    "html-editor": "Which tag did you change first, what happened in the preview, and which word from the word bank could you now explain to a classmate?",
    inspect: "Which of the five problems was the hardest to find, and which real user would it affect most?",
    walkthrough: "Which step between pressing Enter and seeing the page surprised you, and why?",
    summary: "What did you leave out of your summary, and how did you decide it was a detail rather than the main idea?"
  };

  var $app = document.getElementById("app");
  var options = { render: function () {} };
  var index = null;   // tasks/index.json
  var list = [];      // the web tasks, in teaching order
  var task = null;    // the open task (its full JSON)
  var at = -1;        // its position in list

  // ------------------------------------------------------------ helpers
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function text(node, value) { if (node) { node.textContent = value; } }
  function clear(node) { while (node && node.firstChild) { node.removeChild(node.firstChild); } }
  function make(tag, className, content) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (content != null) { node.textContent = content; }
    return node;
  }
  function typeOf(entry) { return entry.type || entry.id.split("-")[0]; }
  function urlFor(entry) { return PAGE + "?task=" + encodeURIComponent(entry.id); }
  function taskIdFromUrl() { return new URLSearchParams(window.location.search).get("task"); }
  function isDone(id) { var saved = Progress.get(id); return !!(saved && saved.status === "passed"); }
  function countDone() { var n = 0; list.forEach(function (e) { if (isDone(e.id)) { n++; } }); return { done: n, total: list.length }; }
  function groupFor(entry) {
    var i;
    // A group that names this task in `ids` wins; otherwise the first group
    // without `ids` for the same week and type.
    for (i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].ids && GROUPS[i].ids.indexOf(entry.id) !== -1) { return GROUPS[i]; }
    }
    for (i = 0; i < GROUPS.length; i++) {
      if (!GROUPS[i].ids && GROUPS[i].week === entry.week && GROUPS[i].type === typeOf(entry)) { return GROUPS[i]; }
    }
    return { week: entry.week, type: typeOf(entry), sub: "Week " + entry.week, title: "", text: "" };
  }

  // 1 -> "One", 15 -> "Fifteen"; beyond twenty, the digits.
  function countWord(n) {
    var words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty"];
    return n < words.length ? words[n] : String(n);
  }

  // Wrap the word-bank terms in <b> wherever they appear in a paragraph,
  // so the brief reads like the Python briefs: the words in bold are the
  // ones to look up. Works on already-escaped text.
  function boldTerms(escaped, terms) {
    var out = escaped;
    (terms || []).forEach(function (term) {
      var t = esc(term).trim();
      if (!t || !/^[\w&;<>\s-]+$/.test(t) || /\//.test(term)) { return; }
      var re = new RegExp((/^\w/.test(t) ? "\\b" : "") + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (/\w$/.test(t) ? "\\b" : ""), "gi");
      out = out.replace(re, function (m) { return "<b>" + m + "</b>"; });
    });
    return out;
  }

  function briefHtml(t) {
    var terms = (t.vocabulary || []).map(function (v) { return v.term; });
    return String(t.brief || "").split(/\n\n+/).map(function (para) {
      var fenced = /^```\n?([\s\S]*?)\n?```$/.exec(para.trim());
      if (fenced) { return "<pre class=\"sample\">" + esc(fenced[1]) + "</pre>"; }
      return "<p>" + boldTerms(esc(para), terms) + "</p>";
    }).join("");
  }

  // ------------------------------------------------------------ the list page
  function listPage() {
    document.title = "Web practice - Tech Practice Hub";
    var all = countDone();
    var html = "<section class=\"pagehead\"><div class=\"wrap\"><h1>Web practice</h1>" +
      "<p>" + countWord(list.length) + " short tasks for weeks 6, 7 and 8. First you build and fix small pages in the browser, then you inspect websites with the developer tools, follow a request from your browser to a server and back, and finish by summarising how HTTPS keeps your data safe. Each brief is written in the language of the lectures: the words in <b>bold</b> are the terms you need to know, and every task has a word bank to check them. Finish a task, then answer its reflection questions - you will need those answers for your Padlet posts and your presentation.</p>" +
      "<p class=\"credit\">The cafe, the gym, the library, the students' union and the repair shop you inspect are made up, but their problems are the ones you will find on real websites every day.</p>" +
      "<div class=\"weeknav\"><span class=\"chip on\">" + all.done + " of " + all.total + " done</span>" +
      (list.length ? "<a class=\"chip\" href=\"" + urlFor(list[0]) + "\">Start at task 1</a>" : "") +
      "</div></div></section><section class=\"tasklist\"><div class=\"wrap\">";

    var placed = {};
    GROUPS.forEach(function (g) {
      var mine = list.filter(function (e) { return groupFor(e) === g; });
      if (!mine.length) { return; }
      html += groupHtml(g, mine);
      mine.forEach(function (e) { placed[e.id] = true; });
    });
    // Any task that no group claims still gets a row, under its week.
    var rest = list.filter(function (e) { return !placed[e.id]; });
    if (rest.length) { html += groupHtml({ sub: "More tasks", title: "Other tasks", text: "" }, rest); }

    html += "<div class=\"group extra\"><div class=\"group-head\"><div><div class=\"sub\">ANY TIME · EXTRA</div><h2>Also try</h2></div><p>Open any website you like and give it a temporary makeover in the developer tools: change the text, the colours, the sizes and the spacing, and see what each CSS property does. Nothing you change is saved, so experiment.</p></div>" +
      "<a class=\"trow\" href=\"exercises/html-css-1/html-css-1-devtools.html\"><div class=\"n\">+</div><div><div class=\"t\">DevTools Website Makeover</div><div class=\"c\">Change a real page live in DevTools</div></div><div class=\"s\">OPEN</div></a></div>";

    html += "</div></section>";
    $app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  // YouTube links for a group's "watch first" videos (Shorts embed like any
  // other video; the nocookie host keeps YouTube's tracking off the page).
  function watchUrl(v) { return "https://www.youtube.com/shorts/" + encodeURIComponent(v.id); }
  function embedUrl(v) { return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(v.id); }

  // The "Step 1: watch these first / Step 2: now build the site" panel that
  // sits between a group's heading and its task rows (list page only).
  function watchHtml(w) {
    if (!w || !w.videos || !w.videos.length) { return ""; }
    var html = "<div class=\"watch\" id=\"watch-first\"><div class=\"watch-head\"><div class=\"step\">STEP 1</div><div><h3>" + esc(w.title) + "</h3><p>" + esc(w.intro) + "</p></div></div><div class=\"watch-videos\">";
    w.videos.forEach(function (v, i) {
      html += "<figure class=\"short\"><iframe src=\"" + embedUrl(v) + "\" title=\"" + esc(v.title) + "\" loading=\"lazy\" allow=\"accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share\" referrerpolicy=\"strict-origin-when-cross-origin\" allowfullscreen></iframe>" +
        "<figcaption><b>Video " + (i + 1) + "</b>" + esc(v.title) + " <a href=\"" + watchUrl(v) + "\" target=\"_blank\" rel=\"noopener\">Open on YouTube ↗</a></figcaption></figure>";
    });
    html += "</div><div class=\"watch-next\"><div class=\"step\">STEP 2</div><p>" + esc(w.then) + "</p></div></div>";
    return html;
  }

  function groupHtml(g, tasks) {
    var html = "<div class=\"group\"><div class=\"group-head\"><div><div class=\"sub\">" + esc(g.sub).toUpperCase() + "</div><h2>" + esc(g.title) + "</h2></div><p>" + esc(g.text) + "</p></div>";
    html += watchHtml(g.watch);
    tasks.forEach(function (e) {
      var n = list.indexOf(e) + 1;
      var done = isDone(e.id);
      html += "<a class=\"trow" + (done ? " done" : "") + "\" href=\"" + urlFor(e) + "\"><div class=\"n\">" + n + "</div><div><div class=\"t\">" + esc(e.title) + "</div><div class=\"c\">" + esc(e.concept || "") + "</div></div><div class=\"s\">" + (done ? "DONE" : "TO DO") + "</div></a>";
    });
    return html + "</div>";
  }

  // ------------------------------------------------------------ the task page
  function taskPage() {
    var entry = list[at], g = groupFor(entry);
    document.title = task.title + " - Tech Practice Hub";

    var steps = list.map(function (x, i) {
      return "<a href=\"" + urlFor(x) + "\" class=\"" + (x.id === task.id ? "cur" : isDone(x.id) ? "done" : "") + "\" title=\"Task " + (i + 1) + ": " + esc(x.title) + "\"></a>";
    }).join("");

    var html = "<section class=\"taskbar\"><div class=\"wrap\"><div><div class=\"meta\">WEEK " + esc(task.week) + " · " + esc(g.title || "WEB").toUpperCase() + " · TASK " + (at + 1) + " OF " + list.length + "</div><h1>" + esc(task.title) + "</h1></div><div class=\"steps\" aria-label=\"All tasks\">" + steps + "</div></div></section>";

    html += "<div class=\"wrap task\"><div class=\"brief\">";
    if (g.text) { html += "<p class=\"scen\">" + esc(g.text) + "</p>"; }
    if (g.watch && g.watch.videos && g.watch.videos.length) {
      html += "<p class=\"watchnote\"><b>Have you met the robots yet?</b> If not, take two minutes to watch them first - they are the reason this club exists: " + g.watch.videos.map(function (v) {
        return "<a href=\"" + watchUrl(v) + "\" target=\"_blank\" rel=\"noopener\">" + esc(v.short || v.title) + " ↗</a>";
      }).join(" · ") + " (both are on <a href=\"" + PAGE + "#watch-first\">the task list</a> too). Then come back here and give the Robotics Club its website.</p>";
    }
    html += "<h2>Your brief</h2>" + briefHtml(task);
    if (task.vocabulary && task.vocabulary.length) {
      html += "<div class=\"wordbank\"><h3>Word bank</h3>" + task.vocabulary.map(function (v) {
        return "<details><summary>" + esc(v.term) + "</summary><div class=\"def\">" + esc(v.gloss) + "</div></details>";
      }).join("") + "</div>";
    }
    if (task.hints && task.hints.length) {
      html += "<div class=\"hints\"><h3>Stuck?</h3>" + task.hints.map(function (h, n) {
        return "<button type=\"button\" data-hint=\"" + n + "\">Show hint " + (n + 1) + "</button><div class=\"hint\" id=\"hint" + n + "\">" + esc(h) + "</div>";
      }).join("") + "</div>";
    }
    html += "</div><div class=\"work\">";
    html += "<div id=\"webArea\" class=\"web-area\"><p class=\"muted\">Loading…</p></div>";
    html += "<p class=\"saved-note\" id=\"savedNote\">Your work is saved only in this browser, on this computer.</p>";
    html += "<div class=\"result\" id=\"result\" aria-live=\"polite\"></div>";
    html += "<div class=\"reflect\"><h3>Reflection</h3><p>" + esc(task.reflect || REFLECT[task.type] || "What did you try first, and what happened?") + "</p><div class=\"btnrow\"><a class=\"button primary\" href=\"" + PADLET + "\" target=\"_blank\" rel=\"noopener\">Post your reflection on Padlet</a></div></div>";
    var prev = at > 0 ? list[at - 1] : null, next = at < list.length - 1 ? list[at + 1] : null;
    html += "<div class=\"pager\">" +
      (prev ? "<a class=\"button\" href=\"" + urlFor(prev) + "\">← Task " + at + ": " + esc(prev.title) + "</a>" : "<a class=\"button\" href=\"" + PAGE + "\">← All tasks</a>") +
      (next ? "<a class=\"button black\" href=\"" + urlFor(next) + "\">Task " + (at + 2) + ": " + esc(next.title) + " →</a>" : "<a class=\"button black\" href=\"" + PAGE + "\">All tasks →</a>") +
      "</div>";
    html += "</div></div>";
    // the full-width stage sits between the task bar and the two columns
    html = html.replace("<div class=\"wrap task\">", "<div class=\"wrap\"><div class=\"web-stage\" id=\"webStage\" hidden></div></div><div class=\"wrap task\">");
    $app.className = "";
    $app.innerHTML = html;
    window.scrollTo(0, 0);

    // hints
    Array.prototype.forEach.call(document.querySelectorAll("[data-hint]"), function (b) {
      b.onclick = function () {
        var h = document.getElementById("hint" + b.getAttribute("data-hint"));
        h.classList.toggle("show");
        b.textContent = (h.classList.contains("show") ? "Hide" : "Show") + " hint " + (+b.getAttribute("data-hint") + 1);
      };
    });

    if (!Progress.available()) {
      text(document.getElementById("savedNote"), "This browser does not allow saving, so your work will be lost when you close the page. Copy anything important somewhere safe.");
    }

    options.render(task);
  }

  // The full-width box above the two columns. Hidden until a task asks for it.
  function stage() {
    var el = document.getElementById("webStage");
    if (el) { el.hidden = false; $app.classList.add("has-stage"); }
    return el;
  }

  // ------------------------------------------------------------ verdict and passing
  var TITLES = { good: "Well done", bad: "Not there yet", neutral: "Note", wait: "One moment" };
  var CLASSES = { good: "ok", bad: "bad", neutral: "warn", wait: "warn" };
  function showVerdict(kind, message, title) {
    var $res = document.getElementById("result"); if (!$res) { return; }
    $res.className = "result " + (CLASSES[kind] || "warn");
    $res.innerHTML = "<h3>" + esc(title || TITLES[kind] || "") + "</h3><p>" + esc(message) + "</p>";
    if ($res.scrollIntoView) { $res.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  }
  function clearVerdict() {
    var $res = document.getElementById("result"); if (!$res) { return; }
    $res.className = "result"; $res.innerHTML = "";
  }
  function taskPassed() {
    Progress.markPassed(task.id, task);
    var cur = document.querySelector(".taskbar .steps a.cur"); if (cur) { cur.classList.add("done"); }
    var $res = document.getElementById("result");
    if ($res) {
      var h3 = $res.querySelector("h3"); if (h3) { h3.textContent = "Task complete"; }
      if (!$res.classList.contains("ok")) { $res.className = "result ok"; }
      var next = at < list.length - 1 ? list[at + 1] : null;
      var p = make("p", "next");
      if (next) {
        var a = make("a", "button black", "Next: task " + (at + 2) + ", " + next.title + " →"); a.href = urlFor(next);
        p.appendChild(document.createTextNode("Post your reflection on Padlet, then carry on. "));
        p.appendChild(a);
      } else {
        var home = make("a", "button black", "Back to all tasks →"); home.href = PAGE;
        p.appendChild(document.createTextNode("That was the last web task. Post your reflection on Padlet, then go back to the list. "));
        p.appendChild(home);
      }
      $res.appendChild(p);
    }
  }

  // ------------------------------------------------------------ load
  function errorPage(message) {
    document.title = "Web practice - Tech Practice Hub";
    $app.innerHTML = "<section class=\"notice\"><div class=\"wrap\"><h1>Could not load the tasks</h1><p>" + esc(message) + "</p><p style=\"margin-top:18px\"><a class=\"button primary\" href=\"" + PAGE + "\">Try again</a> <a class=\"button\" href=\"index.html\">Back to the hub</a></p></div></section>";
  }

  function init(opts) {
    options.render = (opts && opts.render) || function () {};
    Tasks.loadIndex().then(function (idx) {
      index = idx;
      list = Tasks.flatList(index).filter(function (e) { return TYPES.indexOf(typeOf(e)) !== -1; });
      if (!list.length) { errorPage("There are no web tasks in tasks/index.json yet."); return; }
      var wanted = taskIdFromUrl();
      at = -1;
      list.forEach(function (e, i) { if (e.id === wanted) { at = i; } });
      if (at < 0) { listPage(); return; }
      return Tasks.loadTask(wanted).then(function (t) { task = t; taskPage(); });
    }).catch(function (err) {
      errorPage(err.message + " Check that the site is running from a web server (python3 -m http.server), not opened as a file.");
    });
  }

  return {
    init: init,
    get task() { return task; },
    get index() { return index; },
    stage: stage,
    showVerdict: showVerdict,
    clearVerdict: clearVerdict,
    taskPassed: taskPassed,
    make: make, clear: clear, text: text
  };
})();
