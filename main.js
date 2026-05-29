  /* Navbar scroll effect + scroll progress bar */
  const navbar = document.getElementById('navbar');
  const progressBar = document.getElementById('scroll-progress');
  function onScrollUpdate() {
    const y = window.scrollY || document.documentElement.scrollTop;
    navbar.classList.toggle('scrolled', y > 40);
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = (docH > 0 ? (y / docH) * 100 : 0) + '%';
  }
  window.addEventListener('scroll', onScrollUpdate, { passive: true });
  onScrollUpdate();

  /* Mobile menu */
  const navToggle = document.getElementById('nav-toggle');
  const navOverlay = document.getElementById('nav-overlay');
  const navLinks = document.getElementById('nav-links');
  function closeMenu() {
    document.body.classList.remove('menu-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Open menu');
  }
  function toggleMenu() {
    const open = document.body.classList.toggle('menu-open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  navToggle.addEventListener('click', toggleMenu);
  navOverlay.addEventListener('click', closeMenu);
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  /* Scroll reveal with stagger */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  /* Stagger siblings within common grids — skip when user prefers reduced motion */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion) {
    document.querySelectorAll('.cv-grid, .why-grid, .modes-grid, .clinic-grid, .collab-tracks, .partner-logos, .pub-list, .impact-grid, .what-card-stack, .training-list, .partners-grid, .arch-pipeline, .hero-stats, .team-grid, .faq-list, .roadmap').forEach(group => {
      Array.from(group.children).forEach((child, i) => {
        if (child.classList.contains('reveal')) child.style.setProperty('--reveal-delay', Math.min(i, 8) * 80 + 'ms');
      });
    });
  }

  /* FAQ accordion */
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(other => {
        if (other !== item) { other.classList.remove('open'); other.querySelector('.faq-a').style.maxHeight = null; }
      });
      if (isOpen) { item.classList.remove('open'); a.style.maxHeight = null; }
      else { item.classList.add('open'); a.style.maxHeight = a.scrollHeight + 'px'; }
    });
  });
  /* keep open FAQ sized correctly on resize */
  window.addEventListener('resize', () => {
    document.querySelectorAll('.faq-item.open .faq-a').forEach(a => { a.style.maxHeight = a.scrollHeight + 'px'; });
  });

  /* Tabbed sections */
  document.querySelectorAll('.tabs-nav').forEach(nav => {
    const scope = nav.closest('section') || document;
    const btns = nav.querySelectorAll('.tab-btn');
    const panels = scope.querySelectorAll('.tab-panel');
    btns.forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.tab;
      btns.forEach(b => b.classList.toggle('active', b === btn));
      panels.forEach(p => p.classList.toggle('active', p.id === id));
    }));
  });

  /* Animated number counters */
  const counters = document.querySelectorAll('.count-up');
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      countObserver.unobserve(el);
      const target = parseFloat(el.dataset.count);
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const dur = 1500; const start = performance.now();
      function tick(now) {
        const p = Math.min((now - start) / dur, 1);
        el.textContent = (target * easeOut(p)).toFixed(decimals);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target.toFixed(decimals);
      }
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => countObserver.observe(c));

  /* Subtle parallax / tilt on hero card */
  const heroCard = document.querySelector('.hero-card');
  if (heroCard && window.matchMedia('(min-width: 1025px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const heroVisual = document.querySelector('.hero-visual');
    heroVisual.addEventListener('mousemove', e => {
      const r = heroVisual.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / r.width;
      const dy = (e.clientY - r.top - r.height / 2) / r.height;
      heroCard.style.transform = `perspective(900px) rotateY(${dx * 6}deg) rotateX(${-dy * 6}deg)`;
    });
    heroVisual.addEventListener('mouseleave', () => { heroCard.style.transform = ''; });
  }

  /* Contact form AJAX submit — with spinner, animated status, validation styling */
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    const showStatus = (status, kind, message) => {
      const palette = kind === 'success'
        ? { bg: 'rgba(0,168,133,.08)', border: 'rgba(0,168,133,.25)', color: '#00875a' }
        : { bg: 'rgba(220,50,50,.06)', border: 'rgba(220,50,50,.2)',  color: '#cc3333' };
      status.style.background = palette.bg;
      status.style.border = '1px solid ' + palette.border;
      status.style.color = palette.color;
      status.textContent = message;
      status.style.display = 'block';
      // force reflow so the entrance transition plays each time
      void status.offsetWidth;
      status.classList.add('visible');
    };
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const btn = document.getElementById('form-btn');
      const status = document.getElementById('form-status');
      const form = this;
      form.classList.add('submitted');
      if (!form.checkValidity()) {
        showStatus(status, 'error', 'Please fill in the highlighted fields.');
        form.reportValidity();
        return;
      }
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      status.classList.remove('visible');
      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      }).then(r => r.json()).then(data => {
        if (!data.success) throw new Error();
        showStatus(status, 'success', 'Message sent successfully! We will get back to you soon.');
        form.reset();
        form.classList.remove('submitted');
        btn.classList.remove('is-loading');
        btn.textContent = 'Sent ✓';
        btn.removeAttribute('aria-busy');
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Send Message →'; }, 4000);
      }).catch(() => {
        showStatus(status, 'error', 'Something went wrong. Please try again or email us directly.');
        btn.disabled = false;
        btn.classList.remove('is-loading');
        btn.removeAttribute('aria-busy');
        btn.textContent = 'Send Message →';
      });
    });
  }

  /* Partner showcase — interactive spotlight on the homepage */
  (function () {
    const showcase = document.getElementById('partner-showcase');
    const dataEl   = document.getElementById('partner-data');
    if (!showcase || !dataEl) return;

    let data;
    try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

    const buttons = Array.from(showcase.querySelectorAll('.logo-wall-item'));
    const card    = showcase.querySelector('.ps-card');
    const tagEl   = card.querySelector('.ps-tag');
    const nameEl  = card.querySelector('.ps-name');
    const descEl  = card.querySelector('.ps-desc');
    const linkEl  = card.querySelector('.ps-link');
    const progress = showcase.querySelector('.ps-progress span');

    const order  = buttons.map(b => b.dataset.partner);
    const CYCLE_MS = 5000;
    let activeIdx = 0;
    let timer = null;
    let userLocked = false;

    function setActive(idx, fromUser) {
      if (fromUser) userLocked = true;
      activeIdx = idx;
      const key = order[idx];
      const p = data[key];
      if (!p) return;

      buttons.forEach((b, i) => {
        const on = i === idx;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });

      // crossfade
      card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
      tagEl.textContent  = p.tag;
      nameEl.textContent = p.name;
      descEl.textContent = p.desc;
      linkEl.setAttribute('href', p.href);

      // reset progress bar
      if (progress) {
        progress.style.transition = 'none';
        progress.style.width = '0%';
        void progress.offsetWidth;
        if (!userLocked) {
          progress.style.transition = `width ${CYCLE_MS}ms linear`;
          progress.style.width = '100%';
        }
      }
    }

    function nextTick() {
      setActive((activeIdx + 1) % order.length, false);
    }

    function startCycle() {
      stopCycle();
      // initial progress fill
      if (progress && !userLocked) {
        progress.style.transition = 'none';
        progress.style.width = '0%';
        void progress.offsetWidth;
        progress.style.transition = `width ${CYCLE_MS}ms linear`;
        progress.style.width = '100%';
      }
      timer = setInterval(nextTick, CYCLE_MS);
    }
    function stopCycle() {
      if (timer) { clearInterval(timer); timer = null; }
      if (progress) progress.style.width = '0%';
    }

    buttons.forEach((btn, i) => {
      btn.addEventListener('click', () => { stopCycle(); setActive(i, true); });
      btn.addEventListener('mouseenter', () => {
        if (window.matchMedia('(pointer: fine)').matches) { stopCycle(); setActive(i, true); }
      });
    });
    showcase.addEventListener('mouseleave', () => {
      if (window.matchMedia('(pointer: fine)').matches) {
        userLocked = false;
        startCycle();
      }
    });

    // Only auto-cycle when the showcase is on screen (saves cycles when scrolled past)
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) startCycle(); else stopCycle(); });
    }, { threshold: 0.3 });
    io.observe(showcase);
  })();

  /* Back-to-top button */
  (function () {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
    document.body.appendChild(btn);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    let ticking = false;
    function update() {
      ticking = false;
      btn.classList.toggle('visible', window.scrollY > window.innerHeight * 0.6);
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  })();

  /* Highlight the current page in the nav */
  (function () {
    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (here === '') here = 'index.html';
    document.querySelectorAll('.nav-links a, .footer-col a').forEach(function (a) {
      var h = (a.getAttribute('href') || '').split('#')[0].split('/').pop().toLowerCase();
      if (h && h === here) a.classList.add('active');
    });
  })();

  /* ───────────────────────────────────────────────────────────────
     UX/UI Polish: cursor halo + scroll parallax + counter bounce
     ─────────────────────────────────────────────────────────────── */
  (function () {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Scroll parallax — sets --sy on body for ambient blob drift */
    if (!reduce) {
      var rafScroll = 0, sy = 0;
      function applyScroll() {
        rafScroll = 0;
        document.body.style.setProperty('--sy', sy);
      }
      window.addEventListener('scroll', function () {
        sy = window.scrollY || document.documentElement.scrollTop;
        if (!rafScroll) rafScroll = requestAnimationFrame(applyScroll);
      }, { passive: true });
    }

    /* Cursor halo — global soft glow that follows cursor, fine-pointer only */
    if (!reduce && window.matchMedia('(pointer: fine)').matches) {
      var halo = document.createElement('div');
      halo.className = 'cursor-halo';
      document.body.appendChild(halo);
      var rafHalo = 0, cx = 0, cy = 0;
      function applyHalo() {
        rafHalo = 0;
        halo.style.setProperty('--cx', cx + 'px');
        halo.style.setProperty('--cy', cy + 'px');
      }
      var seen = false;
      window.addEventListener('pointermove', function (e) {
        cx = e.clientX; cy = e.clientY;
        if (!seen) { document.body.classList.add('has-cursor'); seen = true; }
        if (!rafHalo) rafHalo = requestAnimationFrame(applyHalo);
      }, { passive: true });
      window.addEventListener('pointerleave', function () {
        document.body.classList.remove('has-cursor');
      });
    }

    /* Counter bounce — add .counted class when count-up finishes */
    /* Hooks into the existing IntersectionObserver pattern via the dataset */
    var pollCounters = document.querySelectorAll('.count-up');
    pollCounters.forEach(function (el) {
      var target = parseFloat(el.dataset.count);
      var decimals = parseInt(el.dataset.decimals || '0', 10);
      var done = false;
      var mo = new MutationObserver(function () {
        if (done) return;
        var current = parseFloat(el.textContent);
        if (!isNaN(current) && current.toFixed(decimals) === target.toFixed(decimals)) {
          done = true;
          el.classList.add('counted');
          mo.disconnect();
          setTimeout(function () { el.classList.remove('counted'); }, 700);
        }
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    });
  })();

  /* ───────────────────────────────────────────────────────────────
     UX/UI Polish: card spotlight + magnetic CTAs
     ─────────────────────────────────────────────────────────────── */
  (function () {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    /* Card spotlight — tracks cursor, sets --mx/--my for radial highlight */
    var spotlightSel =
      '.cv-card, .why-card, .mode-card, .clinic-card, .collab-track, .award-card, ' +
      '.partner-card, .team-card, .arch-step, .pub-item, .partner-dept-card, ' +
      '.training-list li, .wc, .impact-item, .cw-item, .training-visual, ' +
      '.contact-form, .dashboard-mock';
    var spotCards = document.querySelectorAll(spotlightSel);
    spotCards.forEach(function (card) {
      var raf = 0, mx = 0, my = 0;
      function apply() {
        raf = 0;
        card.style.setProperty('--mx', mx + 'px');
        card.style.setProperty('--my', my + 'px');
      }
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        mx = e.clientX - r.left;
        my = e.clientY - r.top;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      card.addEventListener('pointerleave', function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        card.style.removeProperty('--mx');
        card.style.removeProperty('--my');
      });
    });

    /* Magnetic buttons — only on desktop (pointer-fine) */
    if (window.matchMedia('(pointer: fine) and (min-width: 1025px)').matches) {
      var magnetic = document.querySelectorAll('.btn-primary, .btn-outline');
      magnetic.forEach(function (btn) {
        // skip the form submit button (full-width, would look odd)
        if (btn.classList.contains('form-submit')) return;
        var raf = 0, tx = 0, ty = 0;
        function applyT() {
          raf = 0;
          btn.style.transform =
            'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) translateY(-2px)';
        }
        btn.addEventListener('pointermove', function (e) {
          var r = btn.getBoundingClientRect();
          tx = ((e.clientX - r.left) / r.width  - 0.5) * 10;
          ty = ((e.clientY - r.top)  / r.height - 0.5) * 8;
          if (!raf) raf = requestAnimationFrame(applyT);
        });
        btn.addEventListener('pointerleave', function () {
          if (raf) { cancelAnimationFrame(raf); raf = 0; }
          btn.style.transform = '';
        });
      });
    }
  })();
