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
    this.resultRestart = byId('result-restart');
  }
  text(element, value) { if (element.textContent !== value) element.textContent = value; }
  score(value, modeId) { return modeId === 'donations' ? String(value) : String(Math.round(value * 100) / 100); }
  render(game, paused) {
    const { player, manager } = game, mode = manager.mode;
    this.health.max = player.maxHealth; this.health.value = player.health;
    this.super.value = player.superCharge;
    this.text(this.healthText, `${player.health} / ${player.maxHealth}`);
    this.text(this.superText, player.superCharge >= 100 ? '100% · заряд готов' : `${Math.floor(player.superCharge)}%`);
    mode.scores.forEach((score, team) => this.text(this.teamScores[team], this.score(score, game.modeId)));
    const remaining = Math.max(0, Math.ceil(manager.remaining));
    this.text(this.timer, `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`);
    this.text(this.goal, `Цель: ${manager.goal} ${game.modeId === 'donations' ? 'донатов' : 'очков'}`);
    const donations = game.modeId === 'donations';
    this.donationsInfo.hidden = !donations; this.cottageInfo.hidden = donations;
    if (donations) {
      this.text(this.carried, String(mode.carried.get(player) || 0));
      this.text(this.rules, 'Собирайте донаты в центре. Победа — при достижении цели или по счёту после окончания времени.');
    } else {
      this.zoneProgress.value = Math.abs(mode.progress);
      const teamName = team => team === 0 ? 'зелёные' : 'красные';
      const favor = mode.progress > 0 ? 0 : mode.progress < 0 ? 1 : null;
      const occupying = mode.occupants[0] ? 0 : mode.occupants[1] ? 1 : null;
      const percentage = Math.round(Math.abs(mode.progress));
      const capture = mode.contested ? 'Оспаривается · захват остановлен'
        : occupying === null ? `Зона пуста · ${percentage}%`
        : favor !== null && occupying !== favor ? `${teamName(occupying)} перехватывают`
        : `${teamName(occupying)} · ${percentage}%`;
      this.text(this.zoneText, capture);
      this.zoneProgress.style.setProperty('accent-color', favor === 1 ? '#ff8c86' : '#73e3c0');
      this.zoneProgress.classList.toggle('red-zone', favor === 1);
      this.text(this.owner, mode.owner === null ? 'Владелец: нет' : `Владелец: ${teamName(mode.owner)}`);
      this.text(this.rules, 'Войдите в коттедж. Обе команды в зоне останавливают захват и очки; присутствие врага прерывает контроль.');
    }
    this.text(this.stats, `Противников побеждено: ${game.stats.kills} · Ваших смертей: ${game.stats.deaths}`);
    const finished = manager.state === 'finished';
    const state = finished ? 'Матч завершён' : paused ? 'Пауза · вернитесь в игру' : !player.alive
      ? `Вы погибли · возрождение: ${player.respawnRemaining.toFixed(1)} с`
      : player.cooldownRemaining > 0 ? `Перезарядка: ${player.cooldownRemaining.toFixed(1)} с` : 'Атака готова';
    this.text(this.status, state); this.text(this.message, game.message);
    if (finished) {
      const result = manager.result;
      const title = result.winner === null ? 'Ничья' : result.winner === player.team ? 'Победа!' : 'Поражение';
      this.text(this.resultTitle, title);
      this.text(this.resultDetail, `${result.reason === 'goal' ? 'Цель режима достигнута' : 'Время вышло'}. Счёт: ${this.score(result.scores[0], game.modeId)} : ${this.score(result.scores[1], game.modeId)}.`);
      if (this.result.hidden) { this.result.hidden = false; this.resultRestart.focus({ preventScroll: true }); }
    } else this.result.hidden = true;
  }
}
