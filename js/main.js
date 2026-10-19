'use strict';

const profile = new ProfileStore();
const audio = new AudioManager(profile.settings);
const game = new Game(document.getElementById('game'), { audio, profile });
const menu = new MenuController(game, profile, audio);
game.start();
