/* ════════════ NeuronFRAMES — "Walk Inside" (real 3D hospital) ════════════
 * First-person walk through a hospital built as real 3D geometry in Three.js,
 * with textured walls/floor/ceiling, a modeled reception desk + chairs, props,
 * and per-department ROOMS you literally walk into:
 *   - Scroll  → walk forward along the corridor
 *   - Mouse   → look around
 *   - Click a department door → the camera flies through the doorway INTO a
 *     furnished 3D room, and the information appears inside the room.
 *   - Back / Esc → walk back out into the corridor.
 * Flat, accessible fallback (stacked room gallery) when WebGL is unavailable,
 * reduced motion is preferred, or the screen is small. */
(function () {
  'use strict';

  var body = document.body;
  var viewport = document.getElementById('hall-viewport');
  var track = document.getElementById('hall-track');
  var canvas = document.getElementById('hall-canvas');
  var intro = document.getElementById('hall-intro');
  var outro = document.getElementById('hall-outro');
  var hoverTip = document.getElementById('hall-hover');
  var map = document.getElementById('hall-map');
  var roomsWrap = document.getElementById('rooms');
  if (!viewport || !track) return;

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var narrow = window.matchMedia('(max-width: 680px)').matches;
  function webglOK() {
    try { var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { return false; }
  }
  var can3D = !!window.THREE && webglOK() && !prefersReduced && !narrow && canvas;

  var DEPTS = [
    { room: 'room-pt',       name: 'Physical Therapy',     ward: 'WARD 01', f: 0.20, side: -1, color: 0x3b82f6, type: 'therapy',
      head: 'Move again, measured every step', bullets: ['Live pose tracking on a webcam', 'Therapy that plays like a game', 'Every rep + form score logged'] },
    { room: 'room-ot',       name: 'Occupational Therapy', ward: 'WARD 02', f: 0.33, side:  1, color: 0x14b8a6, type: 'therapy',
      head: 'The small daily wins, made measurable', bullets: ['Grip & hand games with live force', 'Strength tracked session by session', 'Affordable, friendly hardware'] },
    { room: 'room-sit',      name: 'Speech Therapy',       ward: 'WARD 03', f: 0.46, side: -1, color: 0xf59e0b, type: 'therapy',
      head: 'The first clear word, then the next', bullets: ['In-browser speech recognition', 'Scored pronunciation drills', 'Practise at any hour'] },
    { room: 'room-impact',   name: 'Outcomes',             ward: 'DESK',    f: 0.59, side:  1, color: 0x0ea5e9, type: 'office',
      head: 'Real numbers from real wards', bullets: ['250+ patients treated / month', '47% lower therapy cost', '23% average improvement'] },
    { room: 'room-research', name: 'Research',             ward: 'DESK',    f: 0.72, side: -1, color: 0x8b5cf6, type: 'office',
      head: 'Peer-reviewed and award-winning', bullets: ["People's Choice — ACM/IEEE HRI 2025", 'Indexed in IEEE & Springer', '10+ projects underway'] },
    { room: 'room-partners', name: 'Partners',             ward: 'DESK',    f: 0.85, side:  1, color: 0x10b981, type: 'office',
      head: 'Built hand in hand with hospitals', bullets: ['King Chulalongkorn Memorial Hospital', 'Burapha & Bangkok hospitals', 'University of Agder · Norway'] }
  ];

  /* ════════════ ROOM INFO PANEL (HTML overlay, shared) ════════════ */
  var openEl = null, opener = null;
  function showPanel(id, fromEl, cinematic) {
    var room = document.getElementById(id);
    if (!room) return;
    opener = fromEl || null; openEl = room;
    room.hidden = false;
    body.classList.add('room-open');
    body.classList.toggle('in-room-cine', !!cinematic);
    body.classList.remove('room-peeking');
    var pk = document.getElementById('room-peek'); if (pk) pk.textContent = 'Look around the room';
    if (roomsWrap) roomsWrap.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      room.classList.add('is-open');
      var b = room.querySelector('.room-body'); if (b) b.scrollTop = 0;       // always open at the title
    }); });
    var c = room.querySelector('.room-close'); if (c) c.focus({ preventScroll: true });
  }
  function hidePanel() {
    if (!openEl) return;
    var room = openEl;
    room.classList.remove('is-open');
    body.classList.remove('room-open');
    if (roomsWrap) roomsWrap.setAttribute('aria-hidden', 'true');
    if (prefersReduced) room.hidden = true; else setTimeout(function () { room.hidden = true; }, 450);
    body.classList.remove('room-peeking');
    openEl = null;
  }

  /* ── Flat fallback: stacked room gallery, fully accessible ── */
  if (!can3D) {
    body.classList.add('hall-flat');
    if (roomsWrap) roomsWrap.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('.room-close, .room-back').forEach(function (b) { b.addEventListener('click', hidePanel); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openEl) hidePanel(); });
    document.querySelectorAll('#hall-doors-a11y button[data-room]').forEach(function (b) {
      b.addEventListener('click', function () { showPanel(b.getAttribute('data-room'), b, false); });
    });
    return;
  }

  /* ════════════════════════ THE 3D HOSPITAL ════════════════════════ */
  var THREE = window.THREE;
  var HALF_W = 1.7, CEIL_Y = 3.0, EYE_Y = 1.62;
  var START_Z = 6.5, END_Z = -33;
  var zAt = function (f) { return START_Z + (END_Z - START_Z) * f; };
  var V3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xdfe3e8, 1);
  if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  if (THREE.ACESFilmicToneMapping) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.98; }
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdfe3e8, 22, 70);   // subtle depth haze toward the far end
  var camera = new THREE.PerspectiveCamera(60, 1, 0.05, 220);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, EYE_Y, START_Z);

  /* lights — warm, lively fill + a shadow-casting key light over the entrance */
  scene.add(new THREE.HemisphereLight(0xf6f7fa, 0xdfe2e6, 0.6));       // neutral fluorescent (matches reference)
  scene.add(new THREE.AmbientLight(0xeef1f6, 0.3));
  var sun = new THREE.DirectionalLight(0xfbfcff, 0.6);
  sun.position.set(4, 6, 6); sun.target.position.set(0, 1.0, -3); scene.add(sun); scene.add(sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 34;
  sun.shadow.camera.left = -7; sun.shadow.camera.right = 7; sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
  sun.shadow.bias = -0.0006;

  /* ── procedural textures (canvas) for "real" walls / floor / ceiling ── */
  function makeTex(draw, w, h, rx, ry) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1);
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; return t;
  }
  function floorTex(rx, ry) { return makeTex(function (x, w, h) {
    x.fillStyle = '#e7ebf1'; x.fillRect(0, 0, w, h);
    for (var i = 0; i < 1200; i++) { x.fillStyle = 'rgba(120,135,160,' + (Math.random() * 0.05) + ')'; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    x.strokeStyle = 'rgba(120,135,160,0.5)'; x.lineWidth = 3;
    for (var g = 0; g <= w; g += w / 4) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, h); x.stroke(); }
    for (var g2 = 0; g2 <= h; g2 += h / 4) { x.beginPath(); x.moveTo(0, g2); x.lineTo(w, g2); x.stroke(); }
  }, 256, 256, rx, ry); }
  function wallTex(rx, ry) { return makeTex(function (x, w, h) {
    var grd = x.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#f3f6fa'); grd.addColorStop(1, '#e4e9f0');
    x.fillStyle = grd; x.fillRect(0, 0, w, h);
    for (var i = 0; i < 600; i++) { x.fillStyle = 'rgba(150,165,190,' + (Math.random() * 0.04) + ')'; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    x.strokeStyle = 'rgba(150,165,190,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 2); x.lineTo(w, 2); x.stroke();
  }, 256, 256, rx, ry); }
  function ceilTex(rx, ry) { return makeTex(function (x, w, h) {
    x.fillStyle = '#f7f9fc'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(140,155,180,0.45)'; x.lineWidth = 3;
    for (var g = 0; g <= w; g += w / 2) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, h); x.stroke(); }
    for (var g2 = 0; g2 <= h; g2 += h / 2) { x.beginPath(); x.moveTo(0, g2); x.lineTo(w, g2); x.stroke(); }
  }, 256, 256, rx, ry); }
  // soft round contact shadow
  var shadowTex = makeTex(function (x, w, h) { var g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(20,30,50,0.42)'); g.addColorStop(1, 'rgba(20,30,50,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, 128, 128, 1, 1);
  function contact(x, z, sx, sz) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz || sx), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); scene.add(m); return m;
  }

  /* subtle environment reflections from a procedural gradient (polished-floor / glass / metal) */
  (function setupEnv() {
    if (!THREE.PMREMGenerator) return;
    try {
      var pm = new THREE.PMREMGenerator(renderer);
      var es = new THREE.Scene();
      var gtex = makeTex(function (x, w, h) { var g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#eef4fc'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#c2cad6'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, 64, 64, 1, 1);
      es.add(new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ map: gtex, side: THREE.BackSide })));
      scene.environment = pm.fromScene(es, 0, 0.1, 100).texture; pm.dispose();
    } catch (e) {}
  })();

  /* materials */
  // real PBR textures (PolyHaven CC0) layered over the procedural fallback: load
  // diffuse + normal + roughness and swap them in (works over http; on file:// the
  // loads fail quietly and the procedural texture stays).
  var texLoader = new THREE.TextureLoader();
  function applyPBR(mat, slug, rx, ry, tint) {
    if (window.NF_NOMODELS) return;
    function s(t, srgb) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; if (srgb && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; return t; }
    texLoader.load('models/tex/' + slug + '_diff.jpg', function (t) { mat.map = s(t, true); if (mat.color) mat.color.set(tint || 0xffffff); mat.needsUpdate = true; });
    texLoader.load('models/tex/' + slug + '_nor.jpg', function (t) { mat.normalMap = s(t, false); mat.needsUpdate = true; });
    texLoader.load('models/tex/' + slug + '_rough.jpg', function (t) { mat.roughnessMap = s(t, false); mat.needsUpdate = true; });   // keep each material's own roughness (glossy floor stays glossy)
  }
  var matFloor = new THREE.MeshStandardMaterial({ map: floorTex(4, 26), roughness: 0.18, metalness: 0.05, envMapIntensity: 1.15 });   // polished, reflective hospital floor
  var matCeil  = new THREE.MeshStandardMaterial({ map: ceilTex(3, 24), roughness: 0.96 });
  var matWallL = new THREE.MeshStandardMaterial({ map: wallTex(22, 1.4), roughness: 0.92 });
  var matWallR = new THREE.MeshStandardMaterial({ map: wallTex(22, 1.4), roughness: 0.92 });
  var matBand  = new THREE.MeshStandardMaterial({ color: 0x7aa7d9, roughness: 0.6 });
  var matBase  = new THREE.MeshStandardMaterial({ color: 0x9aa6b6, roughness: 0.8 });
  var matMetal = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.35, metalness: 0.7 });
  var matDark  = new THREE.MeshStandardMaterial({ color: 0x39414f, roughness: 0.5, metalness: 0.3 });
  var matPanel = new THREE.MeshStandardMaterial({ color: 0x7d4f2a, roughness: 0.62 });   // brown wood door
  // real surfaces: white-tile floor; warm-toned walls; soft cream ceiling; painted doors
  applyPBR(matFloor, 'long_white_tiles', 3, 16, 0xefe7d6);        // warm-beige polished walkway (matches reference)
  applyPBR(matWallL, 'painted_plaster_wall', 14, 2, 0xf2e8cf);    // cream walls
  applyPBR(matWallR, 'painted_plaster_wall', 14, 2, 0xf2e8cf);
  applyPBR(matCeil, 'painted_plaster_wall', 6, 14, 0xf8f1de);     // soft cream ceiling
  applyPBR(matPanel, 'oak_veneer_01', 1, 2.2, 0xe7d3ad);          // real oak-veneer wood doors
  var matWood  = new THREE.MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.7 });
  var matDesk  = new THREE.MeshStandardMaterial({ color: 0xeef1f5, roughness: 0.5 });
  var matFab   = new THREE.MeshStandardMaterial({ color: 0x3a4659, roughness: 0.85 });
  function emis(hex, i) { return new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: i == null ? 1 : i, roughness: 0.5 }); }

  var CLEN = START_Z - END_Z + 16, CMID = (START_Z + END_Z) / 2;
  function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
  function cyl(rt, rb, h, mat, seg) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), mat); }

  /* ── real CC0 furniture models (KayKit Furniture Bits, CC0) ──
     swapModel() loads a .gltf, normalises its size, drops it on the floor, and
     replaces a code-built placeholder at the same spot. If the model can't load,
     the placeholder stays — so the hospital always renders. */
  var gltf = (!window.NF_NOMODELS && window.THREE && THREE.GLTFLoader) ? new THREE.GLTFLoader() : null;
  // photoreal CC0 models (PolyHaven) keyed by role; unknown keys fall back to a flat .gltf in models/
  var MODELPATH = {
    armchair: 'modern_arm_chair_01/modern_arm_chair_01_1k.gltf',
    monobloc: 'plastic_monobloc_chair_01/plastic_monobloc_chair_01_1k.gltf',
    stool:    'metal_stool_01/metal_stool_01_1k.gltf',
    plant1:   'potted_plant_01/potted_plant_01_1k.gltf',
    plant2:   'potted_plant_02/potted_plant_02_1k.gltf',
    sofa:     'Sofa_01/Sofa_01_1k.gltf',
    cabinet:  'drawer_cabinet/drawer_cabinet_1k.gltf',
    wheelchair: 'wheelchair.glb',                                    // Poly by Google (CC-BY — attribution needed)
    doctor:     'doctor.glb'                                         // Poly Pizza character (attribution may be needed)
  };
  function swapModel(ph, name, targetSize, opts) {
    if (!gltf || !ph) return;
    opts = opts || {};
    gltf.load('models/' + (MODELPATH[name] || (name + '.gltf')), function (res) {
      var m = res.scene;
      var bb = new THREE.Box3().setFromObject(m), size = new THREE.Vector3(); bb.getSize(size);
      var denom = opts.by === 'xz' ? Math.max(size.x, size.z) : size.y;
      m.scale.setScalar(targetSize / (denom || 1));
      bb.setFromObject(m); var c = new THREE.Vector3(); bb.getCenter(c);
      m.position.x -= c.x; m.position.z -= c.z; m.position.y -= bb.min.y;     // centre on floor
      m.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) o.material.envMapIntensity = 0.5; } });
      var grp = new THREE.Group(); grp.add(m);
      grp.position.copy(ph.position);
      grp.rotation.y = ph.rotation.y + (opts.rotY || 0);
      (ph.parent || scene).add(grp);
      ph.visible = false;
    }, undefined, function () { /* keep the code-built placeholder */ });
  }
  function placeholderAt(x, z, rotY, parent) { var o = new THREE.Object3D(); o.position.set(x, 0, z); o.rotation.y = rotY || 0; (parent || scene).add(o); return o; }

  /* corridor shell */
  // polished reflective floor: a dim mirror with the beige tile laid semi-transparently on top,
  // so it reflects the ceiling lights SOFTLY (not a full mirror). matFloor.opacity = reflection strength.
  if (THREE.Reflector) {
    var mirror = new THREE.Reflector(new THREE.PlaneGeometry(HALF_W * 2, CLEN), { clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0x6d685e });
    mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, 0.006, CMID); scene.add(mirror);
    matFloor.transparent = true; matFloor.opacity = 0.62;
    var ftop = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, CLEN), matFloor); ftop.rotation.x = -Math.PI / 2; ftop.position.set(0, 0.014, CMID); scene.add(ftop);
  } else {
    var floor = box(HALF_W * 2, 0.1, CLEN, matFloor); floor.position.set(0, -0.05, CMID); scene.add(floor);
  }
  var ceil = box(HALF_W * 2, 0.1, CLEN, matCeil); ceil.position.set(0, CEIL_Y + 0.05, CMID); scene.add(ceil);
  // acoustic ceiling-tile grid + air vents (as in the reference)
  var gridMat = new THREE.MeshStandardMaterial({ color: 0xcdc8ba, roughness: 0.92 });
  for (var gz = START_Z - 1; gz > END_Z; gz -= 1.2) { var gl = box(HALF_W * 2, 0.02, 0.025, gridMat); gl.position.set(0, CEIL_Y - 0.015, gz); scene.add(gl); }
  [-0.58, 0, 0.58].forEach(function (gx) { var gl2 = box(0.025, 0.02, CLEN, gridMat); gl2.position.set(gx * HALF_W, CEIL_Y - 0.015, CMID); scene.add(gl2); });
  var ventMat = new THREE.MeshStandardMaterial({ color: 0xbcc0bd, roughness: 0.7, metalness: 0.25 });
  [START_Z - 7, START_Z - 17, START_Z - 27].forEach(function (vz) { var v = box(0.62, 0.04, 0.62, ventMat); v.position.set(0.55, CEIL_Y - 0.03, vz); scene.add(v); });
  var wallL = box(0.1, CEIL_Y, CLEN, matWallL); wallL.position.set(-HALF_W, CEIL_Y / 2, CMID); scene.add(wallL);
  var wallR = box(0.1, CEIL_Y, CLEN, matWallR); wallR.position.set(HALF_W, CEIL_Y / 2, CMID); scene.add(wallR);
  var matRail = new THREE.MeshStandardMaterial({ color: 0xb89968, roughness: 0.5 });    // tan wood/PVC handrail (as in the reference)
  [-1, 1].forEach(function (s) {
    var bb = box(0.06, 0.2, CLEN, matBase); bb.position.set(s * (HALF_W - 0.03), 0.1, CMID); scene.add(bb);     // baseboard
    var rail = cyl(0.042, 0.042, CLEN, matRail, 14); rail.rotation.x = Math.PI / 2; rail.position.set(s * (HALF_W - 0.07), 0.92, CMID); scene.add(rail);
    var railbk = box(0.03, 0.12, CLEN, matRail); railbk.position.set(s * (HALF_W - 0.02), 0.92, CMID); scene.add(railbk);   // rail backing strip
  });
  /* no coloured floor lines — the reference corridor is clean polished tile */

  var nLights = 10;
  for (var li = 0; li < nLights; li++) {
    var lz = START_Z - 2 - li * (CLEN - 4) / nLights;
    var fixFrame = box(1.28, 0.08, 0.56, new THREE.MeshStandardMaterial({ color: 0xe6e4da, roughness: 0.85 })); fixFrame.position.set(0, CEIL_Y - 0.06, lz); scene.add(fixFrame);   // recessed troffer housing
    var fix = box(1.15, 0.05, 0.44, emis(0xf2f6ff, 0.82)); fix.position.set(0, CEIL_Y - 0.05, lz); scene.add(fix);   // neutral white fluorescent panel
    if (li % 2 === 0) { var pl = new THREE.PointLight(0xeef3ff, 0.5, 18, 2); pl.position.set(0, CEIL_Y - 0.3, lz); scene.add(pl); }
  }

  /* canvas-text helper (signage + screens) */
  function textTex(draw, w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; return t; }
  function hx(c) { return '#' + ('000000' + c.toString(16)).slice(-6); }
  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

  /* ── department door ── */
  var doorHits = [];
  function buildDoor(d) {
    var g = new THREE.Group(); var DW = 1.06, DH = 2.16, FT = 0.1;
    var fm = new THREE.MeshStandardMaterial({ color: 0xede6d4, roughness: 0.7 });   // clean cream door casing
    var top = box(DW + FT * 2, FT, 0.16, fm); top.position.set(0, DH + FT / 2, 0.02); g.add(top);
    g.add(posBox(box(FT, DH + FT, 0.16, fm), -(DW / 2 + FT / 2), (DH + FT) / 2 - FT / 2, 0.02));
    g.add(posBox(box(FT, DH + FT, 0.16, fm), DW / 2 + FT / 2, (DH + FT) / 2 - FT / 2, 0.02));
    var strip = box(DW + FT * 2, 0.07, 0.05, emis(d.color, 0.9)); strip.position.set(0, DH + FT + 0.12, 0.06); g.add(strip);
    var pivot = new THREE.Group(); pivot.position.set(-DW / 2, 0, 0); g.add(pivot);   // panel flush in its frame, clear of the wall (no glow plane → no z-fighting)
    var panel = box(DW, DH, 0.06, matPanel); panel.position.set(DW / 2, DH / 2, 0); pivot.add(panel);
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(DW * 0.5, 0.55), new THREE.MeshStandardMaterial({ color: 0xbfe3ef, transparent: true, opacity: 0.5, roughness: 0.15, metalness: 0.1 }));
    glass.position.set(DW / 2, DH * 0.66, 0.04); pivot.add(glass);
    var handle = cyl(0.025, 0.025, 0.16, matMetal, 10); handle.rotation.z = Math.PI / 2; handle.position.set(DW - 0.16, DH * 0.46, 0.06); pivot.add(handle);
    var sgn = textTex(function (x, w, h) {
      x.fillStyle = '#10182b'; roundRect(x, 0, 0, w, h, 16); x.fill();
      x.fillStyle = hx(d.color); roundRect(x, 0, 0, 14, h, 6); x.fill();
      x.fillStyle = hx(d.color); x.font = 'bold 30px Arial'; x.textBaseline = 'top'; x.fillText(d.ward, 40, 24);
      x.fillStyle = '#fff'; x.font = 'bold 54px Georgia'; x.fillText(d.name, 40, 64);
    }, 640, 170);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.4), new THREE.MeshBasicMaterial({ map: sgn, transparent: true }));
    sign.position.set(0, DH + 0.5, 0.1); g.add(sign);
    var hit = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.5, DH + 1.0, 0.4), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, DH / 2 + 0.2, 0.1); hit.userData.dept = d; g.add(hit); doorHits.push(hit);
    g.position.set(d.side * (HALF_W - 0.14), 0, zAt(d.f)); g.rotation.y = d.side < 0 ? Math.PI / 2 : -Math.PI / 2;   // stand the door clearly in front of the wall
    d.pivot = pivot; d.strip = strip; d.open = 0; d.targetOpen = 0; scene.add(g);
  }
  function posBox(m, x, y, z) { m.position.set(x, y, z); return m; }
  function buildFiller(z, side, label) {
    var g = new THREE.Group(); var DW = 0.98, DH = 2.1, FT = 0.09;
    var top = box(DW + FT * 2, FT, 0.12, matBase); top.position.set(0, DH + FT / 2, 0.02); g.add(top);
    g.add(posBox(box(FT, DH + FT, 0.12, matBase), -(DW / 2 + FT / 2), (DH + FT) / 2 - FT / 2, 0.02));
    g.add(posBox(box(FT, DH + FT, 0.12, matBase), DW / 2 + FT / 2, (DH + FT) / 2 - FT / 2, 0.02));
    g.add(posBox(box(DW, DH, 0.05, matPanel), 0, DH / 2, 0));
    var handle = cyl(0.022, 0.022, 0.14, matMetal, 8); handle.rotation.z = Math.PI / 2; handle.position.set(DW / 2 - 0.12, DH * 0.46, 0.05); g.add(handle);
    var tex = textTex(function (x, w, h) { x.fillStyle = '#dbe1e9'; x.fillRect(0, 0, w, h); x.fillStyle = '#46546a'; x.font = 'bold 60px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, w / 2, h / 2); }, 160, 96);
    g.add(posBox(new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.19), new THREE.MeshBasicMaterial({ map: tex, transparent: true })), 0, DH - 0.08, 0.07));
    g.position.set(side * (HALF_W - 0.06), 0, z); g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(g);
  }
  DEPTS.forEach(buildDoor);
  // (fake filler "RM" doors removed — the department doors + signage carry the corridor)

  /* ── reception desk + chairs + props ── */
  function chair(accent) {
    var g = new THREE.Group();
    var seat = box(0.46, 0.1, 0.46, matFab); seat.position.y = 0.5; g.add(seat);
    var bk = box(0.44, 0.5, 0.08, matFab); bk.position.set(0, 0.8, -0.2); bk.rotation.x = -0.12; g.add(bk);
    [-0.26, 0.26].forEach(function (ax) { var ar = box(0.06, 0.06, 0.36, matDark); ar.position.set(ax, 0.62, 0.02); g.add(ar);
      var arp = box(0.06, 0.14, 0.06, matDark); arp.position.set(ax, 0.55, 0.16); g.add(arp); });
    g.add(posBox(cyl(0.045, 0.045, 0.4, matMetal, 10), 0, 0.27, 0));
    for (var i = 0; i < 5; i++) { var a = i / 5 * Math.PI * 2; var leg = box(0.07, 0.04, 0.26, matDark); leg.position.set(Math.cos(a) * 0.13, 0.06, Math.sin(a) * 0.13); leg.rotation.y = -a; g.add(leg);
      g.add(posBox(cyl(0.04, 0.04, 0.05, matDark, 8), Math.cos(a) * 0.24, 0.04, Math.sin(a) * 0.24)); }
    if (accent) seat.material = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.85 });
    return g;
  }
  (function reception() {
    var g = new THREE.Group();
    g.add(posBox(box(2.4, 1.06, 0.7, matDesk), 0, 0.53, 0));
    g.add(posBox(box(2.55, 0.08, 0.82, matWood), 0, 1.08, 0));
    var lip = box(2.4, 0.36, 0.06, new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5, emissive: 0x2563eb, emissiveIntensity: 0.12 })); lip.position.set(0, 0.78, 0.39); g.add(lip);
    var backTex = textTex(function (x, w, h) { x.fillStyle = '#0d1526'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.font = 'bold 70px Georgia'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText('NeuronFRAMES', w / 2, h * 0.4);
      x.fillStyle = '#5ad1c0'; x.font = '30px Arial'; x.fillText('R E H A B I L I T A T I O N   ·   R E C E P T I O N', w / 2, h * 0.72); }, 900, 260);
    g.add(posBox(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.75), new THREE.MeshBasicMaterial({ map: backTex })), 0, 1.7, -0.34));
    var mon = box(0.5, 0.32, 0.03, emis(0x223047, 0.25)); mon.position.set(-0.7, 1.32, 0.1); mon.rotation.x = -0.12; g.add(mon);
    g.position.set(0.45, 0, 2.6); g.rotation.y = Math.PI; scene.add(g);
    contact(0.45, 2.6, 3.0, 1.4);
    var ch = chair(); ch.position.set(0.1, 0, 3.4); ch.rotation.y = 0.3; scene.add(ch); contact(0.1, 3.4, 0.8, 0.8);
    swapModel(ch, 'armchair', 0.92);                                 // photoreal chair behind the desk
  })();
  // waiting area near the entrance — code chairs (fallback) upgraded to photoreal models, plus a sofa
  [[-1.2, 4.6, 1.05], [-1.2, 5.35, 1.05]].forEach(function (p) {
    var c = chair(0x6b7686); c.position.set(p[0], 0, p[1]); c.rotation.y = p[2]; scene.add(c); contact(p[0], p[1], 0.7, 0.7);
    swapModel(c, 'armchair', 0.85);
  });
  swapModel(placeholderAt(1.15, 4.95, -Math.PI / 2), 'sofa', 0.82);
  contact(1.15, 4.95, 2.0, 1.0);

  /* plants + clock + dispensers */
  var plantRefs = [];
  function plant(x, z) { var g = new THREE.Group();
    g.add(posBox(cyl(0.18, 0.13, 0.34, new THREE.MeshStandardMaterial({ color: 0xcdd3da, roughness: 0.8 }), 14), 0, 0.17, 0));
    var gm = new THREE.MeshStandardMaterial({ color: 0x4f9e57, roughness: 0.85 });
    [[0, 0.55, 0.26], [0.12, 0.7, 0.2], [-0.12, 0.66, 0.22]].forEach(function (p) { g.add(posBox(new THREE.Mesh(new THREE.IcosahedronGeometry(p[2], 0), gm), p[0], p[1], 0)); });
    g.position.set(x, 0, z); scene.add(g); contact(x, z, 0.7, 0.7); return g; }
  plantRefs.push(plant(-HALF_W + 0.3, 4.2), plant(HALF_W - 0.3, zAt(0.26)), plant(-HALF_W + 0.3, zAt(0.63)), plant(HALF_W - 0.3, zAt(0.9)));
  plantRefs.forEach(function (p, i) { swapModel(p, i % 2 ? 'plant2' : 'plant1', 0.85); });
  // photoreal cabinets against the entrance walls for a more furnished hospital feel
  swapModel(placeholderAt(HALF_W - 0.28, 1.0, -Math.PI / 2), 'cabinet', 0.9);
  swapModel(placeholderAt(-HALF_W + 0.28, 1.0, Math.PI / 2), 'cabinet', 0.9);
  function wallClock(z) { var g = new THREE.Group();
    g.add(posBox(cyl(0.16, 0.16, 0.04, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 20), 0, 0, 0));
    var hh = box(0.015, 0.1, 0.01, matDark); hh.position.y = 0.04; g.add(hh); var mh = box(0.012, 0.14, 0.01, matDark); mh.position.set(0.03, 0, 0.01); mh.rotation.z = -1; g.add(mh);
    g.rotation.x = Math.PI / 2; g.position.set(HALF_W - 0.08, 2.4, zAt(0.12)); g.rotation.y = -Math.PI / 2; scene.add(g); }
  wallClock();

  /* colourful framed artwork along the corridor — pops of life on the walls */
  function artTex(h1, h2) { return textTex(function (x, w, hh) {
    var g = x.createLinearGradient(0, 0, w, hh); g.addColorStop(0, h1); g.addColorStop(1, h2); x.fillStyle = g; x.fillRect(0, 0, w, hh);
    x.globalAlpha = .55; x.fillStyle = '#ffffff'; x.beginPath(); x.arc(w * 0.68, hh * 0.42, hh * 0.26, 0, 7); x.fill();
    x.globalAlpha = .35; x.fillRect(w * 0.12, hh * 0.58, w * 0.46, hh * 0.1); x.fillRect(w * 0.12, hh * 0.74, w * 0.3, hh * 0.07); x.globalAlpha = 1;
  }, 420, 300); }
  function wallArt(z, side, h1, h2) {
    var g = new THREE.Group();
    g.add(box(0.05, 0.96, 1.26, matDark));                                    // dark frame against the wall
    var pic = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.82), new THREE.MeshBasicMaterial({ map: artTex(h1, h2) }));
    pic.position.x = side * 0.035; pic.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(pic);
    g.position.set(side * (HALF_W - 0.03), 1.55, z); scene.add(g);
  }
  [[3.8, -1, '#9fb3c8', '#e2e8ef'], [-1.5, 1, '#cdbba0', '#efe7d6'], [-6.0, -1, '#a9c0b4', '#dde8e0'],
   [-10.7, 1, '#b8c4d4', '#e8edf3'], [-15.8, -1, '#d3c2ac', '#efe8dc'], [-20.8, 1, '#aebccb', '#dee5ec'],
   [-25.8, -1, '#c2b69e', '#e9e1d2']].forEach(function (a) { wallArt(a[0], a[1], a[2], a[3]); });

  /* ── life & props: wheelchair, people, dispensers, fire extinguishers, overhead sign ── */
  function wheelchair(x, z, rot) {
    var g = new THREE.Group();
    var fr = new THREE.MeshStandardMaterial({ color: 0x2b2f37, roughness: 0.5, metalness: 0.45 });
    var st = new THREE.MeshStandardMaterial({ color: 0x39414f, roughness: 0.85 });
    g.add(posBox(box(0.46, 0.06, 0.46, st), 0, 0.5, 0));
    var bk = box(0.46, 0.5, 0.06, st); bk.position.set(0, 0.76, -0.22); g.add(bk);
    [-0.27, 0.27].forEach(function (s) {
      var w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), fr); w.rotation.z = Math.PI / 2; w.position.set(s, 0.3, -0.05); g.add(w);
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12), fr); c.rotation.z = Math.PI / 2; c.position.set(s * 0.75, 0.1, 0.3); g.add(c);
    });
    g.add(posBox(box(0.5, 0.04, 0.04, fr), 0, 1.02, -0.24));
    g.position.set(x, 0, z); g.rotation.y = rot || 0; scene.add(g); contact(x, z, 0.8, 0.8);
  }
  function person(x, z, rot, col) {
    var g = new THREE.Group(); var m = new THREE.MeshStandardMaterial({ color: col || 0x6b7280, roughness: 0.92 });
    g.add(posBox(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.95, 12), m), 0, 0.48, 0));   // legs/lower
    g.add(posBox(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.62, 12), m), 0, 1.12, 0));    // torso
    g.add(posBox(new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), m), 0, 1.56, 0));             // head
    g.position.set(x, 0, z); g.rotation.y = rot || 0; scene.add(g); contact(x, z, 0.5, 0.5);
  }
  function dispenser(z, side) { var d = box(0.13, 0.26, 0.09, new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.45 })); d.position.set(side * (HALF_W - 0.06), 1.32, z); scene.add(d); }
  function fireExt(z, side) { var e = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 14), new THREE.MeshStandardMaterial({ color: 0xc0322a, roughness: 0.45, metalness: 0.25 })); e.position.set(side * (HALF_W - 0.1), 0.75, z); scene.add(e); }
  // real wheelchair + a doctor character walking the hall (free low-poly models)
  swapModel(placeholderAt(0.45, zAt(0.46), Math.PI - 0.15), 'wheelchair', 1.0);
  contact(0.45, zAt(0.46), 0.9, 0.9);
  swapModel(placeholderAt(-0.45, zAt(0.55), 0), 'doctor', 1.72);
  contact(-0.45, zAt(0.55), 0.7, 0.7);
  dispenser(zAt(0.16), -1); dispenser(zAt(0.42), 1); dispenser(zAt(0.7), -1);
  fireExt(zAt(0.3), 1); fireExt(zAt(0.82), -1);
  (function overheadSign() {
    var tex = textTex(function (x, w, h) { x.fillStyle = '#10306b'; roundRect(x, 0, 0, w, h, 16); x.fill();
      x.fillStyle = '#fff'; x.font = 'bold 46px Arial'; x.textBaseline = 'middle'; x.textAlign = 'center';
      x.fillText('◄  Therapy Wards  ·  Reception  ►', w / 2, h / 2); }, 720, 130);
    var s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.42), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    s.position.set(0, 2.45, zAt(0.5)); scene.add(s);
    var s2 = s.clone(); s2.rotation.y = Math.PI; s2.position.z = zAt(0.5) + 0.02; scene.add(s2);
  })();

  /* ── ceiling directional sign + far daylight window ── */
  (function hangSign() {
    var tex = textTex(function (x, w, h) { x.fillStyle = '#10306b'; roundRect(x, 0, 0, w, h, 18); x.fill();
      x.fillStyle = '#fff'; x.font = 'bold 52px Arial'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText('Rehabilitation', 40, h / 2);
      x.textAlign = 'right'; x.fillStyle = '#7fe0d0'; x.font = 'bold 70px Arial'; x.fillText('→', w - 40, h / 2 - 4); }, 560, 150);
    var s = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.48), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); s.position.set(0, 2.42, 4.6); scene.add(s);
    var s2 = s.clone(); s2.rotation.y = Math.PI; s2.position.z = 4.62; scene.add(s2);
  })();
  (function endWindow() {
    scene.add(posBox(box(HALF_W * 2 - 0.3, CEIL_Y - 0.6, 0.08, emis(0xfff6e8, 0.95)), 0, CEIL_Y / 2, END_Z - 6.9));
    scene.add(posBox(box(HALF_W * 2, CEIL_Y, 0.16, matWallL), 0, CEIL_Y / 2, END_Z - 7));
    [-0.5, 0, 0.5].forEach(function (fx) { scene.add(posBox(box(0.06, CEIL_Y - 0.6, 0.12, matMetal), fx * HALF_W, CEIL_Y / 2, END_Z - 6.85)); });
  })();

  // every solid in the corridor casts + receives soft shadows
  scene.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  /* ════════════ 3D ROOMS you walk into (built lazily on first entry) ════════════ */
  function screenTex(d) {
    return textTex(function (x, w, h) {
      x.fillStyle = '#0e1626'; x.fillRect(0, 0, w, h);
      x.fillStyle = hx(d.color); x.fillRect(0, 0, w, 14);
      x.fillStyle = hx(d.color); x.font = 'bold 34px Arial'; x.textBaseline = 'top'; x.fillText(d.ward + ' · ' + d.name.toUpperCase(), 48, 50);
      x.fillStyle = '#ffffff'; x.font = 'bold 62px Georgia'; wrap(x, d.head, 48, 110, w - 96, 64);
      x.fillStyle = '#cdd8e8'; x.font = '34px Arial';
      d.bullets.forEach(function (b, i) { x.fillStyle = hx(d.color); x.fillRect(48, 270 + i * 70 + 12, 16, 16); x.fillStyle = '#dde6f2'; x.fillText(b, 84, 270 + i * 70); });
      x.fillStyle = '#5ad1c0'; x.font = 'bold 30px Arial'; x.fillText('NeuronFRAMES', 48, h - 60);
    }, 1024, 600);
    function wrap(x, text, ox, oy, maxw, lh) { var words = text.split(' '), line = '', yy = oy; for (var i = 0; i < words.length; i++) { var t = line + words[i] + ' '; if (x.measureText(t).width > maxw && i > 0) { x.fillText(line, ox, yy); line = words[i] + ' '; yy += lh; } else line = t; } x.fillText(line, ox, yy); }
  }
  function buildRoom(d) {
    if (d.roomBuilt) return; d.roomBuilt = true;
    var RW = 5.4, RD = 4.6, RH = 3.0;                       // width(along z), depth(perp), height
    var cx = d.side * (HALF_W + RD / 2), cz = zAt(d.f);      // room centre
    var outX = d.side * (HALF_W + RD);                      // far wall x
    var g = new THREE.Group();
    var rFloor = new THREE.MeshStandardMaterial({ map: floorTex(3, 3), roughness: 0.35, metalness: 0.0, side: THREE.DoubleSide });
    var rWall = new THREE.MeshStandardMaterial({ map: wallTex(3, 1.4), roughness: 0.92, side: THREE.DoubleSide });
    applyPBR(rFloor, 'long_white_tiles', 4, 4);
    applyPBR(rWall, 'painted_plaster_wall', 4, 2, 0xf2e8cf);
    g.add(posBox(box(RD, 0.1, RW, rFloor), cx, -0.05, cz));
    g.add(posBox(box(RD, 0.1, RW, matCeil), cx, RH + 0.05, cz));
    g.add(posBox(box(0.1, RH, RW, rWall), outX, RH / 2, cz));                 // far wall (holds screen)
    g.add(posBox(box(RD, RH, 0.1, rWall), cx, RH / 2, cz - RW / 2));          // back wall
    g.add(posBox(box(RD, RH, 0.1, rWall), cx, RH / 2, cz + RW / 2));          // front wall
    // accent band around
    g.add(posBox(box(0.04, 0.22, RW, matBand), outX - d.side * 0.03, 1.32, cz));
    // ceiling light
    g.add(posBox(box(1.2, 0.06, 0.4, emis(0xffffff, 0.95)), cx, RH - 0.04, cz));
    var rl = new THREE.PointLight(0xffffff, 0.5, 13, 2); rl.position.set(cx, RH - 0.4, cz); g.add(rl);
    // (point-light shadows intentionally off — costly cube maps; the directional
    //  key light + contact shadows carry the grounding, and it keeps low-end GPUs happy)
    // big wall display with the info
    var scr = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.58), new THREE.MeshBasicMaterial({ map: screenTex(d) }));
    scr.position.set(outX - d.side * 0.06, 1.55, cz); scr.rotation.y = d.side < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(scr);
    g.add(posBox((function () { var f = box(2.9, 1.78, 0.08, matDark); f.position.set(outX - d.side * 0.02, 1.55, cz); f.rotation.y = d.side < 0 ? Math.PI / 2 : -Math.PI / 2; return f; })(), 0, 0, 0));
    // window on a side wall (soft daylight, not blown out)
    g.add(posBox(box(RD * 0.7, RH - 1.0, 0.06, emis(0xfff6e8, 0.5)), cx, 1.6, cz - RW / 2 + 0.06));
    // furniture (code-built placeholders, upgraded to real CC0 models on load)
    if (d.type === 'therapy') {
      var bedG = new THREE.Group(); bedG.position.set(cx + d.side * 0.2, 0, cz + 0.6);
      bedG.add(posBox(box(2.0, 0.5, 0.78, matDesk), 0, 0.28, 0));
      bedG.add(posBox(box(2.0, 0.14, 0.82, new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.7 })), 0, 0.58, 0));
      g.add(bedG); contactLocal(g, bedG.position.x, bedG.position.z, 2.3, 1.1);   // clean padded exam table (code-built — no photoreal hospital bed exists free)
      var st = chair(); st.position.set(cx - d.side * 0.7, 0, cz - 0.6); st.rotation.y = d.side < 0 ? -1.4 : 1.4; g.add(st); contactLocal(g, cx - d.side * 0.7, cz - 0.6, 0.8, 0.8);
      swapModel(st, 'stool', 0.6);                                              // photoreal therapist stool
      swapModel(placeholderAt(cx + d.side * (RD / 2 - 0.5), cz - RW / 2 + 0.55, 0, g), 'cabinet', 0.9);
    } else {
      var desk = box(0.7, 0.75, 1.6, matWood); desk.position.set(cx, 0.38, cz - 0.4); g.add(desk);
      g.add(posBox(box(0.5, 0.32, 0.03, emis(0x223047, 0.3)), cx + d.side * 0.05, 1.05, cz - 0.4));
      contactLocal(g, cx, cz - 0.4, 1.0, 1.9);
      var oc = chair(0x556); oc.position.set(cx - d.side * 0.6, 0, cz - 0.4); oc.rotation.y = d.side < 0 ? -1.6 : 1.6; g.add(oc); contactLocal(g, cx - d.side * 0.6, cz - 0.4, 0.8, 0.8);
      swapModel(oc, 'monobloc', 0.9);                                           // photoreal clinical chair
      swapModel(placeholderAt(cx + d.side * (RD / 2 - 0.5), cz - RW / 2 + 0.55, 0, g), 'cabinet', 0.9);
    }
    // plant in the corner
    var pg = new THREE.Group(); pg.add(posBox(cyl(0.18, 0.13, 0.34, new THREE.MeshStandardMaterial({ color: 0xcdd3da }), 14), 0, 0.17, 0));
    var gm = new THREE.MeshStandardMaterial({ color: 0x4f9e57, roughness: 0.85 }); [[0, 0.55, 0.26], [0.12, 0.7, 0.2]].forEach(function (p) { pg.add(posBox(new THREE.Mesh(new THREE.IcosahedronGeometry(p[2], 0), gm), p[0], p[1], 0)); });
    pg.position.set(cx + d.side * (RD / 2 - 0.4), 0, cz + RW / 2 - 0.4); g.add(pg);
    swapModel(pg, 'plant1', 0.85);                                             // photoreal potted plant
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    // camera target inside the room, facing the display + base orientation for free look-around
    d.enterPos = V3(cx - d.side * (RD * 0.3), 1.55, cz + 0.15);
    d.lookAt = V3(outX, 1.5, cz);
    var dummy = new THREE.Object3D(); dummy.rotation.order = 'YXZ'; dummy.position.copy(d.enterPos); dummy.lookAt(d.lookAt);
    d.baseYaw = dummy.rotation.y; d.basePitch = dummy.rotation.x;
  }
  function contactLocal(g, x, z, sx, sz) { var m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.014, z); g.add(m); }

  /* ════════════════════════ CONTROLS + STATE ════════════════════════ */
  var state = { mode: 'hall', dept: null };
  var walk = 0, rafScroll = 0;
  var forcedWalk = (function () { if (typeof window.NF_WALK === 'number') return window.NF_WALK; var m = /[?&]walk=([\d.]+)/.exec(location.search); return m ? parseFloat(m[1]) : null; })();
  function readWalk() {
    rafScroll = 0;
    var rect = track.getBoundingClientRect(); var span = track.offsetHeight - window.innerHeight;
    var p = span > 0 ? (-rect.top) / span : 0; p = p < 0 ? 0 : p > 1 ? 1 : p;
    if (forcedWalk != null) p = forcedWalk;
    walk = p;
    body.classList.toggle('walking', p > 0.012 && state.mode === 'hall');
    if (intro) { var fi = 1 - p / 0.05; fi = fi < 0 ? 0 : fi > 1 ? 1 : fi; intro.style.opacity = fi.toFixed(3); intro.style.pointerEvents = fi > 0.05 ? '' : 'none'; }
    if (outro) { var fo = (p - 0.9) / 0.08; fo = fo < 0 ? 0 : fo > 1 ? 1 : fo; if (state.mode !== 'hall') fo = 0; outro.style.opacity = fo.toFixed(3); outro.style.pointerEvents = fo > 0.4 ? 'auto' : 'none'; }
    updateMap(p);
  }
  function onScroll() { if (!rafScroll) rafScroll = requestAnimationFrame(readWalk); }
  window.addEventListener('scroll', onScroll, { passive: true });

  var ndc = new THREE.Vector2(0, 0), look = { x: 0, y: 0 }, lookT = { x: 0, y: 0 }, MAXYAW = 0.62, MAXPITCH = 0.28;
  var raycaster = new THREE.Raycaster(), hovered = null;
  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', function (e) {
      if (state.mode === 'enter' || state.mode === 'exit') return;   // freeze look during the fly-through
      var nx = e.clientX / window.innerWidth, ny = e.clientY / window.innerHeight;
      ndc.set(nx * 2 - 1, -(ny * 2 - 1));
      lookT.x = -(nx * 2 - 1) * MAXYAW; lookT.y = -(ny * 2 - 1) * MAXPITCH;
      if (hoverTip && hovered) { hoverTip.style.left = e.clientX + 'px'; hoverTip.style.top = e.clientY + 'px'; }
    }, { passive: true });
  }
  function setHover(dept) {
    if (hovered === dept) return;
    if (hovered) hovered.targetOpen = 0; hovered = dept;
    DEPTS.forEach(function (d) { if (d !== hovered) d.targetOpen = 0; }); if (hovered) hovered.targetOpen = 1;
    canvas.style.cursor = hovered ? 'pointer' : '';
    if (hoverTip) { if (hovered) { hoverTip.textContent = (hovered.type === 'office' ? 'Open ' : 'Enter ') + hovered.name; hoverTip.classList.add('on'); } else hoverTip.classList.remove('on'); }
  }
  canvas.addEventListener('click', function () { if (hovered && state.mode === 'hall') startEnter(hovered); });

  /* floor-plan map */
  var stations = map ? Array.prototype.slice.call(map.querySelectorAll('a')) : [];
  var mapDot = map ? map.querySelector('.hall-map-line i') : null;
  function targetTop(frac) { return track.offsetTop + frac * (track.offsetHeight - window.innerHeight); }
  function updateMap(p) {
    if (!stations.length) return; var bi = 0, bd = Infinity;
    stations.forEach(function (a, i) { var f = parseFloat(a.getAttribute('data-go')) || 0; var dd = Math.abs(f - p); if (dd < bd) { bd = dd; bi = i; } });
    stations.forEach(function (a, i) { a.classList.toggle('active', i === bi); });
    if (mapDot) { var a = stations[bi]; mapDot.style.top = (a.offsetTop + a.offsetHeight / 2) + 'px'; }
  }
  stations.forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); if (state.mode === 'hall') window.scrollTo({ top: targetTop(parseFloat(a.getAttribute('data-go')) || 0), behavior: prefersReduced ? 'auto' : 'smooth' }); }); });
  document.querySelectorAll('#hall-doors-a11y button[data-room]').forEach(function (b) {
    var d = DEPTS.filter(function (x) { return x.room === b.getAttribute('data-room'); })[0];
    b.addEventListener('click', function () { if (d) startEnter(d, b); });          // keyboard enters the room too
  });
  document.querySelectorAll('.room-close, .room-back').forEach(function (b) { b.addEventListener('click', closeRoom); });
  var peekBtn = document.getElementById('room-peek');
  if (peekBtn) peekBtn.addEventListener('click', function () { var on = body.classList.toggle('room-peeking'); peekBtn.textContent = on ? 'View information' : 'Look around the room'; });
  if (roomsWrap) roomsWrap.addEventListener('click', function (e) { if (e.target === roomsWrap) closeRoom(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.mode !== 'hall') closeRoom(); });

  /* ── enter / exit a room (camera flies through the doorway) ── */
  var tween = { active: false, t: 0, dur: 1.25, fromP: V3(), toP: V3(), fromT: V3(), toT: V3(), done: null };
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function startTween(toP, toT, dur, done) {
    tween.active = true; tween.t = 0; tween.dur = dur; tween.done = done;
    tween.fromP.copy(camera.position); tween.toP.copy(toP);
    var fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    tween.fromT.copy(camera.position).add(fwd.multiplyScalar(3)); tween.toT.copy(toT);
  }
  function startEnter(d, fromEl) {
    if (state.mode !== 'hall') return;
    buildRoom(d);
    state.mode = 'enter'; state.dept = d; d.targetOpen = 1;
    body.classList.add('cine'); if (hoverTip) hoverTip.classList.remove('on'); setHover(null);
    window.scrollTo(0, targetTop(d.f));                 // keep corridor position synced for the return
    showPanel(d.room, fromEl, true);                    // show the info immediately — never depends on the camera fly finishing
    if (prefersReduced) { camera.position.copy(d.enterPos); state.mode = 'inroom'; return; }
    startTween(d.enterPos, d.lookAt, 1.25, function () { state.mode = 'inroom'; });
  }
  function closeRoom() {
    if (state.mode === 'hall') return;
    var d = state.dept; hidePanel();
    if (d) d.targetOpen = 0;
    if (prefersReduced || !d) { state.mode = 'hall'; state.dept = null; body.classList.remove('cine'); look.x = look.y = lookT.x = lookT.y = 0; onScroll(); return; }
    state.mode = 'exit';
    startTween(V3(0, EYE_Y, zAt(d.f)), V3(0, 1.5, zAt(d.f) - 3), 1.05, function () {
      state.mode = 'hall'; state.dept = null; body.classList.remove('cine'); look.x = look.y = lookT.x = lookT.y = 0; onScroll();
    });
  }

  /* ════════════════════════ RENDER LOOP ════════════════════════ */
  function resize() { var w = viewport.clientWidth, h = viewport.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', function () { resize(); onScroll(); });
  resize();
  var loading = viewport.querySelector('.hall-loading'); if (loading) loading.style.opacity = '0';

  var clock = new THREE.Clock(), rafId = null, running = false, curZ = START_Z, lastZ = START_Z, tmpT = V3();
  function tick() {
    var dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (state.mode === 'hall') {
      var tz = zAt(walk); curZ += (tz - curZ) * 0.12; var speed = Math.min(Math.abs(curZ - lastZ) * 8, 1); lastZ = curZ;
      camera.position.set(0, EYE_Y + Math.sin(t * 7) * 0.012 * speed, curZ);
      look.x += (lookT.x - look.x) * 0.07; look.y += (lookT.y - look.y) * 0.07;
      camera.rotation.set(look.y, look.x, 0);
      raycaster.setFromCamera(ndc, camera); var hit = raycaster.intersectObjects(doorHits, false)[0];
      setHover(hit ? hit.object.userData.dept : null);
    } else if (state.mode === 'enter' || state.mode === 'exit') {
      tween.t += dt / tween.dur; var e = ease(Math.min(tween.t, 1));
      camera.position.lerpVectors(tween.fromP, tween.toP, e);
      tmpT.lerpVectors(tween.fromT, tween.toT, e); camera.lookAt(tmpT);
      if (tween.t >= 1 && tween.active) { tween.active = false; if (tween.done) tween.done(); }
    } else if (state.mode === 'inroom' && state.dept) {
      var d = state.dept; camera.position.copy(d.enterPos);
      look.x += (lookT.x - look.x) * 0.06; look.y += (lookT.y - look.y) * 0.06;
      // free look-around the room (wide yaw, generous pitch)
      camera.rotation.set(d.basePitch + look.y * 1.5, d.baseYaw + look.x * 1.7, 0);
    }
    DEPTS.forEach(function (d) {
      d.open += (d.targetOpen - d.open) * 0.16;
      if (d.pivot) d.pivot.rotation.y = -d.open * 1.2 * (d.side < 0 ? 1 : -1);
      if (d.glow) d.glow.material.emissiveIntensity = 0.45 + d.open * 1.0;
      if (d.strip) d.strip.material.emissiveIntensity = 0.9 + d.open * 1.0;
    });
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  function start() { if (!running) { running = true; clock.start(); rafId = requestAnimationFrame(tick); } }
  function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  window.addEventListener('pagehide', function () { stop(); renderer.dispose(); }, { once: true });

  readWalk(); start();
  window.addEventListener('load', function () { resize(); onScroll(); });

  // dev hook: window.NF_ROOM = 'room-pt' jumps straight inside a room (for screenshots)
  if (window.NF_ROOM) { var dd = DEPTS.filter(function (x) { return x.room === window.NF_ROOM; })[0]; if (dd) { buildRoom(dd); state.mode = 'inroom'; state.dept = dd; dd.open = dd.targetOpen = 1; camera.position.copy(dd.enterPos); showPanel(dd.room, null, true); } }
})();
