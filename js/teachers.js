/*
  js/teachers.js — builds the "For teachers" page (teachers.html) from
  tasks/index.json and every task file. Nothing here is secret: the same
  JSON files are what the students' browsers download. It exists so the
  teacher can see a whole week — briefs, tests or worlds, hints, solutions —
  on one page instead of opening each task.
*/
(function () {
  "use strict";

  var list = document.getElementById("teachList");
  var count = document.getElementById("teachCount");

  function make(tag, className, content) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (content != null) { node.textContent = content; }
    return node;
  }

  function section(parent, title) {
    parent.appendChild(make("h4", null, title));
  }

  function pre(parent, code, sol) {
    parent.appendChild(make("pre", sol ? "sol" : null, code));
  }

  function briefParas(parent, brief) {
    var wrap = make("div", "brief");
    String(brief || "").split(/\n\n+/).forEach(function (para) {
      var fenced = /^```\n?([\s\S]*?)\n?```$/.exec(para.trim());
      if (fenced) { wrap.appendChild(make("pre", null, fenced[1])); }
      else { wrap.appendChild(make("p", null, para)); }
    });
    parent.appendChild(wrap);
  }

  function pageFor(type) {
    if (type === "console" || type === "karel") { return "practice-python.html"; }
    if (type === "ai") { return "practice-ai.html"; }
    return "practice-web.html";
  }

  function renderTask(task, entry) {
    var card = make("article", "teach-task");
    card.id = task.id;
    var h = make("h3", null, task.title);
    card.appendChild(h);
    var meta = make("p", "teach-meta");
    meta.appendChild(document.createTextNode("Week " + task.week + " · type "));
    meta.appendChild(make("code", null, task.type));
    meta.appendChild(document.createTextNode(" · concepts: " + (task.concepts || []).join(", ") + " · "));
    var link = make("a", "teach-link", "open the task ↗");
    link.href = pageFor(task.type) + "?task=" + encodeURIComponent(task.id);
    link.target = "_blank";
    meta.appendChild(link);
    card.appendChild(meta);

    section(card, "Brief");
    briefParas(card, task.brief);

    if (task.vocabulary && task.vocabulary.length) {
      section(card, "Vocabulary");
      var ul = make("ul");
      task.vocabulary.forEach(function (v) { ul.appendChild(make("li", null, v.term + " — " + v.gloss)); });
      card.appendChild(ul);
    }

    if (task.tests && task.tests.length) {
      section(card, "Tests (" + task.tests.length + ")");
      var tl = make("ol");
      task.tests.forEach(function (t) {
        var stdin = t.stdin && t.stdin.length ? " · input: " + t.stdin.map(function (s) { return JSON.stringify(s); }).join(", ") : "";
        tl.appendChild(make("li", null, t.name + stdin + " · " + (t.match || "exact") + ": " + JSON.stringify(t.expectedShown != null ? t.expectedShown : t.expectedStdout)));
      });
      card.appendChild(tl);
    }
    if (task.worlds || task.world) {
      var worlds = task.worlds || [{ name: "World", world: task.world, goal: task.goal }];
      section(card, "Worlds (" + worlds.length + ")");
      var wl = make("ul");
      worlds.forEach(function (w) {
        var g = w.goal || {};
        var goalText = (g.karel ? "Karel ends at column " + g.karel.col + ", row " + g.karel.row : "Karel may end anywhere") +
          (g.beepers ? (g.beepers.length ? "; beepers at " + g.beepers.map(function (b) { return "(" + b.col + "," + b.row + ")×" + (b.count || 1); }).join(" ") : "; no beepers left") : "");
        wl.appendChild(make("li", null, (w.name || "World") + " — " + w.world.cols + "×" + w.world.rows + ", " + (w.world.beepers || []).length + " beeper square(s), bag " + w.world.karelBeepers + " · goal: " + goalText));
      });
      card.appendChild(wl);
    }
    if (task.checks) {
      section(card, "Checklist");
      var cl = make("ol");
      task.checks.forEach(function (c) { cl.appendChild(make("li", null, c.label)); });
      card.appendChild(cl);
    }
    if (task.problems) {
      section(card, "Problems on the sample page (" + task.sample + ")");
      var pl = make("ul");
      task.problems.forEach(function (p) {
        var li = make("li", p.decoy ? "decoy" : null, p.label + (p.decoy ? " — NOT a real problem (decoy)" : " — " + p.why));
        pl.appendChild(li);
      });
      card.appendChild(pl);
    }
    if (task.matching) {
      section(card, "Matching answers");
      var ml = make("ul");
      task.matching.forEach(function (m) { ml.appendChild(make("li", null, m.term + " = " + m.definition)); });
      card.appendChild(ml);
    }
    if (task.text) {
      section(card, "Text (" + task.text.trim().split(/\s+/).length + " words) · summary " + task.minWords + "–" + task.maxWords + " words");
      pre(card, task.text);
    }
    if (task.reflectPrompt || task.writingPrompt) {
      section(card, "Writing prompt");
      card.appendChild(make("p", null, task.reflectPrompt || task.writingPrompt));
    }

    if (task.hints && task.hints.length) {
      section(card, "Hints, in order");
      var hl = make("ol");
      task.hints.forEach(function (hint) { hl.appendChild(make("li", null, hint)); });
      card.appendChild(hl);
    }

    var solution = task.solution || task.solutionHtml || task.solutionCss;
    if (solution) {
      var det = make("details");
      det.className = "solution";
      det.appendChild(make("summary", null, "Solution"));
      if (task.solution) { pre(det, task.solution, true); }
      if (task.solutionHtml) { section(det, "HTML"); pre(det, task.solutionHtml, true); }
      if (task.solutionCss) { section(det, "CSS"); pre(det, task.solutionCss, true); }
      card.appendChild(det);
    }
    return card;
  }

  Tasks.loadIndex().then(function (index) {
    while (list.firstChild) { list.removeChild(list.firstChild); }
    var total = 0;
    var weekPromises = (index.weeks || []).map(function (week) {
      var block = make("section", "teach-week");
      block.appendChild(make("h2", null, "Week " + week.week + " · " + week.title));
      list.appendChild(block);
      return Promise.all((week.tasks || []).map(function (entry) {
        return Tasks.loadTask(entry.id).then(function (task) { return { task: task, entry: entry }; });
      })).then(function (items) {
        items.forEach(function (it) { block.appendChild(renderTask(it.task, it.entry)); total++; });
      });
    });
    return Promise.all(weekPromises).then(function () {
      count.textContent = total + " tasks in " + (index.weeks || []).length + " weeks";
    });
  }).catch(function (err) {
    list.textContent = "Could not load the tasks: " + err.message + ". Run the site from a web server, not as a file.";
  });

  document.getElementById("expandAll").addEventListener("click", function () {
    document.querySelectorAll("details.solution").forEach(function (d) { d.open = true; });
  });
  document.getElementById("collapseAll").addEventListener("click", function () {
    document.querySelectorAll("details.solution").forEach(function (d) { d.open = false; });
  });
})();
