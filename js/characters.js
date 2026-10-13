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
  speed: 200, width: 48, height: 64, maxHealth: 1000, respawnDelay: 3,
  attack: { damage: 200, speed: 620, range: 420, cooldown: 0.45, radius: 5 },
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
  { id: 'arthur', name: 'Артур', unlockCost: 0, description: 'Точный выстрел. Супер: усиленный снаряд.',
    maxHealth: 1000, speed: 200, attack: { damage: 200, range: 420, cooldown: 0.45 },
    super: { kind: 'heavy', damage: 600, speed: 950, range: 600, radius: 7 } },
  { id: 'kotost', name: 'Котость', unlockCost: 80, description: 'Прочный союзник. Супер: лечение рядом с собой.',
    maxHealth: 1300, speed: 190, attack: { damage: 220, range: 340, cooldown: 0.55 },
    super: { kind: 'heal', heal: 450, radius: 180 } },
  { id: 'mellstroy_fat', name: 'Меллстрой Жирность', unlockCost: 140, description: 'Большой запас здоровья. Супер: взрыв вокруг себя.',
    maxHealth: 1500, speed: 180, attack: { damage: 260, range: 320, cooldown: 0.7 },
    super: { kind: 'nova', damage: 400, radius: 170 } },
  { id: 'dark_drun', name: 'Тёмный Друн', unlockCost: 200, description: 'Частые атаки. Супер: щит на 5 секунд.',
    maxHealth: 1100, speed: 200, attack: { damage: 140, range: 410, cooldown: 0.32 },
    super: { kind: 'shield', reduction: 0.6, duration: 5 } },
  { id: 'fog', name: 'Фог', unlockCost: 260, description: 'Быстрый и хрупкий. Супер: веер из пяти снарядов.',
    maxHealth: 850, speed: 210, attack: { damage: 110, range: 380, cooldown: 0.25 },
    super: { kind: 'fan', count: 5, spread: 0.16, damage: 180, speed: 750, range: 550, radius: 5 } }
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
