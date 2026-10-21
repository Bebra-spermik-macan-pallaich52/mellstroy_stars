'use strict';

class ProfilePicker {
  constructor(profiles, onSelect, onCancel, drawPortrait) {
    this.profiles = profiles;
    this.onSelect = onSelect;
    this.onCancel = onCancel;
    this.drawPortrait = drawPortrait;
    this.view = document.getElementById('profile-picker');
    this.shell = document.getElementById('game-shell');
    this.track = document.getElementById('profile-track');
    this.back = document.getElementById('profile-back');
    this.previous = document.getElementById('profile-previous');
    this.next = document.getElementById('profile-next');
    this.selected = 0;
    this.visible = false;
    this.busy = false;
    this.cards = [];
    for (let index = 0; index < profiles.length; index++) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'profile-card';
      card.dataset.slot = index;
      card.style.setProperty('--profile-color', ['#cbd3bd', '#dfc9a7', '#bccdd0', '#d6c4c1', '#c9c3d4'][index]);
      const avatar = document.createElement('span');
      avatar.className = 'profile-avatar';
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 240;
      canvas.setAttribute('aria-hidden', 'true');
      avatar.append(canvas);
      const number = document.createElement('span');
      number.className = 'profile-number';
      number.textContent = index + 1;
      const name = document.createElement('strong');
      const progress = document.createElement('small');
      card.append(avatar, number, name, progress);
      card.addEventListener('click', () => this.choose(index));
      this.track.append(card);
      this.cards.push({ card, canvas, name, progress });
    }
    this.previous.addEventListener('click', () => this.choose(this.selected - 1));
    this.next.addEventListener('click', () => this.choose(this.selected + 1));
    this.back.addEventListener('click', () => this.close());
    document.getElementById('profile-enter').addEventListener('click', () => this.enter());
    document.addEventListener('keydown', event => {
      if (!this.visible || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'Enter', 'Escape'].includes(event.code)) {
        event.preventDefault();
        event.stopPropagation();
        if (this.busy) {
          return;
        }
        if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
          this.choose(this.selected - 1);
        } else if (event.code === 'KeyD' || event.code === 'ArrowRight') {
          this.choose(this.selected + 1);
        } else if (event.code === 'Enter') {
          this.enter();
        } else if (event.code === 'Escape') {
          this.close();
        }
      }
      if (event.code === 'Tab') {
        const buttons = [...this.view.querySelectorAll('button')].filter(button => !button.disabled && !button.hidden && button.tabIndex >= 0);
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }, true);
  }
  open(index = 0, canClose = true) {
    this.selected = Math.max(0, Math.min(this.profiles.length - 1, index));
    this.visible = true;
    this.busy = false;
    this.canClose = canClose;
    this.back.hidden = !canClose;
    this.view.hidden = false;
    this.view.classList.remove('is-leaving');
    this.shell.inert = true;
    this.shell.hidden = true;
    for (let slot = 0; slot < this.cards.length; slot++) {
      const store = this.profiles[slot];
      const elements = this.cards[slot];
      this.drawPortrait(elements.canvas, slot);
      elements.name.textContent = store.settings.nickname;
      elements.progress.textContent = `Ур. ${store.level} · ${store.profile.coins} монет`;
      elements.card.setAttribute('aria-label', `Профиль ${slot + 1}: ${store.settings.nickname}, уровень ${store.level}`);
    }
    this.choose(this.selected);
  }
  choose(index) {
    if (this.busy) {
      return;
    }
    this.selected = Math.max(0, Math.min(this.profiles.length - 1, index));
    for (let slot = 0; slot < this.cards.length; slot++) {
      const card = this.cards[slot].card;
      const offset = slot - this.selected;
      card.style.setProperty('--position', offset);
      card.style.setProperty('--scale', Math.max(.68, 1 - Math.abs(offset) * .12));
      card.style.setProperty('--alpha', Math.max(.22, 1 - Math.abs(offset) * .2));
      card.style.zIndex = this.cards.length - Math.abs(offset);
      card.classList.toggle('is-selected', offset === 0);
      card.setAttribute('aria-pressed', String(offset === 0));
      card.tabIndex = offset === 0 ? 0 : -1;
    }
    this.previous.disabled = this.selected === 0;
    this.next.disabled = this.selected === this.cards.length - 1;
    document.getElementById('profile-choice').textContent = `${this.selected + 1} / ${this.cards.length}`;
    this.cards[this.selected].card.focus({ preventScroll: true });
  }
  enter() {
    if (!this.visible || this.busy) {
      return;
    }
    this.busy = true;
    this.view.classList.add('is-leaving');
    const duration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 240;
    window.setTimeout(() => {
      this.hide();
      this.onSelect(this.selected);
    }, duration);
  }
  close() {
    if (!this.canClose || this.busy) {
      return;
    }
    this.hide();
    this.onCancel();
  }
  hide() {
    this.visible = false;
    this.busy = false;
    this.view.hidden = true;
    this.view.classList.remove('is-leaving');
    this.shell.hidden = false;
    this.shell.inert = false;
  }
}
