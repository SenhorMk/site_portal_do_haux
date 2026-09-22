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
          this.reserve();
        });
      };
      this.scroll = () => {
        cancelAnimationFrame(this.scrollFrame);
        this.scrollFrame = requestAnimationFrame(() => {
          // The hero on the home page, the header itself everywhere else.
          const trigger = document.querySelector('.portal-hero') || this;
          this.classList.toggle('is-sticky', trigger.getBoundingClientRect().bottom <= 0);
        });
      };
      window.addEventListener('scroll', this.scroll, { passive: true, signal: this.abort.signal });
      window.addEventListener('resize', this.layout, { signal: this.abort.signal });
      document.fonts?.ready.then(() => { if (this.isConnected) this.layout(); });
      this.resizeObserver = new ResizeObserver(this.layout);
      this.resizeObserver.observe(this.wrapper);
      this.layout();
      this.scroll();
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
      // WAAPI reserves the header space without adding inline style attributes.
      const height = this.wrapper.getBoundingClientRect().height;
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

  for (const [name, component] of [['portal-reveal', PortalReveal], ['portal-header', PortalHeader], ['portal-immersive', PortalImmersive], ['portal-carousel', PortalCarousel]]) {
    if (!customElements.get(name)) customElements.define(name, component);
  }
})();
