'use strict';

class UI {
  constructor() {
    this.health = document.getElementById('health');
    this.healthText = document.getElementById('health-text');
    this.super = document.getElementById('super');
    this.superText = document.getElementById('super-text');
    this.enemyHealth = document.getElementById('enemy-health');
    this.enemyHealthText = document.getElementById('enemy-health-text');
    this.enemyFire = document.getElementById('enemy-fire');
    this.status = document.getElementById('status');
    this.message = document.getElementById('message');
    this.stats = document.getElementById('stats');
  }
  text(element, value) { if (element.textContent !== value) element.textContent = value; }
  render(game, paused) {
    const { player, enemy } = game;
    this.health.max = player.maxHealth; this.health.value = player.health;
    this.super.value = player.superCharge;
    this.enemyHealth.max = enemy.maxHealth; this.enemyHealth.value = enemy.health;
    this.text(this.healthText, `${player.health} / ${player.maxHealth}`);
    this.text(this.superText, player.superCharge >= 100 ? '100% · заряд готов' : `${Math.floor(player.superCharge)}%`);
    this.text(this.enemyHealthText, enemy.alive ? `${enemy.health} / ${enemy.maxHealth}` : `Возрождение: ${enemy.respawnRemaining.toFixed(1)} с`);
    this.text(this.stats, `Противников побеждено: ${game.stats.kills} · Ваших смертей: ${game.stats.deaths}`);
    const state = paused ? 'Пауза · вернитесь в игру' : !player.alive
      ? `Вы погибли · возрождение: ${player.respawnRemaining.toFixed(1)} с`
      : player.cooldownRemaining > 0 ? `Перезарядка: ${player.cooldownRemaining.toFixed(1)} с` : 'Атака готова';
    this.text(this.status, state);
    this.text(this.message, game.message);
  }
}
