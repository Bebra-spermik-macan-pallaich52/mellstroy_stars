'use strict';

// Gameplay settings are independent of sprite loading and the browser UI.
const characterImages = [
  { name: 'Артур', x: 0, y: 130, width: 424, height: 500 },
  { name: 'Котость', x: 430, y: 150, width: 465, height: 480 },
  { name: 'Меллстрой Жирность', x: 900, y: 230, width: 484, height: 390 },
  { name: 'Тёмный Друн', x: 1385, y: 65, width: 385, height: 605 },
  { name: 'Фог', x: 1870, y: 130, width: 270, height: 515 }
];

// Baseline kept available for simple movement/combat fixtures.
const characterConfig = {
  speed: 150, width: 48, height: 64, maxHealth: 1000, respawnDelay: 3,
  attack: { damage: 200, speed: 620, range: 420, cooldown: 0.45, radius: 5, ammo: 3, reload: 1.5 },
  super: { damageRequired: 1000 },
  animation: { fps: 8 }, image: 'assets/characters/characters.png'
};

function walkingAnimation(size = 128) {
  const animations = {};
  ['down', 'left', 'right', 'up'].forEach((direction, row) => {
    const frames = Array.from({ length: 4 }, (_, column) => ({ x: column * size, y: row * size, width: size, height: size }));
    animations[`walk_${direction}`] = frames;
    animations[`idle_${direction}`] = [frames[0]];
  });
  return { fps: 8, animations };
}

const characterDefinitions = [
  { id: 'arthur', name: 'Артур', unlockCost: 0, description: 'Вертушка: точный выстрел. Супер «Золотая стрела»: пробивает до трёх врагов.',
    maxHealth: 1000, speed: 150, attack: { kind: 'precision', ammo: 3, reload: 1.5, name: 'Вертушка', style: 'propeller', damage: 200, range: 420, cooldown: 0.45 },
    super: { kind: 'heavy', name: 'Золотая стрела', style: 'lance', pierce: 3, damage: 600, speed: 950, range: 600, radius: 7 } },
  { id: 'kotost', name: 'Котость', unlockCost: 80, description: 'Царапки: три когтя веером. Супер «Мурчание»: лечение и восстановление союзников.',
    maxHealth: 1300, speed: 142.5, attack: { kind: 'scatter', ammo: 3, reload: 1.7, name: 'Царапки', style: 'claw', count: 3, spread: 0.18, damage: 80, speed: 580, range: 300, cooldown: 0.55, radius: 5 },
    super: { kind: 'heal', name: 'Мурчание', heal: 450, radius: 180, regen: 60, duration: 3 } },
  { id: 'mellstroy_fat', name: 'Меллстрой Жирность', unlockCost: 140, description: 'Донатная бомба: взрыв по площади. Супер «Срыв банка»: ударная волна вокруг себя.',
    maxHealth: 1500, speed: 135, attack: { kind: 'explosive', ammo: 2, reload: 2.2, name: 'Донатная бомба', style: 'bomb', damage: 260, speed: 400, range: 320, cooldown: 0.8, radius: 8, blastRadius: 90 },
    super: { kind: 'nova', name: 'Срыв банка', damage: 400, radius: 170 } },
  { id: 'dark_drun', name: 'Тёмный Друн', unlockCost: 200, description: 'Тёмная сфера: пробивает двух врагов. Супер «Ночная броня»: щит на 5 секунд.',
    maxHealth: 1100, speed: 150, attack: { kind: 'piercing', ammo: 3, reload: 1.8, name: 'Тёмная сфера', style: 'shadow', pierce: 2, damage: 140, speed: 520, range: 410, cooldown: 0.42, radius: 7 },
    super: { kind: 'shield', name: 'Ночная броня', reduction: 0.6, duration: 5 } },
  { id: 'fog', name: 'Фог', unlockCost: 260, description: 'Эхо: короткая очередь из двух игл. Супер «Лабиринт»: пять игл с рикошетом.',
    maxHealth: 850, speed: 157.5, attack: { kind: 'burst', ammo: 4, reload: 1.25, name: 'Эхо', style: 'needle', count: 2, interval: 0.09, damage: 65, speed: 760, range: 380, cooldown: 0.4, radius: 3 },
    super: { kind: 'fan', name: 'Лабиринт', style: 'fogfan', bounces: 1, count: 5, spread: 0.16, damage: 180, speed: 750, range: 550, radius: 5 } }
];

function getCharacterConfig(index = 0) {
  const definition = Number.isInteger(index) && index >= 0 && index < characterDefinitions.length
    ? characterDefinitions[index] : characterDefinitions[0];
  return {
    ...characterConfig, ...definition,
    attack: { ...characterConfig.attack, ...definition.attack },
    super: { ...characterConfig.super, ...definition.super },
    animation: walkingAnimation(), image: `assets/characters/${definition.id}-walk.png`
  };
}
