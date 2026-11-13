/* Motion and layout enhancements only. Commerce stays in Rise. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  class PortalReveal extends HTMLElement {
    connectedCallback() {
      this.abort = new AbortController();
      this.configure = () => {
        this.observer?.disconnect();
        this.removeAttribute('data-ready');
        for (const glyph of this.querySelectorAll('.portal-draw')) glyph.removeAttribute('data-ready');
        if (reduced.matches || !('IntersectionObserver' in window)) return;
        this.observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.setAttribute('data-visible', '');
            this.observer.unobserve(entry.target);
          }
        }, { threshold: .2 });
        for (const target of [this, ...this.querySelectorAll('.portal-draw')]) {
          target.setAttribute('data-ready', '');
          this.observer.observe(target);
        }
      };
      reduced.addEventListener('change', this.configure, { signal: this.abort.signal });
      document.addEventListener('shopify:block:select', (event) => {
        if (this.contains(event.target)) this.setAttribute('data-visible', '');
      }, { signal: this.abort.signal });
      this.configure();
    }
    disconnectedCallback() { this.abort?.abort(); this.observer?.disconnect(); }
  }

  class PortalHeader extends HTMLElement {
    static layouts = ['desktop', 'tablet', 'compact'];

    connectedCallback() {
      this.abort = new AbortController();
      this.wrapper = this.querySelector('.portal-header-wrapper');
      this.nav = this.querySelector('.header__inline-menu');
      this.layout = () => {
        cancelAnimationFrame(this.layoutFrame);
        this.layoutFrame = requestAnimationFrame(() => {
          const width = this.getBoundingClientRect().width;
          // Approved bands (≥1024 desktop, 768–1023 tablet, <768 mobile), degraded while the menu does not fit.
          let index = width >= 1024 ? 0 : width >= 768 ? 1 : 2;
          while (index < 2 && !this.fits(PortalHeader.layouts[index])) index += 1;
          const layout = PortalHeader.layouts[index];
          if (layout !== 'compact' && this.dataset.layout === 'compact') {
            const drawer = this.querySelector('header-drawer');
            if (drawer?.mainDetailsToggle?.open) drawer.closeMenuDrawer(new Event('close'), drawer.querySelector('summary'));
          }
          this.dataset.layout = layout;
          // Resting height, measured before sticking (the home logo shrinks once sticky).
          if (!this.classList.contains('is-sticky')) this.topHeight = this.wrapper.getBoundingClientRect().height;
          this.reserve();
          this.scroll();
        });
      };
      this.scroll = () => {
        cancelAnimationFrame(this.scrollFrame);
        this.scrollFrame = requestAnimationFrame(() => {
          // Sticks once the resting header has scrolled out of view.
          this.classList.toggle('is-sticky', this.getBoundingClientRect().top + (this.topHeight || 0) <= 0);
        });
      };
      window.addEventListener('scroll', this.scroll, { passive: true, signal: this.abort.signal });
      window.addEventListener('resize', this.layout, { signal: this.abort.signal });
      document.fonts?.ready.then(() => { if (this.isConnected) this.layout(); });
      this.resizeObserver = new ResizeObserver(this.layout);
      this.resizeObserver.observe(this.wrapper);
      this.layout();
      this.scroll();
      this.bindMenus();
    }

    bindMenus() {
      // Panels open on hover with a mouse; click, touch and keyboard keep the native details behavior.
      const signal = this.abort.signal;
      const menus = [...this.querySelectorAll('.portal-nav details')];
      menus.forEach((details) => {
        const summary = details.querySelector('summary');
        details.addEventListener('toggle', () => summary.setAttribute('aria-expanded', details.open), { signal });
        details.addEventListener('pointerenter', (event) => {
          if (event.pointerType !== 'mouse') return;
          clearTimeout(this.menuTimer);
          menus.forEach((menu) => { if (menu !== details) menu.open = false; });
          if (!details.open) details.dataset.hoverOpened = '';
          details.open = true;
        }, { signal });
        details.addEventListener('pointerleave', (event) => {
          if (event.pointerType !== 'mouse') return;
          this.menuTimer = setTimeout(() => {
            details.open = false;
            delete details.dataset.hoverOpened;
          }, 160);
        }, { signal });
        summary.addEventListener('click', (event) => {
          // The first click on a panel opened by hover must not close it under the pointer.
          if (!('hoverOpened' in details.dataset)) return;
          event.preventDefault();
          delete details.dataset.hoverOpened;
        }, { signal });
      });
      this.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const open = menus.find((menu) => menu.open);
        if (!open) return;
        open.open = false;
        open.querySelector('summary').focus();
      }, { signal });
    }

    fits(layout) {
      // Measured synchronously inside one frame, so candidate layouts never paint.
      this.dataset.layout = layout;
      const menu = this.nav?.querySelector('.list-menu--inline');
      if (!menu) return true;
      const items = [...menu.children];
      const gap = parseFloat(getComputedStyle(menu).columnGap) || 0;
      const needed = items.reduce((total, item) => total + item.getBoundingClientRect().width, 0) + Math.max(0, items.length - 1) * gap;
      return needed + 24 <= this.nav.getBoundingClientRect().width;
    }

    reserve() {
      // The home header overlays the hero, which reserves its own safe area in CSS.
      const height = this.hasAttribute('data-overlay') ? 0 : this.topHeight;
      if (height === this.reservedHeight) return;
      this.reservedHeight = height;
      this.spacer?.cancel();
      this.spacer = this.animate([{ height: `${height}px` }, { height: `${height}px` }], { duration: 1, fill: 'both' });
    }

    disconnectedCallback() {
      this.abort?.abort();
      this.resizeObserver?.disconnect();
      cancelAnimationFrame(this.layoutFrame);
      cancelAnimationFrame(this.scrollFrame);
      this.spacer?.cancel();
    }
  }

  class PortalImmersive extends HTMLElement {
    connectedCallback() {
      this.abort = new AbortController();
      this.glyph = this.querySelector('.portal-immersive__sopro');
      if (!this.glyph) return;
      this.update = () => {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => {
          this.motion?.cancel();
          if (reduced.matches || !this.visible) return;
          const rect = this.getBoundingClientRect();
          const progress = Math.max(0, Math.min(1, (innerHeight - rect.top) / (innerHeight + rect.height)));
          const transform = `translateY(${progress * 16}px)`;
          this.motion = this.glyph.animate([{ transform }, { transform }], { duration: 1, fill: 'both' });
        });
      };
      this.observer = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.update(); });
      this.observer.observe(this);
      window.addEventListener('scroll', this.update, { passive: true, signal: this.abort.signal });
      reduced.addEventListener('change', this.update, { signal: this.abort.signal });
    }
    disconnectedCallback() { this.abort?.abort(); this.observer?.disconnect(); cancelAnimationFrame(this.frame); this.motion?.cancel(); }
  }

  class PortalCarousel extends HTMLElement {
    connectedCallback() {
      this.abort = new AbortController();
      this.track = this.querySelector('.portal-motion__track');
      this.buttons = [...this.querySelectorAll('[data-direction]')];
      const controls = this.querySelector('.portal-motion__controls');
      controls.hidden = false;
      this.update = () => {
        const max = this.track.scrollWidth - this.track.clientWidth;
        this.buttons[0].disabled = this.track.scrollLeft <= 2;
        this.buttons[1].disabled = this.track.scrollLeft >= max - 2;
      };
      for (const button of this.buttons) button.addEventListener('click', () => this.move(Number(button.dataset.direction)), { signal: this.abort.signal });
      this.track.addEventListener('keydown', (event) => {
        if (event.target !== this.track) return;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Home' || event.key === 'End') this.track.scrollTo({ left: event.key === 'Home' ? 0 : this.track.scrollWidth, behavior: reduced.matches ? 'instant' : 'smooth' });
        else this.move(event.key === 'ArrowRight' ? 1 : -1);
      }, { signal: this.abort.signal });
      this.track.addEventListener('scroll', this.update, { passive: true, signal: this.abort.signal });
      this.resizeObserver = new ResizeObserver(this.update);
      this.resizeObserver.observe(this.track);
      this.videoObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) if (!entry.isIntersecting || entry.intersectionRatio < .2) entry.target.pause();
      }, { threshold: [0, .2] });
      for (const video of this.querySelectorAll('video')) {
        this.videoObserver.observe(video);
        video.addEventListener('play', () => {
          for (const other of this.querySelectorAll('video')) if (other !== video) other.pause();
        }, { signal: this.abort.signal });
      }
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) for (const video of this.querySelectorAll('video')) video.pause();
      }, { signal: this.abort.signal });
      this.update();
    }
    move(direction) {
      const card = this.track.firstElementChild;
      if (!card) return;
      this.track.scrollBy({ left: direction * (card.getBoundingClientRect().width + parseFloat(getComputedStyle(this.track).columnGap)), behavior: reduced.matches ? 'instant' : 'smooth' });
    }
    disconnectedCallback() {
      this.abort?.abort(); this.resizeObserver?.disconnect(); this.videoObserver?.disconnect();
      for (const video of this.querySelectorAll('video')) video.pause();
    }
  }

  // Animated still over a section image: plays while visible and is pausable. Under reduced motion it
  // starts paused on its first frame and the visitor can press play.
  class PortalAmbientVideo extends HTMLElement {
    connectedCallback() {
      this.video = this.querySelector('video');
      this.toggle = this.querySelector('.portal-ambient__toggle');
      if (!this.video) return;
      this.abort = new AbortController();
      const signal = this.abort.signal;
      this.video.muted = true;
      this.video.removeAttribute('controls');
      this.video.addEventListener('playing', () => this.setAttribute('data-playing', ''), { signal });
      this.setPaused = (paused) => {
        this.paused = paused;
        this.toggle.setAttribute('aria-pressed', paused);
        this.toggle.querySelector('.visually-hidden').textContent = paused ? this.toggle.dataset.play : this.toggle.dataset.pause;
      };
      this.setPaused(reduced.matches);
      this.toggle.hidden = false;
      this.update = () => {
        const allowed = !this.paused;
        if (allowed && this.visible && !document.hidden) {
          this.video.preload = 'auto';
          this.video.play().catch(() => {});
        } else {
          this.video.pause();
        }
      };
      this.toggle.addEventListener('click', () => { this.setPaused(!this.paused); this.update(); }, { signal });
      this.observer = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.update(); });
      this.observer.observe(this);
      reduced.addEventListener('change', () => { this.setPaused(reduced.matches); this.update(); }, { signal });
      document.addEventListener('visibilitychange', this.update, { signal });
    }
    disconnectedCallback() { this.abort?.abort(); this.observer?.disconnect(); this.video?.pause(); }
  }

  // WAI-ARIA tabs with automatic activation. Without JS, panels stay stacked under their headings.
  class PortalTabs extends HTMLElement {
    connectedCallback() {
      this.list = this.querySelector('.portal-tabs__list');
      this.tabs = this.list ? [...this.list.querySelectorAll('.portal-tabs__tab')] : [];
      if (this.tabs.length < 2) return;
      this.abort = new AbortController();
      const signal = this.abort.signal;
      this.list.setAttribute('role', 'tablist');
      this.list.hidden = false;
      this.tabs.forEach((tab, index) => {
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        tab.setAttribute('role', 'tab');
        panel?.setAttribute('role', 'tabpanel');
        panel?.setAttribute('aria-labelledby', tab.id);
        panel?.setAttribute('tabindex', '0');
        tab.addEventListener('click', () => this.select(index), { signal });
      });
      this.list.addEventListener('keydown', (event) => {
        const current = this.tabs.indexOf(document.activeElement);
        if (current < 0) return;
        const last = this.tabs.length - 1;
        const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: last }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        this.select(next > last ? 0 : next < 0 ? last : next, true);
      }, { signal });
      // "Ler descrição completa" points at the details block: show the description tab first.
      window.addEventListener('hashchange', () => { if (location.hash === `#${this.parentElement?.id}`) this.select(0); }, { signal });
      document.addEventListener('shopify:block:select', (event) => {
        const index = this.tabs.findIndex((tab) => tab.getAttribute('aria-controls')?.endsWith(event.detail?.blockId));
        if (index >= 0) this.select(index);
      }, { signal });
      this.select(0);
      this.setAttribute('data-ready', '');
    }
    select(index, focus = false) {
      this.tabs.forEach((tab, i) => {
        const selected = i === index;
        tab.setAttribute('aria-selected', selected);
        tab.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
      const tab = this.tabs[index];
      if (focus) tab.focus({ preventScroll: true });
      // Keep the active tab visible in the scrollable row without moving the page.
      const left = tab.offsetLeft - this.list.offsetLeft;
      if (left < this.list.scrollLeft || left + tab.offsetWidth > this.list.scrollLeft + this.list.clientWidth) {
        this.list.scrollTo({ left: Math.max(0, left - 16), behavior: reduced.matches ? 'instant' : 'smooth' });
      }
    }
    disconnectedCallback() { this.abort?.abort(); }
  }

  // Open the Shopify account sheet just below the header, whether transparent, solid or sticky.
  document.addEventListener('open', (event) => {
    const account = event.target;
    if (!(account instanceof HTMLElement) || !account.matches('.portal-header shopify-account')) return;
    const header = account.closest('.portal-header-wrapper') || account;
    account.style.setProperty('--shopify-account-dialog-position-top', `${Math.max(0, Math.round(header.getBoundingClientRect().bottom))}px`);
  }, true);

  for (const [name, component] of [['portal-reveal', PortalReveal], ['portal-header', PortalHeader], ['portal-immersive', PortalImmersive], ['portal-carousel', PortalCarousel], ['portal-tabs', PortalTabs], ['portal-ambient-video', PortalAmbientVideo]]) {
    if (!customElements.get(name)) customElements.define(name, component);
  }
})();
