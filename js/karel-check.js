/*
  js/karel-check.js — decides whether a Karel program did the job, and says
  exactly what is wrong when it did not.

    KarelCheck.compare(goal, finalState) -> { passed: boolean, messages: [string] }

  goal comes from the task file (see tasks/README.md):
    goal.karel    {col, row, dir?}  where Karel must finish (omit: anywhere)
    goal.beepers  [{col, row, count}]  every beeper that must be on the floor;
                  squares not listed must be empty (omit: beepers not checked)
    goal.checkKarelDirection  true to also check the way Karel faces
  finalState is what js/karel-api.py returns: {col, row, dir, beepers: {"c,r": n}}

  The messages are for the student, so they say where and how many, in
  plain English, and they lead with what went right.
*/
var KarelCheck = (function () {
  "use strict";

  function place(col, row) { return "column " + col + ", row " + row; }

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function compare(goal, finalState) {
    goal = goal || {};
    var karelOk = true, karelMessages = [];
    var beepersOk = true, beeperMessages = [];

    if (goal.karel) {
      var g = goal.karel;
      if (finalState.col !== g.col || finalState.row !== g.row) {
        karelOk = false;
        karelMessages.push("Karel should finish on " + place(g.col, g.row) +
          ", but Karel is on " + place(finalState.col, finalState.row) + ".");
      } else if (goal.checkKarelDirection && g.dir && finalState.dir !== g.dir) {
        karelOk = false;
        karelMessages.push("Karel is in the right place but should face " + g.dir +
          ", and is facing " + finalState.dir + ".");
      }
    }

    if (goal.beepers) {
      var want = {};
      goal.beepers.forEach(function (b) { want[b.col + "," + b.row] = b.count == null ? 1 : b.count; });
      var have = finalState.beepers || {};
      var keys = {};
      Object.keys(want).forEach(function (k) { keys[k] = true; });
      Object.keys(have).forEach(function (k) { keys[k] = true; });
      Object.keys(keys).sort(function (a, b) {
        var pa = a.split(",").map(Number), pb = b.split(",").map(Number);
        return pa[1] - pb[1] || pa[0] - pb[0];
      }).forEach(function (k) {
        var w = want[k] || 0, h = have[k] || 0;
        if (w === h) { return; }
        beepersOk = false;
        var parts = k.split(","), where = place(parts[0], parts[1]);
        if (w === 0) {
          beeperMessages.push(h === 1 ? "There is still a beeper on " + where + "."
                                      : "There are still " + plural(h, "beeper") + " on " + where + ".");
        } else if (h === 0) {
          beeperMessages.push(where.charAt(0).toUpperCase() + where.slice(1) + " should have " + plural(w, "beeper") + ", but it has none.");
        } else {
          beeperMessages.push(where.charAt(0).toUpperCase() + where.slice(1) + " should have " + plural(w, "beeper") + ", but it has " + h + ".");
        }
      });
    }

    var passed = karelOk && beepersOk;
    var messages = [];
    if (!passed) {
      if (karelOk && goal.karel && !beepersOk) {
        messages.push("Karel is in the right place, but " + lowerFirst(beeperMessages[0]));
        messages = messages.concat(beeperMessages.slice(1, 3));
      } else if (beepersOk && goal.beepers && !karelOk) {
        messages.push("The beepers are all correct, but " + lowerFirst(karelMessages[0]));
      } else {
        messages = karelMessages.concat(beeperMessages.slice(0, 3));
      }
      if (beeperMessages.length > 3) {
        messages.push("… and " + (beeperMessages.length - 3) + " more squares are not right.");
      }
    }
    return { passed: passed, messages: messages };
  }

  function lowerFirst(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

  return { compare: compare };
})();
