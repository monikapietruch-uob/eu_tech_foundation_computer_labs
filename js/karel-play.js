/*
  js/karel-play.js — plays a Karel trace back on a renderer, step by step.

  The Python side (js/karel-api.py) records every action Karel took as a
  list. This player walks through that list at a chosen speed and updates
  the renderer, so animation is completely separate from running the code.

    var player = new KarelPlayer(renderer);
    player.load(initialState, trace)     start again from the beginning
    player.play()                        run at the current speed
    player.pause()
    player.step()                        one action forward (pauses first)
    player.setSpeed("slow"|"normal"|"fast"|"instant")
    player.onUpdate(fn)                  fn({position, total, action}) after each step
    player.onDone(fn)                    fn() when the last step has been shown

  Each trace entry looks like {a, col, row, dir} and, for put/pick,
  {cell: "c,r", count, bag} with the new count for that square.
*/
var KarelPlayer = (function () {
  "use strict";

  var SPEED_MS = { slow: 550, normal: 180, fast: 45, instant: 0 };

  function KarelPlayer(renderer) {
    this.renderer = renderer;
    this.initial = null;
    this.trace = [];
    this.state = null;
    this.position = 0;
    this.speed = "normal";
    this.timer = null;
    this.playing = false;
    this.updateListeners = [];
    this.doneListeners = [];
  }

  function copyState(s) {
    var beepers = {};
    Object.keys(s.beepers || {}).forEach(function (k) { beepers[k] = s.beepers[k]; });
    return { col: s.col, row: s.row, dir: s.dir, beepers: beepers, bag: s.bag };
  }

  KarelPlayer.prototype.load = function (initial, trace) {
    this.pause();
    this.initial = initial;
    this.trace = trace || [];
    this.state = copyState(initial);
    this.position = 0;
    this.renderer.setState(this.state);
    this.emitUpdate(null);
  };

  KarelPlayer.prototype.setSpeed = function (speed) {
    this.speed = SPEED_MS.hasOwnProperty(speed) ? speed : "normal";
    if (this.playing) { this.pause(); this.play(); }
  };

  KarelPlayer.prototype.applyStep = function (entry) {
    this.state.col = entry.col;
    this.state.row = entry.row;
    this.state.dir = entry.dir;
    if (entry.cell != null) {
      if (entry.count > 0) { this.state.beepers[entry.cell] = entry.count; }
      else { delete this.state.beepers[entry.cell]; }
      this.state.bag = entry.bag;
    }
  };

  KarelPlayer.prototype.step = function () {
    this.pause();
    this.advance();
  };

  // Show one more action. Returns false when there is nothing left.
  KarelPlayer.prototype.advance = function () {
    if (this.position >= this.trace.length) { return false; }
    var entry = this.trace[this.position];
    this.applyStep(entry);
    this.position++;
    this.renderer.setState(this.state);
    this.emitUpdate(entry);
    if (this.position >= this.trace.length) { this.emitDone(); }
    return true;
  };

  // People who ask their system for reduced motion get no animation: play
  // jumps straight to the end state. The Step button still works.
  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }

  KarelPlayer.prototype.play = function () {
    var self = this;
    if (this.position >= this.trace.length) { this.emitDone(); return; }
    if (this.speed === "instant" || reducedMotion()) {
      while (this.position < this.trace.length - 1) {
        this.applyStep(this.trace[this.position]);
        this.position++;
      }
      this.advance();          // the last step draws and fires done
      return;
    }
    this.playing = true;
    var tick = function () {
      if (!self.playing) { return; }
      if (!self.advance()) { self.playing = false; return; }
      if (self.position >= self.trace.length) { self.playing = false; return; }
      self.timer = setTimeout(tick, SPEED_MS[self.speed]);
    };
    this.timer = setTimeout(tick, SPEED_MS[this.speed]);
  };

  KarelPlayer.prototype.pause = function () {
    this.playing = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  };

  KarelPlayer.prototype.restart = function () {
    this.load(this.initial, this.trace);
  };

  KarelPlayer.prototype.isFinished = function () {
    return this.position >= this.trace.length;
  };

  KarelPlayer.prototype.onUpdate = function (fn) { this.updateListeners.push(fn); };
  KarelPlayer.prototype.onDone = function (fn) { this.doneListeners.push(fn); };

  KarelPlayer.prototype.emitUpdate = function (entry) {
    var info = { position: this.position, total: this.trace.length, action: entry ? entry.a : null, playing: this.playing };
    this.updateListeners.forEach(function (fn) { fn(info); });
  };
  KarelPlayer.prototype.emitDone = function () {
    this.playing = false;
    this.doneListeners.forEach(function (fn) { fn(); });
  };

  return KarelPlayer;
})();
