// The DOM HUD: crosshair, hit marker, health, money, timer, score, kill feed,
// the buy menu and the overlays. It never touches the simulation; main.js pushes
// numbers in and reads the buy and play callbacks out. Every setter skips a DOM
// write when the value did not change, so the HUD costs nothing when idle.
const TEXTS = {
  menu: {
    action: 'Start match',
    title: 'EMBERLINE',
    copy: 'Cinder Quay at dusk. Five attackers, five Wardens, one spark charge. Plant it at A or B — or drop them all.',
  },
  paused: {
    action: 'Resume',
    title: 'EMBERLINE',
    copy: 'Paused. Click to get back in the yard.',
  },
  roundEnd: {
    action: 'Next round',
    title: 'Round over',
    copy: '',
  },
  matchEnd: {
    action: 'Play again',
    title: 'Match over',
    copy: '',
  },
};

export function makeHud() {
  const el = (id) => document.getElementById(id);
  const curtain = el('overlay');
  const titleEl = el('overlay-title');
  const copyEl = el('overlay-copy');
  const playBtn = el('play');
  const mag = el('ammo-mag');
  const res = el('ammo-reserve');
  const ammo = el('ammo');
  const hp = el('health-value');
  const hpFill = el('health-fill');
  const vest = el('armor-value');
  const cash = el('money-value');
  const clock = el('timer-value');
  const ember = el('score-ember');
  const warden = el('score-warden');
  const round = el('round-value');
  const emberN = el('alive-ember');
  const wardenN = el('alive-warden');
  const mark = el('hitmarker');
  const reticle = el('crosshair');
  const feedBox = el('feed');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const store = el('buy');
  const storeCash = el('buy-money');
  const progress = el('progress');
  const progressFill = el('progress-fill');
  const progressLabel = el('progress-label');
  const bomb = el('bomb-status');
  const spectator = el('spectate');
  const nades = el('grenades');
  let markTimer = 0;
  let bannerClock = 0;
  const cache = {};

  function setLabel(element, key, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    element.textContent = value;
  }

  return {
    setAmmo(rounds, spare, gun) {
      setLabel(mag, 'mag', String(rounds));
      setLabel(res, 'reserve', `/ ${spare}  ${gun}`);
      ammo.classList.toggle('empty', rounds === 0);
    },
    setHealth(health, armor) {
      setLabel(hp, 'hp', String(Math.ceil(health)));
      setLabel(vest, 'armor', armor > 0 ? `+${Math.ceil(armor)}` : '');
      hpFill.style.width = `${Math.max(0, health)}%`;
      hpFill.classList.toggle('low', health <= 30);
    },
    setMoney(money) {
      setLabel(cash, 'money', `$${money}`);
      setLabel(storeCash, 'buyMoney', `$${money}`);
    },
    setTimer(left, live) {
      const secs = Math.max(0, Math.ceil(left));
      const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      setLabel(clock, 'timer', text);
      clock.classList.toggle('urgent', secs <= 10);
    },
    setScore(home, away, number) {
      setLabel(ember, 'se', String(home));
      setLabel(warden, 'sw', String(away));
      setLabel(round, 'round', `ROUND ${number} / 9`);
    },
    setAlive(home, away) {
      setLabel(emberN, 'ae', `EMBER ${home}`);
      setLabel(wardenN, 'aw', `WARDENS ${away}`);
    },
    setGrenades(count) {
      setLabel(nades, 'nade', count > 0 ? `G × ${count} SPARK` : '');
    },
    setCrosshairSpread(spread) {
      const size = Math.round(22 + spread * 260);
      reticle.style.width = `${size}px`;
      reticle.style.height = `${size}px`;
    },
    hitMarker(fatal, linger = 90) {
      mark.classList.add('on');
      mark.style.transform = fatal
        ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)'
        : 'translate(-50%, -50%) rotate(45deg)';
      clearTimeout(markTimer);
      markTimer = setTimeout(() => {
        mark.classList.remove('on');
        mark.style.transform = '';
      }, linger);
    },
    feed(shooter, fallen, skull) {
      const row = document.createElement('div');
      row.className = 'feed-line';
      row.textContent = skull ? `${shooter}  ◉  ${fallen}` : `${shooter}  ×  ${fallen}`;
      feedBox.prepend(row);
      while (feedBox.children.length > 5) feedBox.lastChild.remove();
      setTimeout(() => row.remove(), 4500);
    },
    showBanner(head, sub, victory) {
      bannerTitle.textContent = head;
      bannerSub.textContent = sub;
      banner.classList.remove('hidden');
      banner.classList.toggle('won', victory);
      banner.classList.toggle('lost', !victory);
      clearTimeout(bannerClock);
      bannerClock = setTimeout(() => banner.classList.add('hidden'), 3200);
    },
    hideBanner() {
      banner.classList.add('hidden');
    },
    showProgress(text, done) {
      if (done <= 0) {
        progress.classList.add('hidden');
        return;
      }
      progress.classList.remove('hidden');
      progressLabel.textContent = text;
      progressFill.style.width = `${Math.round(done * 100)}%`;
    },
    setBomb(live, fuse, spot) {
      if (!live) {
        bomb.classList.add('hidden');
        return;
      }
      bomb.classList.remove('hidden');
      setLabel(bomb, 'bomb', `SPARK planted at ${spot} — ${Math.ceil(fuse)}s`);
    },
    setSpectate(show) {
      spectator.classList.toggle('hidden', !show);
    },
    showBuy(owned, money) {
      store.classList.remove('hidden');
      this.setMoney(money);
      for (const item of store.querySelectorAll('[data-buy]')) {
        item.classList.toggle('owned', owned.includes(item.dataset.buy));
      }
    },
    hideBuy() {
      store.classList.add('hidden');
    },
    showOverlay(kind, note = '') {
      const text = TEXTS[kind];
      titleEl.textContent = text.title;
      copyEl.textContent = note || text.copy;
      playBtn.textContent = text.action;
      curtain.hidden = false;
      playBtn.focus();
    },
    hideOverlay() {
      curtain.hidden = true;
    },
    overlayHidden() {
      return curtain.hidden;
    },
    onPlay(fn) {
      playBtn.addEventListener('click', fn);
    },
    onBuy(fn) {
      store.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-buy]');
        if (btn) fn(btn.dataset.buy);
      });
    },
    onDeploy(fn) {
      el('deploy').addEventListener('click', fn);
    },
  };
}
