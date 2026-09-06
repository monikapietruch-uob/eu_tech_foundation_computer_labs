/*
  js/karel-render.js — draws a Karel world on a <canvas>.

  new KarelRenderer(canvas) gives you an object with:
    setWorld(world, goal)   the static parts: size, walls, and the goal to ghost
    setState(state)         the moving parts: {col, row, dir, beepers: {"c,r": n}, bag}
    setShowGoal(true/false) draw the goal as a faint overlay
    fit()                   resize to the container (called automatically on resize)
    draw()

  Columns count from 1 at the left, rows from 1 at the bottom (Code in Place
  convention), so row 1 is drawn at the bottom of the canvas. Colours come
  from the site palette in css/style.css.
*/
var KarelRenderer = (function () {
  "use strict";

  var COLOURS = {
    paper: "#ffffff",
    grid: "#d9deea",
    gridDot: "#b7bfd4",
    wall: "#1a1a2e",
    beeper: "#C8102E",
    beeperText: "#ffffff",
    karel: "#1a1a2e",
    karelNose: "#C8102E",
    karelEye: "#ffffff",
    ghost: "rgba(26, 26, 46, 0.28)",
    ghostBeeper: "rgba(200, 16, 46, 0.45)"
  };

  var MAX_HEIGHT = 380;   // px; keeps a tall world from pushing the editor off screen

  function KarelRenderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.world = null;
    this.goal = null;
    this.state = null;
    this.showGoal = true;
    this.cell = 40;
    var self = this;
    this._onResize = function () { self.fit(); self.draw(); };
    window.addEventListener("resize", this._onResize);
  }

  KarelRenderer.prototype.setWorld = function (world, goal) {
    this.world = world;
    this.goal = goal || null;
    this.state = initialState(world);
    this.fit();
    this.draw();
  };

  KarelRenderer.prototype.setState = function (state) {
    this.state = state;
    this.draw();
  };

  KarelRenderer.prototype.setShowGoal = function (flag) {
    this.showGoal = !!flag;
    this.draw();
  };

  function initialState(world) {
    var beepers = {};
    (world.beepers || []).forEach(function (b) {
      beepers[b.col + "," + b.row] = b.count == null ? 1 : b.count;
    });
    var k = world.karel || {};
    return {
      col: k.col || 1, row: k.row || 1, dir: k.dir || "east", beepers: beepers,
      bag: world.karelBeepers === "infinite" || world.karelBeepers == null ? null : world.karelBeepers
    };
  }
  KarelRenderer.initialState = initialState;

  // Size the canvas to its container's width, keeping cells square.
  KarelRenderer.prototype.fit = function () {
    if (!this.world) { return; }
    var parent = this.canvas.parentNode;
    var width = 400;
    if (parent) {
      var style = window.getComputedStyle(parent);
      width = parent.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
    }
    width = Math.max(200, width - 4);                   // 4 = the border drawn around the world
    var cols = this.world.cols, rows = this.world.rows;
    // On a small laptop keep the world to under half the window height so
    // the editor below it stays in view.
    var maxHeight = Math.min(MAX_HEIGHT, Math.max(180, Math.floor(window.innerHeight * 0.42)));
    var cell = Math.floor(Math.min(width / cols, maxHeight / rows));
    cell = Math.max(cell, 22);
    this.cell = cell;
    var dpr = window.devicePixelRatio || 1;
    var w = cell * cols + 4, h = cell * rows + 4;   // +4 for the border
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // Top-left pixel corner of a cell.
  KarelRenderer.prototype.origin = function (col, row) {
    return { x: 2 + (col - 1) * this.cell, y: 2 + (this.world.rows - row) * this.cell };
  };

  KarelRenderer.prototype.draw = function () {
    if (!this.world || !this.state) { return; }
    var ctx = this.ctx, cell = this.cell, world = this.world;
    var W = cell * world.cols, H = cell * world.rows;
    ctx.clearRect(0, 0, W + 4, H + 4);

    ctx.fillStyle = COLOURS.paper;
    ctx.fillRect(2, 2, W, H);

    // grid lines, with a small dot at each intersection like Code in Place
    ctx.strokeStyle = COLOURS.grid;
    ctx.lineWidth = 1;
    for (var c = 1; c < world.cols; c++) {
      var x = 2 + c * cell + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, 2 + H); ctx.stroke();
    }
    for (var r = 1; r < world.rows; r++) {
      var y = 2 + r * cell + 0.5;
      ctx.beginPath(); ctx.moveTo(2, y); ctx.lineTo(2 + W, y); ctx.stroke();
    }
    ctx.fillStyle = COLOURS.gridDot;
    for (var cc = 1; cc <= world.cols; cc++) {
      for (var rr = 1; rr <= world.rows; rr++) {
        var o = this.origin(cc, rr);
        ctx.beginPath(); ctx.arc(o.x + cell / 2, o.y + cell / 2, Math.max(1.5, cell * 0.04), 0, Math.PI * 2); ctx.fill();
      }
    }

    if (this.showGoal && this.goal) { this.drawGoal(); }

    // beepers
    var self = this;
    Object.keys(this.state.beepers || {}).forEach(function (key) {
      var n = self.state.beepers[key];
      if (n > 0) {
        var parts = key.split(",");
        self.drawBeeper(+parts[0], +parts[1], n, false);
      }
    });

    // walls: explicit ones, then the border
    ctx.strokeStyle = COLOURS.wall;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(3, cell * 0.11);
    (world.walls || []).forEach(function (wall) {
      var o = self.origin(wall.col, wall.row);
      ctx.beginPath();
      if (wall.side === "north") { ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + cell, o.y); }
      else if (wall.side === "south") { ctx.moveTo(o.x, o.y + cell); ctx.lineTo(o.x + cell, o.y + cell); }
      else if (wall.side === "west") { ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y + cell); }
      else { ctx.moveTo(o.x + cell, o.y); ctx.lineTo(o.x + cell, o.y + cell); }
      ctx.stroke();
    });
    ctx.lineWidth = Math.max(3, cell * 0.11);
    ctx.strokeRect(2, 2, W, H);

    this.drawKarel(this.state.col, this.state.row, this.state.dir, false);
  };

  KarelRenderer.prototype.drawGoal = function () {
    var goal = this.goal, self = this;
    if (goal.beepers) {
      goal.beepers.forEach(function (b) {
        self.drawBeeper(b.col, b.row, b.count == null ? 1 : b.count, true);
      });
    }
    if (goal.karel) {
      this.drawKarel(goal.karel.col, goal.karel.row, goal.karel.dir || (this.state ? this.state.dir : "east"), true);
    }
  };

  KarelRenderer.prototype.drawBeeper = function (col, row, count, ghost) {
    var ctx = this.ctx, cell = this.cell, o = this.origin(col, row);
    var cx = o.x + cell / 2, cy = o.y + cell / 2, radius = cell * 0.27;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    if (ghost) {
      ctx.strokeStyle = COLOURS.ghostBeeper;
      ctx.lineWidth = Math.max(2, cell * 0.05);
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = COLOURS.beeper;
      ctx.fill();
    }
    if (count > 1) {
      ctx.fillStyle = ghost ? COLOURS.ghostBeeper : COLOURS.beeperText;
      ctx.font = "bold " + Math.round(cell * 0.32) + "px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(count), cx, cy + 1);
    }
  };

  // Karel: a rounded square body with a red "nose" on the side it faces,
  // and a single eye near the nose so the direction reads at a glance.
  KarelRenderer.prototype.drawKarel = function (col, row, dir, ghost) {
    var ctx = this.ctx, cell = this.cell, o = this.origin(col, row);
    var cx = o.x + cell / 2, cy = o.y + cell / 2;
    var size = cell * 0.58, half = size / 2, radius = size * 0.22;
    var angle = { east: 0, north: -Math.PI / 2, west: Math.PI, south: Math.PI / 2 }[dir] || 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // body
    ctx.beginPath();
    ctx.moveTo(-half + radius, -half);
    ctx.lineTo(half - radius, -half);
    ctx.quadraticCurveTo(half, -half, half, -half + radius);
    ctx.lineTo(half, half - radius);
    ctx.quadraticCurveTo(half, half, half - radius, half);
    ctx.lineTo(-half + radius, half);
    ctx.quadraticCurveTo(-half, half, -half, half - radius);
    ctx.lineTo(-half, -half + radius);
    ctx.quadraticCurveTo(-half, -half, -half + radius, -half);
    ctx.closePath();
    if (ghost) {
      ctx.strokeStyle = COLOURS.ghost;
      ctx.lineWidth = Math.max(2, cell * 0.05);
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = COLOURS.karel;
      ctx.fill();
    }

    // nose: a triangle pointing forward (forward is +x before rotation)
    ctx.beginPath();
    ctx.moveTo(half - size * 0.05, -size * 0.22);
    ctx.lineTo(half + size * 0.28, 0);
    ctx.lineTo(half - size * 0.05, size * 0.22);
    ctx.closePath();
    ctx.fillStyle = ghost ? COLOURS.ghost : COLOURS.karelNose;
    ctx.fill();

    // eye
    if (!ghost) {
      ctx.beginPath();
      ctx.arc(size * 0.18, -size * 0.12, size * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = COLOURS.karelEye;
      ctx.fill();
    }
    ctx.restore();
  };

  return KarelRenderer;
})();
