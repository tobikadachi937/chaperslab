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

  /* ---------- Process live index (updates the mono counter feel via active state) ---------- */
  var processPanels = document.querySelectorAll('.process-panel');
  if (processPanels.length && 'IntersectionObserver' in window) {
    var processObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('is-active', entry.isIntersecting);
      });
    }, { threshold: 0.5 });
    processPanels.forEach(function (p) { processObserver.observe(p); });
  }

  /* ---------- Principles — scroll-pinned reveal ---------- */
  var pin = document.getElementById('principles-pin');
  var items = document.querySelectorAll('.principle-item');
  var indexLabel = document.getElementById('principle-index');
  if (pin && items.length && !reduceMotion) {
    var ticking = false;
    function updatePrinciples() {
      ticking = false;
      var rect = pin.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      var progress = total > 0 ? Math.min(Math.max(-rect.top / total, 0), 0.999) : 0;
      var idx = Math.floor(progress * items.length);
      items.forEach(function (item, i) {
        item.classList.toggle('is-active', i === idx);
      });
      if (indexLabel) {
        indexLabel.textContent = String(idx + 1).padStart(2, '0') + ' / ' + String(items.length).padStart(2, '0');
      }
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { requestAnimationFrame(updatePrinciples); ticking = true; }
    }, { passive: true });
    updatePrinciples();
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