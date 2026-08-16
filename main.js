(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById('year');
  // Pinned to a fixed footer year per explicit request (was dynamically
  // computed via new Date().getFullYear()) — flagged in the implementation
  // summary since this means the footer will no longer auto-update.
  if (yearEl) yearEl.textContent = '2024';

  /* ---------- Header scroll condense ---------- */
  var header = document.getElementById('site-header');
  var lastScrollState = false;
  function onHeaderScroll() {
    var scrolled = window.scrollY > 12;
    if (scrolled !== lastScrollState) {
      header.classList.toggle('is-scrolled', scrolled);
      lastScrollState = scrolled;
    }
  }
  window.addEventListener('scroll', onHeaderScroll, { passive: true });
  onHeaderScroll();

  /* ---------- MOBILE NAV — rebuilt, class-driven, no [hidden] conflicts ----------
     Bug in the previous build: a CSS rule set display:flex on .mobile-nav
     unconditionally, silently overriding the [hidden] attribute, so the
     panel stayed interactive (and unclosable) even while "hidden."
     Fix: a single source of truth — the .is-open class — controls both
     visibility and interactivity. No attribute/class conflict is possible. */
  var menuToggle = document.getElementById('menu-toggle');
  var menuClose = document.getElementById('menu-close');
  var mobileNav = document.getElementById('mobile-nav');
  var htmlEl = document.documentElement;
  var lastFocused = null;

  function openMenu() {
    lastFocused = document.activeElement;
    mobileNav.classList.add('is-open');
    htmlEl.classList.add('nav-open');
    menuToggle.setAttribute('aria-expanded', 'true');
    menuClose.focus();
  }
  function closeMenu() {
    mobileNav.classList.remove('is-open');
    htmlEl.classList.remove('nav-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    if (lastFocused) lastFocused.focus();
  }
  menuToggle.addEventListener('click', openMenu);
  menuClose.addEventListener('click', closeMenu);
  mobileNav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mobileNav.classList.contains('is-open')) {
      closeMenu();
    }
  });
  // Simple focus trap while open
  mobileNav.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !mobileNav.classList.contains('is-open')) return;
    var focusables = mobileNav.querySelectorAll('a, button');
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  /* ---------- Hero parallax (subtle, disabled under reduced motion) ----------
     Applied to the .opening-media wrapper, not the <img> — the img already
     carries the CSS entrance-zoom animation, and animating the same property
     on the same element from two places would fight (the animation's
     forwards-filled value takes precedence over an inline style). */
  var heroWrap = document.querySelector('.opening-media');
  var heroSection = document.querySelector('.beat-opening');
  if (heroWrap && heroSection && !reduceMotion) {
    var heroTicking = false;
    function updateHeroParallax() {
      heroTicking = false;
      var rect = heroSection.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      heroWrap.style.transform = 'translateY(' + (rect.top * -0.08) + 'px)';
    }
    window.addEventListener('scroll', function () {
      if (!heroTicking) { requestAnimationFrame(updateHeroParallax); heroTicking = true; }
    }, { passive: true });
  }

  /* ---------- Scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Signature interaction: reticle cursor ---------- */
  var reticle = document.getElementById('reticle');
  if (fine && !reduceMotion && reticle) {
    var rx = 0, ry = 0, tx = 0, ty = 0;
    var active = false;

    window.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!active) { reticle.classList.add('is-active'); active = true; }
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var isInteractive = el && el.closest('a, button, input, textarea, .panel');
      reticle.classList.toggle('is-snapped', !!isInteractive);
    });
    window.addEventListener('mouseleave', function () {
      reticle.classList.remove('is-active');
      active = false;
    });

    function raf() {
      rx += (tx - rx) * 0.25;
      ry += (ty - ry) * 0.25;
      reticle.style.left = rx + 'px';
      reticle.style.top = ry + 'px';
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  /* ---------- Tension field — a full-bleed line grid under cursor tension ----------
     Lines are generated to match the container's real width so spacing stays
     even at any viewport, then rebuilt (debounced) on resize. Each line is an
     SVG quadratic curve; the shared applyTensionAt() pulls nearby control
     points toward a given point with a distance falloff, and releaseTension()
     resets them — `d` is a CSS-animatable attribute when the path's command
     count stays constant (it always does here), so the "spring back" is
     handled by the transition already declared in CSS, not JS.
     Three input paths share that same mechanic: desktop mouse (hover),
     touch drag (tablet/mobile — no hover dependency), and one automatic
     sweep the first time non-pointer devices scroll the section into view,
     so the idea is demonstrated even before anyone touches the screen. */
  var tensionField = document.getElementById('tension-field');
  var tensionSvg = document.getElementById('tension-svg');
  if (tensionField && tensionSvg) {
    var tensionLines = [];

    function straightPath(x, h) { return 'M' + x + ',0 Q' + x + ',' + (h / 2) + ' ' + x + ',' + h; }

    function buildTensionField() {
      var rect = tensionField.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      tensionSvg.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
      tensionSvg.innerHTML = '';
      tensionLines = [];
      var targetSpacing = rect.width < 700 ? 22 : 30;
      var count = Math.max(10, Math.round(rect.width / targetSpacing));
      var spacing = rect.width / count;
      for (var i = 0; i < count; i++) {
        var x = spacing * (i + 0.5);
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'tension-line');
        path.setAttribute('d', straightPath(x, rect.height));
        tensionSvg.appendChild(path);
        tensionLines.push({ el: path, baseX: x });
      }
    }
    buildTensionField();

    var tensionResizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(tensionResizeTimer);
      tensionResizeTimer = setTimeout(buildTensionField, 200);
    }, { passive: true });

    function releaseTension() {
      var h = tensionField.getBoundingClientRect().height;
      tensionLines.forEach(function (line) {
        line.el.setAttribute('d', straightPath(line.baseX, h));
        line.el.style.strokeOpacity = 0.4;
      });
    }

    function applyTensionAt(mx, my, rect) {
      var clampedY = Math.max(0, Math.min(rect.height, my));
      var sigma = rect.width * 0.12;
      tensionLines.forEach(function (line) {
        var dx = mx - line.baseX;
        var pull = Math.exp(-(dx * dx) / (2 * sigma * sigma));
        var controlX = line.baseX + dx * pull;
        line.el.setAttribute('d', 'M' + line.baseX + ',0 Q' + controlX + ',' + clampedY + ' ' + line.baseX + ',' + rect.height);
        line.el.style.strokeOpacity = 0.4 + pull * 0.6;
      });
    }

    // Desktop — real cursor, hover-driven.
    if (fine && !reduceMotion) {
      var tensionTicking = false;
      var tensionEvent = null;
      tensionField.addEventListener('mousemove', function (e) {
        tensionEvent = e;
        if (!tensionTicking) { requestAnimationFrame(updateFromMouse); tensionTicking = true; }
      });
      tensionField.addEventListener('mouseleave', releaseTension);
      function updateFromMouse() {
        tensionTicking = false;
        var rect = tensionField.getBoundingClientRect();
        applyTensionAt(tensionEvent.clientX - rect.left, tensionEvent.clientY - rect.top, rect);
      }
    }

    // Tablet / mobile — direct finger drag, independent of any hover state.
    if (!reduceMotion) {
      var touchTicking = false;
      var touchPoint = null;
      tensionField.addEventListener('touchmove', function (e) {
        if (e.touches && e.touches[0]) {
          touchPoint = e.touches[0];
          if (!touchTicking) { requestAnimationFrame(updateFromTouch); touchTicking = true; }
        }
      }, { passive: true });
      tensionField.addEventListener('touchend', releaseTension);
      tensionField.addEventListener('touchcancel', releaseTension);
      function updateFromTouch() {
        touchTicking = false;
        var rect = tensionField.getBoundingClientRect();
        applyTensionAt(touchPoint.clientX - rect.left, touchPoint.clientY - rect.top, rect);
      }
    }

    // Non-fine pointers only — a single automatic sweep the first time the
    // field scrolls into view, so the concept is demonstrated even before a
    // touch happens (a hover-only interaction offers zero discoverability
    // on a phone). Desktop never runs this — hover is already immediate.
    if (!fine && !reduceMotion && 'IntersectionObserver' in window) {
      var sweepObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            runTensionSweep();
            sweepObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      sweepObserver.observe(tensionField);
    }

    function runTensionSweep() {
      var duration = 1400;
      var start = null;
      function frame(ts) {
        if (!start) start = ts;
        var t = Math.min(1, (ts - start) / duration);
        var eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        var rect = tensionField.getBoundingClientRect();
        applyTensionAt(eased * rect.width, rect.height * 0.5, rect);
        if (t < 1) { requestAnimationFrame(frame); } else { releaseTension(); }
      }
      requestAnimationFrame(frame);
    }
  }

  /* ---------- Live system readout (section spy) ---------- */
  var sysSection = document.getElementById('sys-section');
  var beats = document.querySelectorAll('.beat[data-section-label]');
  if (sysSection && beats.length && 'IntersectionObserver' in window) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          sysSection.textContent = entry.target.getAttribute('data-section-label');
        }
      });
    }, { threshold: 0, rootMargin: '-45% 0px -45% 0px' });
    beats.forEach(function (b) { sectionObserver.observe(b); });
  }

  /* ---------- The System — CONCENTRATION -> BUILD -> RELEASE -> DISPERSION -> SETTLED ----------
     Particle field, same core mechanism as before: particles carry a `kind`
     ('haze' soft/large on the blurred canvas, 'particle' sharper on the
     crisp canvas, 'highlight' a small crisp-detail subset) and a `residual`
     flag (keeps a low non-zero presence + gentle drift once SETTLED).
     STRUCTURAL REWRITE (this round): the render surface (#system-visual)
     is no longer sized by CSS bleed guesses layered on the content box.
     sizeSystemVisual() measures the actual bottom of Hero and actual top
     of #performance and positions #system-visual to span exactly that
     region — guaranteed correct coverage regardless of content height or
     breakpoint. sizeCloudCanvas() then separately tracks `logicalH` (the
     height of #system-burst's own content — Discover through Grow) and
     `bleedTop` (how far #system-visual's top sits above that content), so
     particle SCALE and ORIGIN stay based on the actual stage-list content
     exactly as before — only the available canvas render area grew. */
  var systemVisual = document.getElementById('system-visual');
  var systemBurst = document.getElementById('system-burst');
  var systemCloud = document.getElementById('system-cloud');
  var systemCloudSharp = document.getElementById('system-cloud-sharp');
  var systemBurstReadout = document.getElementById('system-burst-readout');
  var systemSectionEl = document.getElementById('system-section');
  var heroEl = document.querySelector('.beat-opening');
  var perfEl = document.getElementById('performance');

  function lerp(a, b, t) { return a + (b - a) * t; }

  // Cheap 2D pseudo-turbulence — a few overlapping sine terms, not real
  // Perlin/Simplex noise (no lookup tables, no dependency), but enough to
  // curl particle paths organically instead of pure radial motion.
  function turbNoise(x, y, t) {
    return Math.sin(x * 0.012 + t * 0.6) * Math.cos(y * 0.011 - t * 0.45)
         + Math.sin((x + y) * 0.007 - t * 0.32) * 0.6;
  }

  if (systemVisual && systemBurst && systemCloud && systemCloudSharp && systemCloud.getContext) {
    var ctxHaze = systemCloud.getContext('2d');
    var ctxSharp = systemCloudSharp.getContext('2d');
    var vw = window.matchMedia('(max-width: 699px)').matches ? 'mobile'
      : window.matchMedia('(max-width: 1023px)').matches ? 'tablet' : 'desktop';
    var PARTICLE_COUNT = vw === 'mobile' ? 60 : vw === 'tablet' ? 140 : 220;
    var dpr = Math.min(window.devicePixelRatio || 1, vw === 'mobile' ? 1.25 : 1.6);
    var cw = 0, ch = 0, logicalH = 0, bleedTop = 0;

    // Measures Hero's real bottom edge and #performance's real top edge (in
    // the same synchronous read, so scroll position can't skew the
    // difference) and positions #system-visual to span exactly that gap,
    // relative to #system-section's own box. This is the actual fix: no
    // guessed pixel constant, no CSS-only bleed — the render surface is
    // sized to the real, current layout every time this runs.
    function sizeSystemVisual() {
      if (!heroEl || !perfEl || !systemSectionEl) return;
      var heroRect = heroEl.getBoundingClientRect();
      var perfRect = perfEl.getBoundingClientRect();
      var sectionRect = systemSectionEl.getBoundingClientRect();
      var top = heroRect.bottom - sectionRect.top;
      var bottom = perfRect.top - sectionRect.top;
      systemVisual.style.top = top + 'px';
      systemVisual.style.height = Math.max(0, bottom - top) + 'px';
    }

    // Bake sprite variants once — drawImage per particle is what makes
    // hundreds of particles cheap; a fresh gradient per particle per frame
    // would not be. Three variants give the layers distinct character:
    // haze (wide, soft falloff), particle (tighter, higher-contrast edge),
    // highlight (near-solid, minimal falloff — genuinely crisp).
    function makeSprite(stops, size) {
      var sc = document.createElement('canvas');
      sc.width = sc.height = size;
      var sctx = sc.getContext('2d');
      var g = sctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      sctx.fill();
      return sc;
    }
    var spriteHaze = makeSprite([
      [0, 'rgba(80,200,150,0.55)'], [0.45, 'rgba(20,55,42,0.45)'], [1, 'rgba(10,11,13,0)']
    ], 96);
    var spriteParticle = makeSprite([
      [0, 'rgba(160,255,205,0.95)'], [0.7, 'rgba(61,255,171,0.7)'], [1, 'rgba(61,255,171,0)']
    ], 40);
    var spriteHighlight = makeSprite([
      [0, 'rgba(235,255,245,1)'], [0.55, 'rgba(190,255,225,0.9)'], [1, 'rgba(61,255,171,0)']
    ], 20);

    function sizeCloudCanvas() {
      // sizeSystemVisual() must run first — it positions/sizes
      // #system-visual itself (the actual coverage fix); this function
      // then just matches the two canvases to whatever that resolved to,
      // and separately captures #system-burst's own (unbled) content
      // height/position so particle scale and origin stay anchored to the
      // real Discover-Grow content, not to the much larger render area.
      sizeSystemVisual();
      var rect = systemCloud.getBoundingClientRect();
      var logicalRect = systemBurst.getBoundingClientRect();
      cw = rect.width; ch = rect.height;
      logicalH = logicalRect.height;
      bleedTop = logicalRect.top - rect.top;
      systemCloud.width = systemCloudSharp.width = Math.max(1, Math.round(cw * dpr));
      systemCloud.height = systemCloudSharp.height = Math.max(1, Math.round(ch * dpr));
      ctxHaze.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxSharp.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // A handful of loose "lobe" directions particles are weighted toward —
    // this is what keeps the cloud irregular and multi-armed rather than a
    // perfectly isotropic disc, without hand-placing individual shapes.
    var LOBES = [18, 75, 132, 190, 244, 301, 340];

    function makeParticle() {
      var lobe = LOBES[(Math.random() * LOBES.length) | 0] + (Math.random() - 0.5) * 46;
      var roll = Math.random();
      var kind = roll < 0.60 ? 'haze' : roll < 0.96 ? 'particle' : 'highlight';
      var residual = kind === 'highlight' ? true
        : kind === 'particle' ? Math.random() < 0.4
        : Math.random() < 0.12;
      var sprite = kind === 'haze' ? spriteHaze : kind === 'particle' ? spriteParticle : spriteHighlight;
      var size = kind === 'haze' ? (0.55 + Math.random() * 1.15)
        : kind === 'particle' ? (0.16 + Math.random() * 0.24)
        : (0.09 + Math.random() * 0.07);
      var alpha = kind === 'haze' ? (0.18 + Math.random() * 0.3)
        : kind === 'particle' ? (0.4 + Math.random() * 0.45)
        : (0.75 + Math.random() * 0.25);
      return {
        x: 0, y: 0, ox: (Math.random() - 0.5) * 0.06, oy: (Math.random() - 0.5) * 0.06,
        vx: 0, vy: 0,
        angle: lobe, spread: 0.35 + Math.random() * 0.65,
        size: size, alpha: alpha, kind: kind, sprite: sprite, residual: residual,
        seed: Math.random() * 1000,
        wob: 0.6 + Math.random() * 0.8
      };
    }
    var particles = [];
    for (var pi = 0; pi < PARTICLE_COUNT; pi++) particles.push(makeParticle());
    var residualParticles = particles.filter(function (p) { return p.residual; });

    sizeCloudCanvas();
    var sizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(sizeTimer);
      sizeTimer = setTimeout(function () { sizeCloudCanvas(); renderParticles(lastEnergyState, lastRenderList); }, 200);
    }, { passive: true });

    // CONCENTRATION -> BUILD -> RELEASE -> DISPERSION -> SETTLED, expressed
    // as a target "energy" (outward velocity + turbulence strength) and two
    // alpha tracks: `alpha` for the bulk of particles (fades toward a very
    // low, not-quite-zero trace) and `alphaResidual` for the marked
    // residual subset (settles to a clearly visible-but-subtle level) — the
    // fix for "everything disappears into empty black": something always
    // remains, and it's the sharper/brighter elements that linger longest.
    function shapeSystem(mp) {
      var energy, turb, alpha, alphaResidual;
      if (mp < 0.08) {
        var t = mp / 0.08; energy = 0; turb = lerp(0.1, 0.18, t);
        alpha = lerp(0.55, 0.7, t); alphaResidual = alpha;
      } else if (mp < 0.24) {
        var t2 = (mp - 0.08) / 0.16; energy = lerp(0, 0.32, t2); turb = lerp(0.18, 0.42, t2);
        alpha = lerp(0.7, 0.85, t2); alphaResidual = alpha;
      } else if (mp < 0.50) {
        var t3 = (mp - 0.24) / 0.26; energy = lerp(0.32, 1, t3); turb = lerp(0.42, 0.9, t3);
        alpha = lerp(0.85, 1, t3); alphaResidual = alpha;
      } else if (mp < 0.78) {
        var t4 = (mp - 0.50) / 0.28; energy = lerp(1, 0.5, t4); turb = lerp(0.9, 0.6, t4);
        alpha = lerp(1, 0.85, t4); alphaResidual = alpha;
      } else {
        var t5 = Math.min(1, (mp - 0.78) / 0.22);
        energy = lerp(0.5, 0.09, t5); turb = 0.28;
        alpha = lerp(0.85, 0.05, t5);          // bulk fades to a faint trace
        alphaResidual = lerp(0.85, 0.42, t5);  // residual settles, stays visible
      }
      return { energy: energy, turb: turb, alpha: alpha, alphaResidual: alphaResidual };
    }

    var SETTLE_EPS = 0.03;
    var lastEnergyState = { energy: 0, turb: 0.12, alpha: 0.55, alphaResidual: 0.55 };
    var lastRenderList = particles;
    var simTime = 0;

    function stepParticles(dt, state, list) {
      var ref = Math.min(cw, logicalH); // logicalH, not ch — keeps scale identical to pre-bleed
      var maxSpeed = ref * 0.62 * state.energy + ref * 0.02;
      var accel = 3.2;
      var drag = 0.965;
      var vmax = 0;
      simTime += dt;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var rad = (p.angle * Math.PI) / 180;
        var tx = Math.cos(rad) * maxSpeed * p.spread;
        var ty = Math.sin(rad) * maxSpeed * p.spread;
        var n = turbNoise(p.x * 0.5 + p.seed, p.y * 0.5 + p.seed, simTime * p.wob) * state.turb * ref * 0.9;
        tx += Math.cos(rad + Math.PI / 2) * n;
        ty += Math.sin(rad + Math.PI / 2) * n;
        p.vx += (tx - p.vx) * Math.min(1, accel * dt);
        p.vy += (ty - p.vy) * Math.min(1, accel * dt);
        p.vx *= drag; p.vy *= drag;
        p.x += p.vx * dt; p.y += p.vy * dt;
        var speed = Math.abs(p.vx) + Math.abs(p.vy);
        if (speed > vmax) vmax = speed;
      }
      return vmax;
    }

    function renderParticles(state, list) {
      if (!cw || !ch) return;
      lastEnergyState = state; lastRenderList = list;
      // Clear the RAW pixel buffer (identity transform), not the fractional
      // CSS-space rect. clearRect(0,0,cw,ch) under the dpr transform can
      // leave a sub-pixel sliver of the previous frame uncleared whenever
      // cw*dpr / ch*dpr isn't an exact integer (Math.round in
      // sizeCloudCanvas almost guarantees a fractional mismatch) — that
      // sliver compounds frame over frame during the heaviest redraw
      // stretch (BUILD/RELEASE) into a visible hairline at the buffer's
      // edge. Resetting to identity to clear the full integer bitmap, then
      // restoring the dpr transform for drawing, removes the artifact at
      // its source rather than papering over it.
      ctxHaze.save(); ctxHaze.setTransform(1, 0, 0, 1, 0, 0);
      ctxHaze.clearRect(0, 0, systemCloud.width, systemCloud.height);
      ctxHaze.restore();
      ctxSharp.save(); ctxSharp.setTransform(1, 0, 0, 1, 0, 0);
      ctxSharp.clearRect(0, 0, systemCloudSharp.width, systemCloudSharp.height);
      ctxSharp.restore();
      var cx = cw / 2, cy = bleedTop + logicalH / 2; // origin stays anchored to the logical content's
      var ref = Math.min(cw, logicalH);              // own center, exactly as before the bleed existed
      ctxHaze.globalCompositeOperation = 'lighter';
      ctxSharp.globalCompositeOperation = 'lighter';
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var baseR = ref * 0.11 * p.size;
        var mul = p.residual ? state.alphaResidual : state.alpha;
        var a = p.alpha * mul;
        if (a <= 0.004 || baseR <= 0.4) continue;
        var px = cx + p.ox * ref + p.x;
        var py = cy + p.oy * ref + p.y;
        var targetCtx = p.kind === 'haze' ? ctxHaze : ctxSharp;
        targetCtx.globalAlpha = a;
        targetCtx.drawImage(p.sprite, px - baseR, py - baseR, baseR * 2, baseR * 2);
      }
      ctxHaze.globalAlpha = 1; ctxHaze.globalCompositeOperation = 'source-over';
      ctxSharp.globalAlpha = 1; ctxSharp.globalCompositeOperation = 'source-over';
    }

    var animFrame = null;
    var lastFrameTime = 0;
    var lastProgressForLoop = -1;

    function tick(now) {
      var dt = Math.min(0.05, lastFrameTime ? (now - lastFrameTime) / 1000 : 0.016);
      lastFrameTime = now;
      var state = shapeSystem(systemMaxP);
      // Once fully settled, only the smaller residual subset keeps moving —
      // the persistent gentle drift this round asks for stays cheap because
      // it's ~10-15% of the full particle count, not all of it.
      var settledMode = systemMaxP >= 0.999;
      if (settledMode && !burstVisible) { animFrame = null; return; }
      var activeList = settledMode ? residualParticles : particles;
      var maxSpeed = stepParticles(dt, state, activeList);
      renderParticles(state, activeList);
      var progressMoved = systemMaxP !== lastProgressForLoop;
      lastProgressForLoop = systemMaxP;
      var ref = Math.min(cw, logicalH) || 1;
      // In settled mode the residual subset is intentionally kept gently
      // drifting indefinitely (this round's "minimal movement" requirement)
      // rather than self-terminating like the transient build/release phases.
      if (settledMode || progressMoved || maxSpeed > ref * SETTLE_EPS) {
        animFrame = requestAnimationFrame(tick);
      } else {
        animFrame = null;
      }
    }
    function ensureSimRunning() {
      if (!animFrame) {
        lastFrameTime = 0;
        animFrame = requestAnimationFrame(tick);
      }
    }

    // The residual drift loop persists indefinitely once settled (this
    // round's "minimal movement" requirement), but it shouldn't keep
    // running while the section is nowhere near the viewport — pause it
    // when fully out of view, resume when it's back.
    var burstVisible = true;
    if ('IntersectionObserver' in window) {
      var burstVisObserver = new IntersectionObserver(function (entries) {
        burstVisible = entries[0].isIntersecting;
        if (burstVisible) ensureSimRunning();
      }, { threshold: 0 });
      burstVisObserver.observe(systemVisual);
    }

    var systemMaxP = 0;

    if (reduceMotion) {
      // One synchronous "fast-forward" to an approximate settled/dispersed
      // arrangement, then a single static render — no rAF, no simulation
      // loop, ever, but also no clustered-at-center starting pose passed
      // off as "settled."
      var settleState = shapeSystem(1);
      for (var warm = 0; warm < 90; warm++) { stepParticles(0.05, settleState, particles); }
      renderParticles(settleState, particles);
      systemVisual.classList.add('is-live');
      if (systemBurstReadout) systemBurstReadout.textContent = 'SYSTEM COMPLETE';
    } else {
      renderParticles({ energy: 0, turb: 0.12, alpha: 0.55, alphaResidual: 0.55 }, particles); // static CONCENTRATION frame
      var systemTicking = false;
      var systemDone = false;
      var systemLive = false;
      var systemSettled = false;
      // Readout now speaks the SAME vocabulary as the stage list below it
      // (Discover/Design/Build/Grow) instead of the cloud's internal phase
      // names (which used to jump straight from "BUILD" to "RELEASE" and
      // "DISPERSION" — never once saying "Grow" — which is why Grow read as
      // disconnected from whatever the readout was narrating). This is a
      // label/threshold change only; shapeSystem()'s actual phase math is
      // untouched. "SYSTEM COMPLETE" gives Grow's arrival a clear closing
      // beat instead of the sequence just trailing off.
      var STAGE_NAMES = [
        [0.04, 'DISCOVER'], [0.28, 'DESIGN'], [0.52, 'BUILD'], [0.76, 'GROW'], [0.95, 'SYSTEM COMPLETE']
      ];
      var lastStageIdx = -1;

      function updateSystemBurst() {
        systemTicking = false;
        // Paced across the WHOLE section (burst + all four stages), not
        // just the small burst box — previously progress was tied only to
        // the burst's own short height, so the cloud reached SETTLED almost
        // immediately and then sat static while the user was still reading
        // through Design/Build/Grow, which is exactly why Grow felt
        // disconnected from "the animation." Phase thresholds inside
        // shapeSystem() are unchanged; only how much scrolling maps to a
        // given mp value changes, so SETTLED now naturally lands around
        // when Grow is being read, not hundreds of pixels earlier.
        var rect = (systemSectionEl || systemBurst).getBoundingClientRect();
        var vh = window.innerHeight;
        var raw = (vh - rect.top) / (rect.height + vh * 0.3);
        var p = Math.min(1, Math.max(0, raw));
        if (p > systemMaxP) { systemMaxP = p; ensureSimRunning(); }

        if (!systemLive && systemMaxP > 0.01) {
          systemLive = true;
          systemVisual.classList.add('is-live');
        }
        if (systemBurstReadout) {
          var idx = -1;
          for (var k = 0; k < STAGE_NAMES.length; k++) {
            if (systemMaxP >= STAGE_NAMES[k][0]) idx = k;
          }
          if (idx !== lastStageIdx && idx >= 0) {
            systemBurstReadout.textContent = STAGE_NAMES[idx][1];
            lastStageIdx = idx;
          }
        }
        if (!systemSettled && systemMaxP >= 0.999) {
          systemSettled = true;
          systemVisual.classList.add('is-resolved');
          ensureSimRunning(); // keep the residual subset drifting once settled
        }
        if (systemMaxP >= 1 && systemDone === false && systemSettled) {
          systemDone = true;
          window.removeEventListener('scroll', onSystemScroll);
        }
      }
      function onSystemScroll() {
        if (!systemTicking) { requestAnimationFrame(updateSystemBurst); systemTicking = true; }
      }
      window.addEventListener('scroll', onSystemScroll, { passive: true });
      updateSystemBurst();
    }
  }

  // Each stage (Discover/Design/Build/Grow) now reveals individually as it
  // scrolls into view, rather than all four fading in together the instant
  // the cloud starts moving — this is what makes Grow read as the final
  // beat of a sequence instead of content that already appeared and is
  // just sitting there while the cloud does something unrelated above it.
  var systemStageNodes = document.querySelectorAll('.system-node');
  if (systemStageNodes.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      systemStageNodes.forEach(function (n) { n.classList.add('is-active'); });
    } else {
      var stageObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-active');
            stageObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4, rootMargin: '0px 0px -10% 0px' });
      systemStageNodes.forEach(function (n) { stageObserver.observe(n); });
    }
  }

  /* ---------- Performance banner — one-time counter ---------- */
  var perfNumber = document.getElementById('performance-number');
  var perfNumberValue = document.getElementById('performance-number-value');
  var perfSection = document.getElementById('performance');
  if (perfNumber && perfNumberValue && perfSection) {
    var runPerfCounter = function () {
      var duration = 2800; // within the requested 2.5-3s window — was 2200ms, still read as brief
      var start = null;
      function frame(ts) {
        if (!start) start = ts;
        var t = Math.min(1, (ts - start) / duration);
        var eased = 1 - Math.pow(1 - t, 2.4); // confident deceleration into the final value —
        var val = eased * 2.0;                 // stronger settle than a plain quadratic ease
        perfNumberValue.textContent = val.toFixed(1) + 's';
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          perfNumberValue.textContent = '2.0s';
        }
      }
      requestAnimationFrame(frame);
    };
    if (reduceMotion) {
      perfNumberValue.textContent = '2.0s';
    } else if ('IntersectionObserver' in window) {
      var perfObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            runPerfCounter();
            perfObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      perfObserver.observe(perfSection);
    } else {
      perfNumberValue.textContent = '2.0s';
    }
  }

  /* ---------- Three Layers / One Product (What We Build) ----------
     Semantic tablist/tab pattern, persisted selection via click/tap/
     keyboard exactly like Blueprint's, PLUS a hover preview on fine
     pointers only: hovering a capability temporarily shows its isolated
     layer without changing the persisted selection, and mouseleave
     restores whatever was last actually selected (defaulting to "all"). */
  var tlWidget = document.querySelector('.layers-widget');
  if (tlWidget) {
    var tlTabs = Array.prototype.slice.call(tlWidget.querySelectorAll('.layers-tab'));
    var tlStage = document.getElementById('layers-stage');
    var tlReadout = document.getElementById('layers-readout');
    var tlFooter = document.getElementById('layers-footer');
    var TL_READOUT = {
      '1': 'LAYER 01 — WEBSITE', '2': 'LAYER 02 — UI / UX', '3': 'LAYER 03 — DISCOVERABILITY', 'all': 'COMBINED PRODUCT'
    };
    var TL_FOOTER = {
      '1': 'DESIGNED & BUILT — BREAKPOINT SM / MD / LG',
      '2': 'JOURNEY — 1 PRIMARY PATH, 1 ALTERNATE',
      '3': 'FAST — CRAWLABLE — STRUCTURED',
      'all': 'STRUCTURE + JOURNEY + DISCOVERABILITY'
    };

    function paintLayers(target) {
      if (tlStage) tlStage.setAttribute('data-active', target);
      if (tlReadout) tlReadout.textContent = TL_READOUT[target] || '';
      if (tlFooter) tlFooter.textContent = TL_FOOTER[target] || '';
    }

    function activateLayerTab(target, focusTab) {
      tlTabs.forEach(function (t) {
        var active = t.getAttribute('data-target') === target;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
        t.tabIndex = active ? 0 : -1;
        if (active && focusTab) t.focus();
      });
      paintLayers(target);
    }

    tlTabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { activateLayerTab(tab.getAttribute('data-target'), false); });
      tab.addEventListener('keydown', function (e) {
        var nextIndex = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') nextIndex = (i + 1) % tlTabs.length;
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nextIndex = (i - 1 + tlTabs.length) % tlTabs.length;
        else if (e.key === 'Home') nextIndex = 0;
        else if (e.key === 'End') nextIndex = tlTabs.length - 1;
        if (nextIndex !== null) {
          e.preventDefault();
          activateLayerTab(tlTabs[nextIndex].getAttribute('data-target'), true);
        }
      });
    });

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      tlTabs.forEach(function (tab) {
        tab.addEventListener('mouseenter', function () { paintLayers(tab.getAttribute('data-target')); });
      });
      tlWidget.addEventListener('mouseleave', function () {
        var current = tlTabs.filter(function (t) { return t.classList.contains('is-active'); })[0];
        paintLayers(current ? current.getAttribute('data-target') : 'all');
      });
    }
  }

  /* ---------- Selected Work — 3D project carousel ----------
     Data-driven: WORK_PROJECTS is the single source of truth for project
     text (adding/removing a project is a one-entry change here, not a
     markup rewrite). Project/company names and URLs are not translated;
     only the description picks es/en based on document.documentElement.lang
     — the same small-runtime-string exception used for the contact form.
     The 3D stage (.work-slide, image only) and the single external
     #work-info block are kept in sync from the same active index.
     #work-info is normal-flow, so it can never overflow a fixed-height 3D
     box and collide with the nav below it. Arrow keys work once the
     carousel region has focus; touch devices get horizontal swipe. No
     autoplay. */
  var workCarousel = document.getElementById('work-carousel');
  if (workCarousel) {
    var WORK_LANG = document.documentElement.lang === 'es' ? 'es' : 'en';
    var WORK_PROJECTS = [
      { title: 'Fundación La Libertad', url: 'https://lalibertadcr.org/',
        desc: { es: 'Espacio digital para una iniciativa dedicada a la comunidad, el deporte y la formación.',
                en: 'Digital experience for an initiative focused on community, sports and education.' } },
      { title: 'Parker & Sons', url: 'https://www.parkerandsons.com/',
        desc: { es: 'Proyecto web desarrollado en colaboración para una empresa de servicios para el hogar.',
                en: 'Collaborative web project for a leading home services company.' } },
      { title: 'Moonleaf Cleaning', url: 'https://chaperslab.github.io/moonleaf-cleaning/',
        desc: { es: 'Sitio web creado para una empresa de servicios profesionales de limpieza.',
                en: 'Website created for a professional cleaning services company.' } },
      { title: "Boothe's", url: 'https://www.boothehvac.com/',
        desc: { es: 'Proyecto web desarrollado en colaboración para una empresa de servicios para el hogar.',
                en: 'Collaborative web project for a home services company.' } }
    ];

    var workSlides = Array.prototype.slice.call(workCarousel.querySelectorAll('.work-slide'));
    var workPrevBtn = document.getElementById('work-prev');
    var workNextBtn = document.getElementById('work-next');
    var workPosCurrent = document.getElementById('work-position-current');
    var workPosTotal = document.getElementById('work-position-total');
    var workInfo = document.getElementById('work-info');
    var workInfoTitle = document.getElementById('work-info-title');
    var workInfoCategory = document.getElementById('work-info-category');
    var workInfoDesc = document.getElementById('work-info-desc');
    var workTotal = workSlides.length;
    var workActive = 0;

    function paintWorkInfo() {
      var p = WORK_PROJECTS[workActive];
      if (!p) return;
      if (workInfoTitle) workInfoTitle.textContent = p.title;
      // No category data exists for these real projects (only name,
      // description and URL were supplied) — hide the element rather than
      // show stale/invented category text.
      if (workInfoCategory) workInfoCategory.hidden = true;
      if (workInfoDesc) workInfoDesc.textContent = p.desc[WORK_LANG];
      if (workInfoCta) workInfoCta.href = p.url;
      if (workPosCurrent) workPosCurrent.textContent = String(workActive + 1).padStart(2, '0');
      if (workPosTotal) workPosTotal.textContent = String(workTotal).padStart(2, '0');
    }

    function updateOffsets() {
      workSlides.forEach(function (slide, i) {
        var raw = i - workActive;
        if (raw > workTotal / 2) raw -= workTotal;
        if (raw < -workTotal / 2) raw += workTotal;
        var offsetKey = raw === 0 ? '0' : raw === -1 ? '-1' : raw === 1 ? '1' : 'hidden';
        slide.setAttribute('data-offset', offsetKey);
        slide.setAttribute('aria-hidden', raw === 0 ? 'false' : 'true');
      });
    }

    function renderWork() {
      updateOffsets();
      // Outgoing info fades + shifts up (~320ms), content swaps while
      // positioned 10px below/invisible, then animates up into its resting
      // position with a fade-in — "project moves, then its information
      // resolves," coordinated with (and starting after) the image's own
      // spatial movement rather than an instant text swap.
      if (workInfo && !reduceMotion) {
        workInfo.classList.add('is-leaving');
        window.setTimeout(function () {
          paintWorkInfo();
          workInfo.classList.remove('is-leaving');
          workInfo.classList.add('is-entering');
          void workInfo.offsetWidth; // commit the offset position before animating away from it
          requestAnimationFrame(function () { workInfo.classList.remove('is-entering'); });
        }, 320);
      } else {
        paintWorkInfo();
      }
      // Signature "lock-in" detail: four corner marks (the same crop-mark
      // motif as the Hero and 0.6s section) appear around the incoming
      // frame once it's mostly settled, then fade — "acquired the next
      // project," not shown at the very start of the move.
      if (!reduceMotion) {
        var activeSlide = workSlides[workActive];
        if (activeSlide) {
          window.setTimeout(function () {
            activeSlide.classList.add('is-locking');
            window.setTimeout(function () { activeSlide.classList.remove('is-locking'); }, 350);
          }, 480);
        }
      }
    }

    // Guards against rapid repeated input landing mid-transition, which
    // could otherwise leave the 3D offsets and the info block out of sync.
    // Re-enabled once the CSS transition (850ms) has settled.
    var workTransitioning = false;
    function goToWork(index) {
      if (workTransitioning) return;
      workActive = ((index % workTotal) + workTotal) % workTotal;
      renderWork();
      workTransitioning = true;
      window.setTimeout(function () { workTransitioning = false; }, 900);
    }

    if (workPrevBtn) workPrevBtn.addEventListener('click', function () { goToWork(workActive - 1); });
    if (workNextBtn) workNextBtn.addEventListener('click', function () { goToWork(workActive + 1); });

    workCarousel.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToWork(workActive - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goToWork(workActive + 1); }
    });

    var workTouchStartX = null;
    workCarousel.addEventListener('touchstart', function (e) {
      workTouchStartX = e.touches[0].clientX;
    }, { passive: true });
    workCarousel.addEventListener('touchend', function (e) {
      if (workTouchStartX === null) return;
      var dx = e.changedTouches[0].clientX - workTouchStartX;
      if (Math.abs(dx) > 40) { goToWork(workActive + (dx < 0 ? 1 : -1)); }
      workTouchStartX = null;
    }, { passive: true });

    // Now a real external project URL (set per-project in paintWorkInfo),
    // opened via target="_blank" rel="noopener noreferrer" set statically
    // in the HTML — no click handler needed here anymore.
    var workInfoCta = document.getElementById('work-info-cta');

    // Init directly — no fade, no timeout — the static HTML already shows
    // the first project's text, so this just sets the initial 3D offsets to match.
    updateOffsets();
    paintWorkInfo();
  }

  /* ---------- Language switcher: preserve section anchor across languages ----------
     Simple href touch-up only — not a routing system. If the visitor is on
     e.g. index.html#work or en.html#work, update the switcher's links so
     choosing the other language lands on the equivalent section instead of
     the top of the page. Falls back to the plain index.html / en.html links
     already in the HTML if there's no hash. */
  var langLinks = document.querySelectorAll('.lang-switch a[href]');
  if (langLinks.length && window.location.hash) {
    langLinks.forEach(function (a) {
      var base = a.getAttribute('href').split('#')[0];
      a.setAttribute('href', base + window.location.hash);
    });
  }

  /* ---------- Contact form — Netlify Forms ----------
     The <form> itself carries data-netlify="true", name="contact", and a
     hidden form-name field directly in static HTML — that's what makes it
     detectable by Netlify's build-time form scanner. This JS only
     progressively enhances submission: it intercepts the native submit,
     POSTs the SAME form data (URL-encoded, matching what a plain
     non-JS submit would send) back to the page so Netlify's endpoint
     still receives and processes it, and shows an inline result instead of
     a full-page reload. If JS fails to load, the form still works via a
     normal POST + Netlify's own default handling — this is enhancement,
     not a replacement mechanism.
     Real states: idle -> submitting -> success (only after an actual
     successful response) or error (shown for a failed/non-ok response).
     Before deployment (or opened directly from the filesystem), there is
     genuinely no Netlify backend to respond — submissions correctly fail
     and show the error state rather than a faked confirmation. */
  var FORM_STRINGS = {
    es: {
      sendLabel: 'Enviar mensaje',
      sendingLabel: 'Enviando...',
      invalid: 'Por favor completa todos los campos requeridos correctamente.',
      requestError: 'No pudimos enviar tu mensaje. Inténtalo de nuevo.',
      success: 'Mensaje enviado. Gracias por contactarnos. Te responderemos pronto.'
    },
    en: {
      sendLabel: 'Send message',
      sendingLabel: 'Sending...',
      invalid: 'Please fill in all required fields correctly.',
      requestError: "We couldn't send your message. Please try again.",
      success: 'Message sent. Thanks for reaching out. We\u2019ll get back to you soon.'
    }
  };
  var FORM_LANG = document.documentElement.lang === 'es' ? 'es' : 'en';
  var formStrings = FORM_STRINGS[FORM_LANG];

  var form = document.getElementById('contact-form');
  var status = document.getElementById('form-status');
  var progress = document.getElementById('form-progress');
  var successPanel = document.getElementById('form-success');
  var successResetBtn = document.getElementById('form-success-reset');
  if (form) {
    var submitBtn = document.getElementById('form-submit');
    var submitBtnLabel = document.getElementById('form-submit-label');
    var formSubmitting = false;

    function setSubmitting(on) {
      formSubmitting = on;
      submitBtn.disabled = on;
      if (progress) progress.hidden = !on;
      if (submitBtnLabel) submitBtnLabel.textContent = on ? formStrings.sendingLabel : formStrings.sendLabel;
      if (on) status.textContent = '';
    }

    function showError(message) {
      status.classList.add('is-error');
      status.textContent = message;
    }

    function showSuccess() {
      form.querySelectorAll('.form-field, #form-submit, #form-progress').forEach(function (el) { el.hidden = true; });
      status.textContent = formStrings.success;
      status.classList.remove('is-error');
      form.reset();
      successPanel.hidden = false;
      if (reduceMotion) {
        successPanel.classList.add('is-in');
      } else {
        requestAnimationFrame(function () { successPanel.classList.add('is-in'); });
      }
    }

    function resetForm() {
      successPanel.hidden = true;
      successPanel.classList.remove('is-in');
      form.querySelectorAll('.form-field, #form-submit, #form-progress').forEach(function (el) { el.hidden = false; });
      progress.hidden = true;
      status.textContent = '';
      status.classList.remove('is-error');
      form.querySelector('#name').focus();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (formSubmitting) return;

      status.classList.remove('is-error');
      if (!form.checkValidity()) {
        showError(formStrings.invalid);
        var firstInvalid = form.querySelector(':invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      setSubmitting(true);
      var body = new URLSearchParams(new FormData(form)).toString();

      fetch(form.getAttribute('action') || window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Request failed with status ' + res.status);
          showSuccess();
        })
        .catch(function () {
          showError(formStrings.requestError);
        })
        .finally(function () {
          setSubmitting(false);
        });
    });

    if (successResetBtn) successResetBtn.addEventListener('click', resetForm);
  }

  /* ---------- Back to Top ----------
     Shown after ~700px of scroll (within the requested 600-900px window),
     hidden again near the top. Scrolls to the actual document top, never
     an arbitrary section. Reduced motion skips the animated scroll. */
  var backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    var btVisible = false;
    var btTicking = false;
    function updateBackToTop() {
      btTicking = false;
      var shouldShow = window.scrollY > 700;
      if (shouldShow !== btVisible) {
        btVisible = shouldShow;
        backToTop.classList.toggle('is-visible', btVisible);
      }
    }
    window.addEventListener('scroll', function () {
      if (!btTicking) { requestAnimationFrame(updateBackToTop); btTicking = true; }
    }, { passive: true });
    updateBackToTop();

    backToTop.addEventListener('click', function () {
      if (reduceMotion) {
        window.scrollTo(0, 0);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }
})();