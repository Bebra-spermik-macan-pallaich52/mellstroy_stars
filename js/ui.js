'use strict';

class UI {
  constructor() {
    const byId = id => document.getElementById(id);
    this.health = byId('health'); this.healthText = byId('health-text');
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
    this.resultRestart = byId('result-restart'); this.resultReward = byId('result-reward');
  }
  text(element, value) { const text = String(value ?? ''); if (element && element.textContent !== text) element.textContent = text; }
  score(value) { return String(Math.round(value * 100) / 100); }
  render(game, paused) {
    const { player, manager } = game;
    if (!player || !manager || !game.active) { this.result.hidden = true; return; }
    const mode = manager.mode;
    this.health.max = player.maxHealth; this.health.value = player.health;
    this.super.value = player.superCharge;
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
      : player.cooldownRemaining > 0 ? `Перезарядка: ${player.cooldownRemaining.toFixed(1)} с` : 'WASD · ЛКМ · Q — супер';
    this.text(this.status, state); this.text(this.message, game.message);
    if (finished) {
      const result = manager.result;
      const title = result.winner === null ? 'Ничья' : result.winner === player.team ? 'Победа!' : 'Поражение';
      this.text(this.resultTitle, title);
      this.result.dataset.outcome = result.winner === null ? 'draw' : result.winner === player.team ? 'win' : 'loss';
      this.text(this.resultDetail, `${result.reason === 'goal' ? 'Цель режима достигнута' : 'Время вышло'}. Счёт ${this.score(result.scores[0])} : ${this.score(result.scores[1])}.`);
      if (game.reward) this.text(this.resultReward, `+${game.reward.coins} монет · +${game.reward.xp} опыта`);
      if (this.result.hidden) { this.result.hidden = false; this.resultRestart.focus({ preventScroll: true }); }
    } else { this.result.hidden = true; this.text(this.resultReward, ''); }
  }
}
