(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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

  /* ---------- The System — contained → activated → released → resolved ----------
     One IntersectionObserver trigger, identical on every breakpoint (nothing
     here depends on hover or a mouse). At the activation threshold: the core
     flashes and the particle/fragment burst fires — both pure CSS keyframe
     animations, already timed via --pdelay/--pdur/--fdelay in the markup, so
     there is no per-frame JS during the burst itself. The stage list fades
     up in the same beat. After the burst's total duration, a final class
     marks the resolved state (used only for the readout label and as a CSS
     safety net). Reduced motion skips the whole sequence — the CSS reduced-
     motion rules already show the resolved core and stage list immediately. */
  var systemBurst = document.getElementById('system-burst');
  var systemBurstReadout = document.getElementById('system-burst-readout');
  var systemField = document.getElementById('system-field');
  var SYSTEM_BURST_DURATION = 1300; // matches the longest particle animation

  function fireSystemBurst() {
    if (systemBurst) systemBurst.classList.add('is-armed');
    if (systemField) systemField.classList.add('is-active');
    if (systemBurstReadout) {
      systemBurstReadout.textContent = 'ACTIVATED';
      setTimeout(function () { systemBurstReadout.textContent = 'RELEASED'; }, 250);
      setTimeout(function () {
        systemBurstReadout.textContent = 'RESOLVED';
        if (systemBurst) systemBurst.classList.add('is-resolved');
      }, SYSTEM_BURST_DURATION);
    } else if (systemBurst) {
      setTimeout(function () { systemBurst.classList.add('is-resolved'); }, SYSTEM_BURST_DURATION);
    }
  }

  if (systemBurst || systemField) {
    if (reduceMotion) {
      // CSS's own prefers-reduced-motion rules already render the resolved
      // state with no animation; just mark the field active for consistency.
      if (systemField) systemField.classList.add('is-active');
    } else if ('IntersectionObserver' in window) {
      var systemObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            fireSystemBurst();
            systemObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.45 });
      systemObserver.observe(systemBurst || systemField);
    } else {
      fireSystemBurst();
    }
  }

  /* ---------- Contact form ---------- */
  var form = document.querySelector('.contact-form');
  var status = document.getElementById('form-status');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        status.textContent = 'Please fill in all required fields correctly.';
        var firstInvalid = form.querySelector(':invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }
      status.textContent = 'Sending…';
      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      setTimeout(function () {
        status.textContent = 'Message sent — we\'ll reply within one business day.';
        submitBtn.disabled = false;
        form.reset();
      }, 900);
    });
  }
})();