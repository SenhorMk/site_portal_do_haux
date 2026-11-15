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
          }, 280);
        }, { signal });
        summary.addEventListener('click', (event) => {
          // The first click on a panel opened by hover must not close it under the pointer.
          if (!('hoverOpened' in details.dataset)) return;
          event.preventDefault();
          delete details.dataset.hoverOpened;
        }, { signal });
      });
      // A full-bleed mega menu must also close when the visitor clicks outside or
      // tabs away. Keep Escape support and native details interactions.
      document.addEventListener('pointerdown', (event) => {
        if (this.contains(event.target)) return;
        menus.forEach((menu) => { menu.open = false; delete menu.dataset.hoverOpened; });
      }, { signal });
      this.addEventListener('focusout', (event) => {
        // Leaving the navigation for search/cart should close the mega panel too.
        if (event.relatedTarget && this.nav?.contains(event.relatedTarget)) return;
        menus.forEach((menu) => { menu.open = false; delete menu.dataset.hoverOpened; });
      }, { signal });
      // Escape is heard on the document: a panel opened by mouse hover leaves focus on <body>.
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const open = menus.find((menu) => menu.open);
        if (!open) return;
        const hadFocus = open.contains(document.activeElement);
        open.open = false;
        delete open.dataset.hoverOpened;
        if (hadFocus) open.querySelector('summary').focus();
      }, { signal });
    }

    fits(layout) {
      // Measured synchronously inside one frame, so candidate layouts never paint.
      this.dataset.layout = layout;
      const menu = this.nav?.querySelector('.list-menu--inline');
      if (!menu) return true;
      const items = [...menu.children];
      const gap = parseFloat(getComputedStyle(menu).columnGap) || 0;
      const needed = items.reduce((total, item) => total + item.getBoundingClientRect().width, 0)
        + Math.max(0, items.length - 1) * gap;
      const navRect = this.nav.getBoundingClientRect();
      const brandRect = this.querySelector('.portal-logo')?.getBoundingClientRect();
      const utilitiesRect = this.querySelector('.portal-header__actions')?.getBoundingClientRect();
      // The custom property is an unresolved calc(); the drawn curve gives its real width.
      const logo = this.querySelector('.portal-logo');
      const curve = logo ? parseFloat(getComputedStyle(logo, '::after').width) || 0 : 0;
      const clear = parseFloat(getComputedStyle(this).getPropertyValue('--portal-nav-clear')) || .7;
      // A nominally fitting menu must not overlap the Cerâmica curve,
      // nor intrude into the search/profile/cart controls.
      const clearsBrand = !brandRect || navRect.left >= brandRect.right + curve * clear - 24;
      // The search bar sits right after the menu and needs room for a usable field (16rem; 14rem on tablet) before the
      // controls; the legacy start group (older section markup) counts as a control when it has width.
      const searchRect = this.querySelector('.portal-search')?.getBoundingClientRect();
      const startRect = this.querySelector('.portal-header__start')?.getBoundingClientRect();
      const controlsLeft = Math.min(utilitiesRect?.left ?? Infinity, startRect?.width ? startRect.left : Infinity);
      const headerRight = this.querySelector('.portal-header').getBoundingClientRect().right;
      const clearsSearch = !searchRect || (searchRect.width >= (this.dataset.layout === 'tablet' ? 140 : 160) && searchRect.left >= navRect.right && searchRect.right <= controlsLeft + 1);
      const clearsUtilities = !utilitiesRect || (navRect.right <= controlsLeft - 5 && utilitiesRect.right <= headerRight + 1);
      return needed <= navRect.width + 1 && clearsBrand && clearsSearch && clearsUtilities;
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

  // Biblioteca de fotos. One shared <dialog> viewer for every gallery on the page, created on first use.
  // Without JS each photo link simply opens the full image.
  const lightbox = {
    get() {
      if (this.dialog) return this.dialog;
      const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
      const dialog = document.createElement('dialog');
      dialog.className = 'portal-lightbox';
      dialog.innerHTML = `
        <div class="portal-lightbox__stage"><img class="portal-lightbox__image" alt="" decoding="async"></div>
        <p class="portal-lightbox__caption" aria-live="polite"><span class="portal-lightbox__count"></span><span class="portal-lightbox__text"></span></p>
        <button type="button" class="portal-lightbox__nav portal-lightbox__nav--prev" aria-label="Foto anterior">${icon('M15 5l-7 7 7 7')}</button>
        <button type="button" class="portal-lightbox__nav portal-lightbox__nav--next" aria-label="Próxima foto">${icon('M9 5l7 7-7 7')}</button>
        <button type="button" class="portal-lightbox__close" aria-label="Fechar">${icon('M6 6l12 12M18 6 6 18')}</button>
        <ol class="portal-lightbox__thumbs" role="list"></ol>`;
      document.body.append(dialog);
      dialog.querySelector('.portal-lightbox__close').addEventListener('click', () => dialog.close());
      dialog.querySelector('.portal-lightbox__nav--prev').addEventListener('click', () => this.show(this.index - 1));
      dialog.querySelector('.portal-lightbox__nav--next').addEventListener('click', () => this.show(this.index + 1));
      // A click on the backdrop (outside the photo and controls) closes the viewer.
      dialog.addEventListener('click', (event) => { if (event.target === dialog || event.target.classList.contains('portal-lightbox__stage')) dialog.close(); });
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); this.show(this.index - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); this.show(this.index + 1); }
      });
      let startX = null;
      dialog.addEventListener('pointerdown', (event) => { if (event.pointerType !== 'mouse') startX = event.clientX; });
      dialog.addEventListener('pointerup', (event) => {
        if (startX === null) return;
        const dx = event.clientX - startX; startX = null;
        if (Math.abs(dx) > 48) this.show(this.index + (dx < 0 ? 1 : -1));
      });
      dialog.addEventListener('close', () => { document.documentElement.classList.remove('portal-lightbox-open'); this.trigger?.focus({ preventScroll: true }); });
      this.dialog = dialog;
      return dialog;
    },
    // Shopify CDN URLs take a width parameter: a responsive srcset is built from the 2000px source.
    sized(url, width) { return url.replace(/([?&])width=\d+/, `$1width=${width}`); },
    open(items, index, title, trigger) {
      const dialog = this.get();
      this.items = items; this.trigger = trigger;
      dialog.setAttribute('aria-label', title);
      const thumbs = dialog.querySelector('.portal-lightbox__thumbs');
      thumbs.replaceChildren(...items.map((item, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<button type="button" class="portal-lightbox__thumb" aria-label="Foto ${i + 1} de ${items.length}"><img src="${this.sized(item.full, 160)}" alt="" loading="lazy" decoding="async" width="80" height="80"></button>`;
        li.firstElementChild.addEventListener('click', () => this.show(i));
        return li;
      }));
      thumbs.hidden = items.length < 2;
      dialog.querySelectorAll('.portal-lightbox__nav').forEach((button) => { button.hidden = items.length < 2; });
      document.documentElement.classList.add('portal-lightbox-open');
      if (!dialog.open) dialog.showModal();
      this.show(index);
    },
    show(index) {
      const count = this.items.length;
      this.index = (index + count) % count;
      const item = this.items[this.index];
      const dialog = this.dialog;
      const img = dialog.querySelector('.portal-lightbox__image');
      img.removeAttribute('src');
      img.srcset = [800, 1200, 1600, 2000].map((w) => `${this.sized(item.full, w)} ${w}w`).join(', ');
      img.sizes = '100vw';
      img.src = this.sized(item.full, 1200);
      img.alt = item.alt;
      dialog.querySelector('.portal-lightbox__count').textContent = `${this.index + 1} / ${count}`;
      dialog.querySelector('.portal-lightbox__text').textContent = item.caption;
      dialog.querySelectorAll('.portal-lightbox__thumb').forEach((thumb, i) => {
        thumb.toggleAttribute('aria-current', i === this.index);
        if (i === this.index) thumb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced.matches ? 'instant' : 'smooth' });
      });
      // Warm up the neighbours so arrow navigation feels instant.
      if (count > 1) for (const step of [1, -1]) new Image().src = this.sized(this.items[(this.index + step + count) % count].full, 1200);
    },
  };

  class PortalGallery extends HTMLElement {
    connectedCallback() {
      this.abort = new AbortController();
      this.addEventListener('click', (event) => {
        const link = event.target.closest('.portal-gallery__link');
        if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        const links = [...this.querySelectorAll('.portal-gallery__link')];
        const items = links.map((a) => ({ full: a.dataset.full, caption: a.dataset.caption || '', alt: a.querySelector('img')?.alt || '' }));
        lightbox.open(items, links.indexOf(link), this.dataset.title || '', link);
      }, { signal: this.abort.signal });
    }
    disconnectedCallback() { this.abort?.abort(); }
  }

  // Index of the event sections on the page, in editor order (date + name, linking to each event).
  class PortalEventIndex extends HTMLElement {
    connectedCallback() {
      this.abort = new AbortController();
      this.build = () => {
        const events = [...document.querySelectorAll('.portal-event[data-event-name]')];
        const list = this.querySelector('.portal-event-index__list');
        list.replaceChildren(...events.map((event) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.className = 'portal-event-index__link';
          a.href = `#${event.id}`;
          const date = document.createElement('span'); date.className = 'portal-event-index__date'; date.textContent = event.dataset.eventDate || '';
          const name = document.createElement('span'); name.className = 'portal-event-index__name'; name.textContent = event.dataset.eventName;
          a.append(date, name); li.append(a);
          return li;
        }));
        this.hidden = events.length < 2;
      };
      for (const type of ['shopify:section:load', 'shopify:section:unload', 'shopify:section:reorder']) document.addEventListener(type, () => requestAnimationFrame(this.build), { signal: this.abort.signal });
      this.build();
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

  for (const [name, component] of [['portal-reveal', PortalReveal], ['portal-header', PortalHeader], ['portal-immersive', PortalImmersive], ['portal-carousel', PortalCarousel], ['portal-tabs', PortalTabs], ['portal-ambient-video', PortalAmbientVideo], ['portal-gallery', PortalGallery], ['portal-event-index', PortalEventIndex]]) {
    if (!customElements.get(name)) customElements.define(name, component);
  }
})();
