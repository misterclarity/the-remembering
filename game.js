/* The Remembering — a quiet game of self-discovery.
 *
 * Seven gestures are hidden in the player's own body. The game never
 * names them; it only answers when they happen. There are no stats,
 * no score, no failure — only what the player does, reflected back.
 *
 * Gesture engine: samples Quest 2 controller poses relative to the
 * headset every frame; sustained poses, traced circles, accumulated
 * spin and stillness each resolve into a discovery exactly once.
 */
/* global AFRAME, THREE */

(function () {
'use strict';

var GESTURES = [
  { id: 'reach',  word: 'Upward',  note: 523,
    lines: 'You reached before you knew why.\nPart of you has always lived upward.',
    hint:  'The sky has been waiting all this time.' },
  { id: 'heart',  word: 'Tender',  note: 440,
    lines: 'You held your own heart like something found.\nThere is a tenderness in you that no one taught.',
    hint:  'Something small glows beneath your ribs.' },
  { id: 'wide',   word: 'Vast',    note: 392,
    lines: 'You opened your arms to all of it.\nYou are larger than the shape you arrived in.',
    hint:  'How much of this place could you hold?' },
  { id: 'ground', word: 'Rooted',  note: 330,
    lines: 'You bent low, and the ground rose to meet you.\nYou belong here. You always did.',
    hint:  'The earth remembers everyone who touches it.' },
  { id: 'circle', word: 'Whole',   note: 294,
    lines: 'You drew the shape that has no ending.\nSomething in you is already whole.',
    hint:  'Everything that ends begins.' },
  { id: 'still',  word: 'Still',   note: 262,
    lines: 'You did nothing, perfectly.\nYou are enough, even motionless.',
    hint:  'Even silence is saying something.' },
  { id: 'spin',   word: 'Joyful',  note: 587,
    lines: 'You turned, and the world turned with you.\nJoy was never something you had to earn.',
    hint:  'The horizon is a circle, too.' }
];

function byId (id) {
  for (var i = 0; i < GESTURES.length; i++) if (GESTURES[i].id === id) return GESTURES[i];
  return null;
}

function wrapAngle (a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

AFRAME.registerComponent('soul-game', {

  init: function () {
    var self = this;
    var sceneEl = this.el;

    this.head  = document.getElementById('head');
    this.hands = { L: document.getElementById('handL'), R: document.getElementById('handR') };
    this.msgEl = document.getElementById('msg');
    this.skyEl = document.getElementById('sky');

    // gesture state
    this.done = {};
    this.count = 0;
    this.hold = { reach: 0, heart: 0, wide: 0, ground: 0, still: 0 };
    this.trace = { L: [], R: [] };            // hand paths in head-yaw frame, for circle detection
    this.sampleT = 0;
    this.evalT = 0;
    this.yawAcc = 0;
    this.lastYaw = null;
    this.speed = { L: 0, R: 0 };
    this.lastHandPos = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this.connected = { L: false, R: false };
    this.cool = 0;                            // seconds of post-discovery quiet
    this.started = false;
    this.endAt = null;
    this.ended = false;
    this.time = 0;
    this.lastEventT = 0;

    // message fade queue
    this.queue = [];
    this.msgState = 'idle';
    this.msgOpacity = 0;
    this.msgHold = 0;

    // world animation
    this.systems = [];                        // particle systems: { step(dt, t) }
    this.lerps = [];                          // { obj, prop, target, rate }
    this.skyColor  = new THREE.Color('#0a0e18');
    this.skyTarget = new THREE.Color('#0a0e18');
    this.fogTarget = 0.045;
    this.orbit = null;

    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.v3 = new THREE.Vector3();
    this.vt = new THREE.Vector3();
    this.q1 = new THREE.Quaternion();
    this.e1 = new THREE.Euler();

    this.fx = {
      reach:  function ()     { self.fxReach(); },
      heart:  function ()     { self.fxHeart(); },
      wide:   function ()     { self.fxWide(); },
      ground: function ()     { self.fxGround(); },
      circle: function (info) { self.fxCircle(info); },
      still:  function ()     { self.fxStill(); },
      spin:   function ()     { self.fxSpin(); }
    };

    ['L', 'R'].forEach(function (k) {
      self.hands[k].addEventListener('controllerconnected', function () { self.connected[k] = true; });
      self.hands[k].addEventListener('controllerdisconnected', function () { self.connected[k] = false; });
    });

    sceneEl.addEventListener('enter-vr', function () {
      self.started = true;
      self.lastEventT = self.time;
      self.ensureAudio();
      var intro = document.getElementById('intro');
      if (intro) intro.style.display = 'none';
      setTimeout(function () {
        self.showText('You awaken in a quiet place.\nNothing here will tell you what to do.\nYour hands remember more than you know.', 7500);
      }, 2500);
    });

    window.addEventListener('pointerdown', function () { self.ensureAudio(); }, { once: true });

    // desktop preview: keys 1-7 force each discovery in order
    window.addEventListener('keydown', function (e) {
      var i = '1234567'.indexOf(e.key);
      if (i >= 0) {
        self.started = true;
        self.ensureAudio();
        self.discover(GESTURES[i], null);
      }
    });

    this.buildWorld();
  },

  /* ------------------------------------------------ world dressing */

  makePoints: function (count, color, size, opacity) {
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      color: color, size: size, transparent: true, opacity: opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    mat.fog = false;
    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.el.object3D.add(pts);
    return { geo: geo, pos: pos, mat: mat, pts: pts };
  },

  buildWorld: function () {
    var i;

    // faint stars, waiting to be woken by 'reach'
    var stars = this.makePoints(750, '#aebfff', 0.45, 0.35);
    for (i = 0; i < 750; i++) {
      var u = Math.random() * 2 - 1;
      var az = Math.random() * Math.PI * 2;
      var y = Math.abs(u);                             // upper hemisphere bias
      var horiz = Math.sqrt(Math.max(0, 1 - y * y));
      var r = 78 + Math.random() * 8;
      stars.pos[i * 3]     = Math.cos(az) * horiz * r;
      stars.pos[i * 3 + 1] = y * r;
      stars.pos[i * 3 + 2] = Math.sin(az) * horiz * r;
    }
    stars.geo.attributes.position.needsUpdate = true;
    this.starsMat = stars.mat;

    // drifting motes near the player
    var dust = this.makePoints(300, '#5a7a6a', 0.02, 0.5);
    var dvel = [];
    for (i = 0; i < 300; i++) {
      dust.pos[i * 3]     = (Math.random() - 0.5) * 24;
      dust.pos[i * 3 + 1] = Math.random() * 6 + 0.2;
      dust.pos[i * 3 + 2] = (Math.random() - 0.5) * 24;
      dvel.push([(Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.06]);
    }
    dust.geo.attributes.position.needsUpdate = true;
    this.systems.push({ step: function (dt) {
      for (var j = 0; j < 300; j++) {
        dust.pos[j * 3]     += dvel[j][0] * dt;
        dust.pos[j * 3 + 1] += dvel[j][1] * dt;
        dust.pos[j * 3 + 2] += dvel[j][2] * dt;
        if (dust.pos[j * 3 + 1] < 0.1) dust.pos[j * 3 + 1] = 6;
        if (dust.pos[j * 3 + 1] > 6.2) dust.pos[j * 3 + 1] = 0.2;
        if (Math.abs(dust.pos[j * 3]) > 12)     dust.pos[j * 3]     *= -0.98;
        if (Math.abs(dust.pos[j * 3 + 2]) > 12) dust.pos[j * 3 + 2] *= -0.98;
      }
      dust.geo.attributes.position.needsUpdate = true;
    } });
  },

  /* ------------------------------------------------ main loop */

  tick: function (t, dtms) {
    var dt = Math.min(dtms / 1000, 0.05) || 0.016;
    this.time += dt;

    this.tickMsg(dt);
    this.tickWorld(dt, this.time);

    if (this.endAt !== null && !this.ended && this.time >= this.endAt) this.runEnding();
    if (this.cool > 0) this.cool -= dt;

    this.sense(dt, this.time);
    this.maybeHint();
  },

  tickWorld: function (dt, now) {
    var k = 1 - Math.exp(-dt * 0.35);
    this.skyColor.lerp(this.skyTarget, k);
    var mesh = this.skyEl.getObject3D('mesh');
    if (mesh) mesh.material.color.copy(this.skyColor);
    var fog = this.el.object3D.fog;
    if (fog) {
      fog.color.copy(this.skyColor);
      fog.density += (this.fogTarget - fog.density) * (1 - Math.exp(-dt * 0.3));
    }
    for (var i = 0; i < this.lerps.length; i++) {
      var L = this.lerps[i];
      L.obj[L.prop] += (L.target - L.obj[L.prop]) * (1 - Math.exp(-L.rate * dt));
    }
    for (i = 0; i < this.systems.length; i++) this.systems[i].step(dt, now);
    if (this.orbit) this.orbit.object3D.rotation.y += dt * 0.1;
  },

  /* ------------------------------------------------ gesture sensing */

  sense: function (dt, now) {
    if (!this.started || this.ended) return;

    var hp = this.head.object3D.getWorldPosition(this.v1);
    this.head.object3D.getWorldQuaternion(this.q1);
    this.e1.setFromQuaternion(this.q1, 'YXZ');
    var yaw = this.e1.y;

    // --- spin: accumulated same-direction turning, slowly decaying
    if (this.lastYaw !== null) {
      var d = wrapAngle(yaw - this.lastYaw);
      if (Math.abs(d) < 1) this.yawAcc = (this.yawAcc + d) * Math.exp(-dt * 0.12);
    }
    this.lastYaw = yaw;
    if (!this.done.spin && this.cool <= 0 && Math.abs(this.yawAcc) > 6.0) {
      this.yawAcc = 0;
      this.discover(byId('spin'), null);
      return;
    }

    var L = this.connected.L ? this.hands.L.object3D.getWorldPosition(this.v2) : null;
    var R = this.connected.R ? this.hands.R.object3D.getWorldPosition(this.v3) : null;

    // hand speeds (EMA) for stillness
    var self = this;
    [['L', L], ['R', R]].forEach(function (pair) {
      var key = pair[0], p = pair[1];
      if (!p) { self.speed[key] = 1; return; }
      var inst = p.distanceTo(self.lastHandPos[key]) / dt;
      self.lastHandPos[key].copy(p);
      if (inst < 20) self.speed[key] = self.speed[key] * 0.9 + inst * 0.1;
    });

    if (this.cool <= 0 && L && R) {
      var relLy = L.y - hp.y;
      var relRy = R.y - hp.y;
      var handDist = L.distanceTo(R);
      var horizL = Math.hypot(L.x - hp.x, L.z - hp.z);
      var horizR = Math.hypot(R.x - hp.x, R.z - hp.z);

      this.holdStep('reach',
        relLy > 0.12 && relRy > 0.12,
        1.1, dt);

      this.holdStep('heart',
        handDist < 0.17 &&
        relLy < -0.15 && relLy > -0.6 &&
        relRy < -0.15 && relRy > -0.6 &&
        horizL < 0.45 && horizR < 0.45,
        1.1, dt);

      this.holdStep('wide',
        handDist > 1.15 &&
        Math.abs(relLy + 0.3) < 0.38 &&
        Math.abs(relRy + 0.3) < 0.38,
        1.1, dt);

      this.holdStep('still',
        this.speed.L < 0.04 && this.speed.R < 0.04,
        5.0, dt);
    }

    if (this.cool <= 0 && (L || R)) {
      this.holdStep('ground',
        (L && L.y < 0.35) || (R && R.y < 0.35),
        0.8, dt);
    }

    // --- circle tracing (head-yaw frame so it survives the player turning)
    this.sampleT += dt;
    if (this.sampleT >= 0.04) {
      this.sampleT = 0;
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      [['L', L], ['R', R]].forEach(function (pair) {
        var p = pair[1];
        if (!p) return;
        var dx = p.x - hp.x, dy = p.y - hp.y, dz = p.z - hp.z;
        var arr = self.trace[pair[0]];
        arr.push({ t: now, x: dx * cy - dz * sy, y: dy, z: dx * sy + dz * cy });
        while (arr.length && arr[0].t < now - 2.6) arr.shift();
      });
    }

    this.evalT += dt;
    if (this.evalT >= 0.2) {
      this.evalT = 0;
      if (!this.done.circle && this.cool <= 0) {
        var hit = this.circleSweep(this.trace.L) || this.circleSweep(this.trace.R);
        if (hit) {
          hit.headPos = hp.clone();
          hit.yaw = yaw;
          this.trace.L.length = 0;
          this.trace.R.length = 0;
          this.discover(byId('circle'), hit);
        }
      }
    }
  },

  holdStep: function (id, cond, threshold, dt) {
    if (this.done[id]) return;
    this.hold[id] = cond ? this.hold[id] + dt : Math.max(0, this.hold[id] - dt * 2.5);
    if (this.hold[id] >= threshold) {
      this.hold[id] = 0;
      this.discover(byId(id), null);
    }
  },

  circleSweep: function (pts) {
    if (pts.length < 25) return null;
    var best = null;
    var planes = [['x', 'y'], ['x', 'z']];
    for (var pi = 0; pi < planes.length; pi++) {
      var a = planes[pi][0], b = planes[pi][1];
      var cx = 0, cb = 0, i;
      for (i = 0; i < pts.length; i++) { cx += pts[i][a]; cb += pts[i][b]; }
      cx /= pts.length; cb /= pts.length;

      var total = 0, prev = null;
      var minR = Infinity, maxR = 0, sumR = 0;
      for (i = 0; i < pts.length; i++) {
        var ax = pts[i][a] - cx, ay = pts[i][b] - cb;
        var r = Math.hypot(ax, ay);
        sumR += r;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        var ang = Math.atan2(ay, ax);
        if (prev !== null) {
          var dd = wrapAngle(ang - prev);
          if (Math.abs(dd) < 2.6) total += dd;
        }
        prev = ang;
      }
      var avgR = sumR / pts.length;
      var ok = avgR > 0.09 && avgR < 0.65 &&
               minR > avgR * 0.3 && maxR < avgR * 2.2 &&
               Math.abs(total) > 5.6;
      if (ok && (!best || Math.abs(total) > Math.abs(best.total))) {
        // full local centroid, for placing the ring in the world afterwards
        var mx = 0, my = 0, mz = 0;
        for (i = 0; i < pts.length; i++) { mx += pts[i].x; my += pts[i].y; mz += pts[i].z; }
        best = {
          total: total, radius: avgR, vertical: (b === 'y'),
          local: { x: mx / pts.length, y: my / pts.length, z: mz / pts.length }
        };
      }
    }
    return best;
  },

  /* ------------------------------------------------ discoveries */

  discover: function (g, info) {
    if (!g || this.done[g.id] || this.ended) return;
    this.done[g.id] = true;
    this.count++;
    this.cool = 3;
    this.lastEventT = this.time;
    this.trace.L.length = 0;
    this.trace.R.length = 0;

    this.playChime(g.note);
    this.showText(g.lines, 5200);
    this.fx[g.id](info);

    if (this.count === GESTURES.length) this.endAt = this.time + 6;
  },

  maybeHint: function () {
    if (!this.started || this.ended) return;
    if (this.msgState !== 'idle' || this.queue.length) return;
    if (this.time - this.lastEventT < 50) return;
    var remaining = GESTURES.filter(function (g) { return !this.done[g.id]; }, this);
    if (!remaining.length) return;
    var g = remaining[Math.floor(Math.random() * remaining.length)];
    this.showText(g.hint, 4500);
  },

  /* ------------------------------------------------ effects */

  headWorld: function () {
    return this.head.object3D.getWorldPosition(this.vt).clone();
  },

  fxReach: function () {
    this.lerps.push({ obj: this.starsMat, prop: 'opacity', target: 0.95, rate: 0.5 });
    this.skyTarget.lerp(new THREE.Color('#111b38'), 0.6);

    // aurora band, breathing across the northern sky
    var n = 240;
    var au = this.makePoints(n, '#7dffc8', 0.9, 0.5);
    var baseY = [], phase = [];
    for (var i = 0; i < n; i++) {
      var az = -1.3 + 2.6 * (i / (n - 1)) + (Math.random() - 0.5) * 0.06;
      var r = 68;
      var y = 18 + Math.random() * 16;
      au.pos[i * 3]     = Math.sin(az) * r;
      au.pos[i * 3 + 1] = y;
      au.pos[i * 3 + 2] = -Math.cos(az) * r;
      baseY.push(y);
      phase.push(Math.random() * Math.PI * 2);
    }
    au.geo.attributes.position.needsUpdate = true;
    this.systems.push({ step: function (dt, t) {
      for (var j = 0; j < n; j++) {
        au.pos[j * 3 + 1] = baseY[j] + Math.sin(t * 0.3 + phase[j]) * 2.0;
      }
      au.geo.attributes.position.needsUpdate = true;
    } });
  },

  fxHeart: function () {
    var p = this.headWorld();
    this.skyTarget.lerp(new THREE.Color('#251522'), 0.35);

    var e = document.createElement('a-entity');
    e.setAttribute('light', { type: 'point', color: '#ff9a76', intensity: 0.8, distance: 8 });
    e.setAttribute('position', p.x + ' ' + (p.y - 0.3) + ' ' + p.z);
    this.el.appendChild(e);
    this.systems.push({ step: function (dt, t) {
      var comp = e.components.light;
      if (comp && comp.light) comp.light.intensity = 0.55 + 0.35 * Math.sin(t * 1.7);
    } });

    var n = 60;
    var em = this.makePoints(n, '#ffb08a', 0.025, 0.8);
    var ex = [], ez = [], ph = [];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 1.1;
      ex.push(p.x + Math.cos(a) * r);
      ez.push(p.z + Math.sin(a) * r);
      ph.push(Math.random() * Math.PI * 2);
      em.pos[i * 3]     = ex[i];
      em.pos[i * 3 + 1] = Math.random() * 2.2;
      em.pos[i * 3 + 2] = ez[i];
    }
    em.geo.attributes.position.needsUpdate = true;
    this.systems.push({ step: function (dt, t) {
      for (var j = 0; j < n; j++) {
        em.pos[j * 3 + 1] += 0.16 * dt;
        em.pos[j * 3]     = ex[j] + Math.sin(t * 0.9 + ph[j]) * 0.08;
        em.pos[j * 3 + 2] = ez[j] + Math.cos(t * 0.7 + ph[j]) * 0.08;
        if (em.pos[j * 3 + 1] > 2.4) em.pos[j * 3 + 1] = 0.05;
      }
      em.geo.attributes.position.needsUpdate = true;
    } });
  },

  fxWide: function () {
    this.skyTarget.lerp(new THREE.Color('#17233d'), 0.45);

    var ring = document.createElement('a-entity');
    ring.setAttribute('geometry', { primitive: 'torus', radius: 26, radiusTubular: 0.08 });
    ring.setAttribute('rotation', '-90 0 0');
    ring.setAttribute('position', '0 0.4 0');
    ring.setAttribute('material', { shader: 'flat', color: '#ffd9a0', transparent: true, opacity: 0.15, fog: false });
    this.el.appendChild(ring);

    var colors = ['#ff9ab5', '#ffe08a', '#8ad4ff'];
    var self = this;
    colors.forEach(function (c) {
      var n = 22;
      var bl = self.makePoints(n, c, 0.06, 0.85);
      var baseY = [], ph = [];
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2;
        var r = 2.5 + Math.pow(Math.random(), 0.7) * 16;
        var y = 0.06 + Math.random() * 0.5;
        bl.pos[i * 3]     = Math.cos(a) * r;
        bl.pos[i * 3 + 1] = y;
        bl.pos[i * 3 + 2] = Math.sin(a) * r;
        baseY.push(y);
        ph.push(Math.random() * Math.PI * 2);
      }
      bl.geo.attributes.position.needsUpdate = true;
      self.systems.push({ step: function (dt, t) {
        for (var j = 0; j < n; j++) {
          bl.pos[j * 3 + 1] = baseY[j] + Math.sin(t * 0.8 + ph[j]) * 0.05;
        }
        bl.geo.attributes.position.needsUpdate = true;
      } });
    });
  },

  fxGround: function () {
    var p = this.headWorld();
    this.skyTarget.lerp(new THREE.Color('#12241c'), 0.35);
    var radii = [1.2, 2.4, 3.6];
    var opac  = [0.3, 0.18, 0.1];
    for (var i = 0; i < 3; i++) {
      var r = document.createElement('a-ring');
      r.setAttribute('radius-inner', radii[i]);
      r.setAttribute('radius-outer', radii[i] + 0.06);
      r.setAttribute('rotation', '-90 0 0');
      r.setAttribute('position', p.x + ' ' + (0.02 + i * 0.005) + ' ' + p.z);
      r.setAttribute('material', { shader: 'flat', color: '#7fd6a0', transparent: true, opacity: opac[i], side: 'double' });
      r.setAttribute('animation', {
        property: 'scale', from: '0.05 0.05 0.05', to: '1 1 1',
        dur: 1400 + i * 500, easing: 'easeOutCubic'
      });
      this.el.appendChild(r);
    }
  },

  fxCircle: function (info) {
    var pos, radius, rotation;
    if (info) {
      var l = info.local, hp = info.headPos, yaw = info.yaw;
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      pos = {
        x: hp.x + l.x * cy + l.z * sy,
        y: hp.y + l.y,
        z: hp.z - l.x * sy + l.z * cy
      };
      radius = Math.min(Math.max(info.radius, 0.15), 0.5);
      rotation = info.vertical ? ('0 ' + (yaw * 180 / Math.PI) + ' 0') : '-90 0 0';
    } else {
      var h = this.headWorld();
      pos = { x: h.x, y: h.y, z: h.z - 1 };
      radius = 0.3;
      rotation = '0 0 0';
    }
    this.skyTarget.lerp(new THREE.Color('#1d1830'), 0.35);

    var tor = document.createElement('a-entity');
    tor.setAttribute('geometry', { primitive: 'torus', radius: radius, radiusTubular: 0.012 });
    tor.setAttribute('position', pos.x + ' ' + pos.y + ' ' + pos.z);
    tor.setAttribute('rotation', rotation);
    tor.setAttribute('material', { shader: 'flat', color: '#cfa8ff', transparent: true, opacity: 0.85, side: 'double', fog: false });
    tor.setAttribute('light', { type: 'point', color: '#cfa8ff', intensity: 0.5, distance: 3 });
    this.el.appendChild(tor);
    var baseYpos = pos.y;
    this.systems.push({ step: function (dt, t) {
      tor.object3D.rotation.z += dt * 0.4;
      tor.object3D.position.y = baseYpos + Math.sin(t * 0.6) * 0.04;
    } });
  },

  fxStill: function () {
    this.fogTarget = 0.03;
    this.skyTarget.lerp(new THREE.Color('#101c22'), 0.3);

    var self = this;
    var n = 36;
    var ff = this.makePoints(n, '#d8ffa0', 0.03, 0.9);
    var vel = [];
    var anchor = this.headWorld();
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 2.5;
      ff.pos[i * 3]     = anchor.x + Math.cos(a) * r;
      ff.pos[i * 3 + 1] = 0.3 + Math.random() * 1.9;
      ff.pos[i * 3 + 2] = anchor.z + Math.sin(a) * r;
      vel.push([(Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.2]);
    }
    ff.geo.attributes.position.needsUpdate = true;
    var tmp = new THREE.Vector3();
    this.systems.push({ step: function (dt) {
      self.head.object3D.getWorldPosition(tmp);
      anchor.x += (tmp.x - anchor.x) * dt * 0.3;
      anchor.z += (tmp.z - anchor.z) * dt * 0.3;
      for (var j = 0; j < n; j++) {
        for (var k = 0; k < 3; k++) {
          vel[j][k] += (Math.random() - 0.5) * dt * 0.4;
          vel[j][k] = Math.max(-0.25, Math.min(0.25, vel[j][k]));
        }
        var x = ff.pos[j * 3] + vel[j][0] * dt;
        var y = ff.pos[j * 3 + 1] + vel[j][1] * dt;
        var z = ff.pos[j * 3 + 2] + vel[j][2] * dt;
        // gentle pull back toward the player
        vel[j][0] += (anchor.x - x) * dt * 0.06;
        vel[j][2] += (anchor.z - z) * dt * 0.06;
        if (y < 0.2) { y = 0.2; vel[j][1] = Math.abs(vel[j][1]); }
        if (y > 2.4) { y = 2.4; vel[j][1] = -Math.abs(vel[j][1]); }
        ff.pos[j * 3] = x; ff.pos[j * 3 + 1] = y; ff.pos[j * 3 + 2] = z;
      }
      ff.geo.attributes.position.needsUpdate = true;
    } });
  },

  fxSpin: function () {
    this.skyTarget.lerp(new THREE.Color('#241a2e'), 0.35);
    var n = 110;
    var pe = this.makePoints(n, '#ffb5cd', 0.05, 0.8);
    var bx = [], ph = [];
    for (var i = 0; i < n; i++) {
      bx.push((Math.random() - 0.5) * 22);
      ph.push(Math.random() * Math.PI * 2);
      pe.pos[i * 3]     = bx[i];
      pe.pos[i * 3 + 1] = 3 + Math.random() * 5;
      pe.pos[i * 3 + 2] = (Math.random() - 0.5) * 22;
    }
    pe.geo.attributes.position.needsUpdate = true;
    this.systems.push({ step: function (dt, t) {
      for (var j = 0; j < n; j++) {
        pe.pos[j * 3 + 1] -= 0.22 * dt;
        pe.pos[j * 3] = bx[j] + Math.sin(t * 0.5 + ph[j]) * 0.6;
        if (pe.pos[j * 3 + 1] < 0.02) pe.pos[j * 3 + 1] = 7 + Math.random() * 2;
      }
      pe.geo.attributes.position.needsUpdate = true;
    } });
  },

  /* ------------------------------------------------ ending */

  runEnding: function () {
    this.ended = true;
    this.skyTarget.lerp(new THREE.Color('#584f76'), 0.85);
    this.fogTarget = 0.022;
    this.lerps.push({ obj: this.starsMat, prop: 'opacity', target: 1, rate: 0.4 });

    var self = this;
    var sorted = GESTURES.slice().sort(function (a, b) { return a.note - b.note; });
    sorted.forEach(function (g, i) {
      setTimeout(function () { self.playChime(g.note); }, i * 260);
    });

    var hp = this.headWorld();
    this.orbit = document.createElement('a-entity');
    this.orbit.setAttribute('position', hp.x + ' ' + hp.y + ' ' + hp.z);
    this.el.appendChild(this.orbit);
    GESTURES.forEach(function (g, i) {
      var a = document.createElement('a-text');
      var ang = (i / GESTURES.length) * Math.PI * 2;
      a.setAttribute('value', g.word);
      a.setAttribute('align', 'center');
      a.setAttribute('color', '#ffe6bf');
      a.setAttribute('width', 2.2);
      a.setAttribute('side', 'double');
      a.setAttribute('opacity', 0);
      a.setAttribute('position',
        (Math.sin(ang) * 1.9) + ' ' + (i % 2 ? 0.25 : -0.1) + ' ' + (Math.cos(ang) * 1.9));
      a.setAttribute('rotation', '0 ' + (ang * 180 / Math.PI + 180) + ' 0');
      a.setAttribute('animation', { property: 'opacity', from: 0, to: 0.9, dur: 3500, delay: 400 * i, easing: 'easeInQuad' });
      self.orbit.appendChild(a);
    });

    setTimeout(function () {
      self.showText('No one told you who to be.\nYou made yourself out of motion and quiet.\nCarry it with you.', 12000);
    }, 3000);
  },

  /* ------------------------------------------------ message queue */

  showText: function (text, holdMs) {
    this.queue.push({ text: text, hold: holdMs });
    this.lastEventT = this.time;
  },

  tickMsg: function (dt) {
    if (this.msgState === 'idle') {
      if (!this.queue.length) return;
      var m = this.queue.shift();
      this.msgEl.setAttribute('value', m.text);
      this.msgHold = m.hold / 1000;
      this.msgState = 'in';
    }
    if (this.msgState === 'in') {
      this.msgOpacity = Math.min(1, this.msgOpacity + dt / 0.9);
      if (this.msgOpacity >= 1) this.msgState = 'hold';
    } else if (this.msgState === 'hold') {
      this.msgHold -= dt;
      if (this.msgHold <= 0) this.msgState = 'out';
    } else if (this.msgState === 'out') {
      this.msgOpacity = Math.max(0, this.msgOpacity - dt / 1.1);
      if (this.msgOpacity <= 0) {
        this.msgState = 'idle';
        this.msgEl.setAttribute('value', '');
      }
    }
    this.msgEl.setAttribute('opacity', this.msgOpacity);
  },

  /* ------------------------------------------------ audio */

  ensureAudio: function () {
    if (this.actx) return;
    try {
      this.actx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    var ctx = this.actx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    // low drone, barely there
    var master = this.master;
    [55, 55.4, 110.3].forEach(function (f) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      var g = ctx.createGain();
      g.gain.value = 0.012;
      o.connect(g);
      g.connect(master);
      o.start();
    });
  },

  playChime: function (f) {
    if (!this.actx) return;
    var ctx = this.actx, master = this.master, t = ctx.currentTime;
    [[f, 0.09, 2.4], [f * 2, 0.03, 1.5], [f * 1.5, 0.02, 1.8]].forEach(function (spec) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = spec[0];
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(spec[1], t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + spec[2]);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + spec[2] + 0.1);
    });
  }

});

})();
