/* Still, Life — Design System
   Draws the Panel Layers (inline SVG, smooth cubic Béziers) and the Ridge Record,
   and sizes the motion duration bars. Everything is static; nothing reacts to input. */
(function () {
  "use strict";

  var root = document.documentElement;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var KEYS = ["back", "mid", "front"];

  /* ---------- helpers ---------- */

  function cssRaw(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function num(name, fallback) {
    var n = parseFloat(cssRaw(name));
    return isNaN(n) ? fallback : n;
  }
  function ms(name) {
    var v = cssRaw(name), n = parseFloat(v);
    if (isNaN(n)) return 0;
    return /ms$/.test(v) ? n : n * 1000;
  }
  function el(name, attrs) {
    var n = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  /* ---------- ridge shapes ----------
     Each ridge is a long, gentle curve across the whole width.
     [x as a share of the width, offset from the layer's resting level as a share of the height]
     Positive offsets sit lower. Peak positions differ per layer so the crests stagger.
     The character (gentle, asymmetric, no zigzag) follows reference/panel-01. */
  var SHAPE = {
    back:  [[-0.1, 0.06], [0, 0.05], [0.14, 0.01], [0.28, -0.07], [0.42, -0.02], [0.58, 0.04], [0.75, 0.03], [0.9, -0.01], [1, 0.02], [1.1, 0.04]],
    mid:   [[-0.1, 0.05], [0, 0.05], [0.2, 0.03], [0.4, 0], [0.55, -0.05], [0.66, -0.065], [0.8, -0.02], [0.92, 0.03], [1, 0.04], [1.1, 0.05]],
    front: [[-0.1, 0], [0, 0], [0.15, -0.03], [0.3, -0.045], [0.46, 0], [0.62, 0.03], [0.76, -0.02], [0.87, -0.055], [1, -0.02], [1.1, 0]]
  };

  // Narrow screens flatten the ridges so they do not get steeper as the width shrinks.
  function damp(w) {
    var d = Math.pow(w / num("--desktop-w", 1440), num("--ridge-damp-exp", 0.6));
    return Math.min(1, Math.max(num("--ridge-damp-min", 0.4), d));
  }

  /* ---------- smooth curve: Catmull-Rom converted to cubic Béziers ---------- */

  function smooth(pts) {
    var ys = pts.map(function (p) { return p[1]; });
    var yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
    function clamp(y) { return Math.max(yMin, Math.min(yMax, y)); }
    var segs = [], d = "M" + pts[0][0].toFixed(2) + "," + pts[0][1].toFixed(2);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
      var c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
      segs.push([p1, c1, c2, p2]);
      d += " C" + c1[0].toFixed(2) + "," + c1[1].toFixed(2) + " " + c2[0].toFixed(2) + "," + c2[1].toFixed(2) + " " + p2[0].toFixed(2) + "," + p2[1].toFixed(2);
    }
    return { d: d, segs: segs, first: pts[0], last: pts[pts.length - 1] };
  }

  function yAt(curve, x) {
    var segs = curve.segs;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (x >= s[0][0] && x <= s[3][0]) {
        var lo = 0, hi = 1, t = 0.5;
        for (var k = 0; k < 24; k++) {
          t = (lo + hi) / 2;
          var u = 1 - t;
          var bx = u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0];
          if (bx < x) lo = t; else hi = t;
        }
        var v = 1 - t;
        return v * v * v * s[0][1] + 3 * v * v * t * s[1][1] + 3 * v * t * t * s[2][1] + t * t * t * s[3][1];
      }
    }
    return segs[0][0][1];
  }

  /* ---------- Ridge Record data ----------
     One invented day of presence (start minute, length in minutes), smoothed hard
     so the front ridge becomes a few round, wide hills. */
  var EVENTS = [[440, 4], [485, 22], [570, 9], [760, 18], [872, 52], [965, 6], [1155, 38], [1250, 14]];
  var DAY_MIN = 1440, STEP = 10;
  var record = null;

  function dayValues() {
    if (record) return record;
    var sigma = num("--record-smooth", 70);
    var present = new Array(DAY_MIN).fill(0);
    EVENTS.forEach(function (ev) {
      for (var m = ev[0]; m < ev[0] + ev[1] && m < DAY_MIN; m++) present[m] = 1;
    });
    var vals = [];
    for (var t = 0; t <= DAY_MIN; t += STEP) {
      var sum = 0;
      for (var m2 = Math.max(0, t - 4 * sigma); m2 < Math.min(DAY_MIN, t + 4 * sigma); m2++) {
        if (present[m2]) sum += Math.exp(-Math.pow(t - m2, 2) / (2 * sigma * sigma));
      }
      vals.push(sum);
    }
    var max = Math.max.apply(null, vals) || 1;
    record = vals.map(function (v) { return v / max; });
    return record;
  }

  function recordPoints(w, h, dm) {
    var vals = dayValues(), base = num("--record-base", 0.8), amp = num("--record-amp", 0.3);
    var pts = vals.map(function (v, i) { return [i / (vals.length - 1) * w, h * (base - amp * v * dm)]; });
    pts.unshift([-0.1 * w, pts[0][1]]);
    pts.push([1.1 * w, pts[pts.length - 1][1]]);
    return pts;
  }

  /* ---------- draw Panel Layers ---------- */

  function drawLayers(box) {
    var w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;

    box.querySelectorAll(":scope > svg").forEach(function (n) { n.remove(); });
    var dm = damp(w), bleed = num("--layer-bleed", 64), isRecord = box.hasAttribute("data-record");
    var curves = {};

    KEYS.forEach(function (key) {
      var pts = (key === "front" && isRecord)
        ? recordPoints(w, h, dm)
        : SHAPE[key].map(function (p) { return [p[0] * w, h * (num("--ridge-level-" + key, 0.5) + p[1] * dm)]; });
      var curve = smooth(pts);
      curves[key] = curve;
      if (key === "back") clipSilhouette(box, pts, w, h);

      var body = curve.d + " L" + curve.last[0].toFixed(2) + "," + (h + bleed) + " L" + curve.first[0].toFixed(2) + "," + (h + bleed) + " Z";
      var svg = el("svg", { "class": "layer layer--" + key, viewBox: "0 0 " + w + " " + h, "aria-hidden": "true", focusable: "false" });
      ["body", "veil", "frost"].forEach(function (c) { svg.appendChild(el("path", { "class": c, d: body })); });
      svg.appendChild(el("path", { "class": "ridge", d: curve.d }));
      box.insertBefore(svg, box.querySelector(":scope > .note"));
    });

    // Notes sit close to one point of a ridge
    box.querySelectorAll("[data-at]").forEach(function (n) {
      var parts = n.getAttribute("data-at").split(":"), curve = curves[parts[0]], x = parseFloat(parts[1]) * w;
      placeNote(n, x, yAt(curve, x));
    });
    var rn = box.querySelector("[data-record-note]");
    if (rn && isRecord) {
      var vals = dayValues(), peak = 0;
      vals.forEach(function (v, i) { if (v > vals[peak]) peak = i; });
      var px = peak / (vals.length - 1) * w;
      placeNote(rn, px, yAt(curves.front, px));
    }
  }

  // The silhouette smudge lives behind the layers and is cut to the area the back layer covers,
  // so it can only be seen through a layer, never in the open space above the ridge.
  function clipSilhouette(box, backPts, w, h) {
    var frame = box.parentElement, sil = frame && frame.querySelector(":scope > .silhouette");
    if (!sil) return;
    var inset = parseFloat(cssRaw("--silhouette-inset")) || 0;
    var c = smooth(backPts.map(function (p) { return [p[0], p[1] + inset]; }));
    var d = c.d + " L" + c.last[0].toFixed(2) + "," + (h + 1) + " L" + c.first[0].toFixed(2) + "," + (h + 1) + " Z";
    sil.style.clipPath = 'path("' + d + '")';
  }

  function placeNote(n, x, y) {
    n.style.left = x + "px";
    n.style.top = (y - 16) + "px";
    n.style.transform = "translate(-50%, -100%)";
  }

  var boxes = document.querySelectorAll("[data-layers]");
  function drawAll() { boxes.forEach(drawLayers); }
  drawAll();
  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(function () { drawAll(); });
    boxes.forEach(function (b) { ro.observe(b); });
  } else {
    window.addEventListener("resize", drawAll);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawAll);

  /* ---------- motion duration bars ---------- */

  var max = ms("--dur-fade") || 1;
  document.querySelectorAll(".timeline__bar[data-dur]").forEach(function (bar) {
    bar.style.setProperty("--w", (ms(bar.getAttribute("data-dur")) / max * 100) + "%");
  });
})();
