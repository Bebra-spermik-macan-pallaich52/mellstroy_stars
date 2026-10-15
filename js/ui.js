'use strict';

class UI {
  constructor() {
    const byId = id => document.getElementById(id);
    this.respawnOverlay = byId('respawn-overlay'); this.respawnSeconds = byId('respawn-seconds'); this.respawnCaption = byId('respawn-caption');
    this.health = byId('health'); this.healthText = byId('health-text');
    this.ammoSlots = byId('ammo-slots'); this.ammoText = byId('ammo-text'); this.reloadText = byId('reload-text');
    this.super = byId('super'); this.superText = byId('super-text');
    this.enemyFire = byId('enemy-fire'); this.modeSelect = byId('mode');
    this.status = byId('status'); this.message = byId('message'); this.stats = byId('stats');
    this.teamScores = [byId('score-0'), byId('score-1')];
    this.timer = byId('timer'); this.goal = byId('goal');
    this.donationsInfo = byId('donations-info'); this.carried = byId('carried');
    this.cottageInfo = byId('cottage-info'); this.zoneProgress = byId('zone-progress');
    this.zoneText = byId('zone-text'); this.owner = byId('owner');
    this.rules = byId('rules'); this.result = byId('result');
    this.resultTitle = byId('result-title'); this.resultDetail = byId('result-detail');
    this.resultLevel = byId('result-level'); this.resultXp = byId('result-xp-bar'); this.resultNext = byId('result-next-reward'); this.resultRoad = byId('result-road');
    this.resultRestart = byId('result-restart'); this.resultReward = byId('result-reward');
  }
  text(element, value) { const text = String(value ?? ''); if (element && element.textContent !== text) element.textContent = text; }
  score(value) { return String(Math.round(value * 100) / 100); }
  render(game, paused) {
    const { player, manager } = game;
    if (!player || !manager || !game.active) { this.result.hidden = true; this.respawnOverlay.hidden = true; return; }
    const mode = manager.mode;
    this.respawnOverlay.hidden = player.alive || manager.state !== 'playing';
    if (!this.respawnOverlay.hidden) {
      this.text(this.respawnSeconds, Math.max(1, Math.ceil(player.respawnRemaining - 1e-8)));
      this.text(this.respawnCaption, paused ? 'Пауза' : game.camera.flight ? 'Возвращаемся к точке появления' : 'Здесь ты вернёшься в бой');
    }
    this.health.max = player.maxHealth; this.health.value = player.health;
    this.super.value = player.superCharge;
    if (this.ammoSlots.children.length !== player.maxAmmo) {
      this.ammoSlots.replaceChildren(...Array.from({ length: player.maxAmmo }, () => {
        const slot = document.createElement('span'); slot.className = 'ammo-slot'; return slot;
      }));
    }
    [...this.ammoSlots.children].forEach((slot, index) => {
      const fill = !player.alive ? 0 : index < player.ammo ? 1 : index === player.ammo ? player.reloadProgress : 0;
      slot.style.setProperty('--fill', `${fill * 100}%`);
      slot.classList.toggle('loaded', index < player.ammo && player.alive);
    });
    this.ammoSlots.classList.toggle('empty', player.ammo === 0 || !player.alive);
    this.ammoSlots.setAttribute('aria-label', `Боезапас: ${player.alive ? player.ammo : 0} из ${player.maxAmmo}`);
    this.text(this.ammoText, `${player.alive ? player.ammo : 0} / ${player.maxAmmo}`);
    this.text(this.reloadText, !player.alive ? 'Пополнится при возрождении' : player.ammo === player.maxAmmo ? 'Полный запас' : `+1 через ${Math.max(0, player.config.attack.reload - player.reloadElapsed).toFixed(1)} с`);
    this.text(this.healthText, `${Math.ceil(player.health)} / ${player.maxHealth}`);
    this.super.classList.toggle('ready', player.superCharge >= 100 && player.alive);
    this.text(this.superText, player.superCharge >= 100 ? 'ГОТОВА · Q' : `${Math.floor(player.superCharge)}%`);
    mode.scores.forEach((score, team) => this.text(this.teamScores[team], this.score(score)));
    const remaining = Math.max(0, Math.ceil(manager.remaining));
    this.text(this.timer, `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`);
    const units = game.modeId === 'donations' ? 'донатов' : game.modeId === 'teamfight' ? 'побед над соперниками' : 'очков';
    this.text(this.goal, `Цель: ${manager.goal} ${units}`);
    const donations = game.modeId === 'donations', cottage = game.modeId === 'cottage';
    this.donationsInfo.hidden = !donations; this.cottageInfo.hidden = !cottage;
    if (donations) {
      this.text(this.carried, mode.carried.get(player) || 0);
      this.text(this.rules, 'Соберите 15 донатов командой. После смерти теряется половина донатов; их можно подобрать.');
    } else if (cottage) {
      this.zoneProgress.value = Math.abs(mode.progress);
      const teamName = team => team === 0 ? 'ваша команда' : 'соперники';
      const favor = mode.progress > 0 ? 0 : mode.progress < 0 ? 1 : null;
      const occupying = mode.occupants[0] ? 0 : mode.occupants[1] ? 1 : null;
      const percentage = Math.round(Math.abs(mode.progress));
      const capture = mode.contested ? 'Спорная зона'
        : occupying === null ? `${percentage}% · пусто`
        : favor !== null && occupying !== favor ? `${percentage}% · перехват`
        : `${percentage}% · ${teamName(occupying)}`;
      this.text(this.zoneText, capture);
      this.zoneProgress.classList.toggle('red-zone', favor === 1);
      this.text(this.owner, mode.owner === null ? 'Без владельца' : `Контроль: ${teamName(mode.owner)}`);
      this.text(this.rules, 'Захватите коттедж и получите 100 очков. Присутствие обеих команд останавливает захват и очки.');
    } else this.text(this.rules, 'Победите соперников 10 раз своей командой. После смерти персонажи возрождаются.');
    this.text(this.stats, `Побеждено: ${game.stats.kills} · Смертей: ${game.stats.deaths}`);
    const finished = manager.state === 'finished';
    const state = finished ? 'Матч завершён' : paused ? 'Пауза' : !player.alive
      ? `Возрождение через ${player.respawnRemaining.toFixed(1)} с`
      : player.passiveHealing ? 'Восстановление здоровья · не атакуй' : player.ammo === 0 ? 'Нет зарядов — идёт перезарядка' : 'WASD · ЛКМ · Q — супер · 3 с без боя — отхил';
    this.text(this.status, state); this.text(this.message, game.message);
    if (finished) {
      const result = manager.result;
      const title = result.winner === null ? 'Ничья' : result.winner === player.team ? 'Победа!' : 'Поражение';
      this.text(this.resultTitle, title);
      this.result.dataset.outcome = result.winner === null ? 'draw' : result.winner === player.team ? 'win' : 'loss';
      this.text(this.resultDetail, `${result.reason === 'goal' ? 'Цель режима достигнута' : 'Время вышло'}. Счёт ${this.score(result.scores[0])} : ${this.score(result.scores[1])}.`);
      if (game.reward) this.text(this.resultReward, `+${game.reward.coins} монет · +${game.reward.xp} опыта`);
      if (game.profile) {
        const store = game.profile, target = store.nextRoadReward;
        const name = target.kind === 'character' && store.isUnlocked(target.characterIndex) ? `${target.compensation} монет` : target.name;
        const leveled = game.reward && game.reward.levelAfter > game.reward.levelBefore;
        this.text(this.resultLevel, leveled ? `Новый уровень: ${store.level}!` : `Уровень ${store.level} · ${store.levelProgress} / ${store.xpPerLevel} опыта`);
        this.resultXp.max = store.xpPerLevel; this.resultXp.value = store.levelProgress;
        this.text(this.resultNext, store.roadReadyCount ? `Можно забрать: ${name}${store.roadReadyCount > 1 ? ` и ещё ${store.roadReadyCount - 1} наград` : ''}.` : `${name} на уровне ${target.level} · ещё ${target.xp - store.profile.xp} опыта.`);
        this.text(this.resultRoad, store.roadReadyCount ? 'Забрать награду →' : 'Посмотреть путь →');
      }
      if (this.result.hidden) { this.result.hidden = false; this.resultRestart.focus({ preventScroll: true }); }
    } else { this.result.hidden = true; this.text(this.resultReward, ''); }
  }
}
