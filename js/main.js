'use strict';

const profiles = [];
for (let slot = 0; slot < profileSlotCount; slot++) {
  profiles.push(new ProfileStore(undefined, slot));
}
let selectedProfile = 0;
try {
  const saved = Number(profiles[0].storage?.getItem('mellstroy-stars.active-profile.v1'));
  if (Number.isInteger(saved) && saved >= 0 && saved < profiles.length) {
    selectedProfile = saved;
  }
} catch (_) {}
let profile = profiles[selectedProfile];
const audio = new AudioManager(profile.settings);
const game = new Game(document.getElementById('game'), { audio, profile });
const menu = new MenuController(game, profile, audio);
const profilePicker = new ProfilePicker(profiles, slot => {
  profile = profiles[slot];
  selectedProfile = slot;
  game.profile = profile;
  menu.profile = profile;
  menu.roadStart = Math.max(1, profile.profile.roadClaimedLevel);
  document.getElementById('mode').value = profile.settings.modeId;
  document.getElementById('map').value = profile.settings.mapId;
  menu.updateChoices();
  menu.syncSettings();
  menu.show();
  audio.setSettings(profile.settings);
  audio.unlock();
  profile.save();
  try {
    profile.storage?.setItem('mellstroy-stars.active-profile.v1', String(slot));
  } catch (_) {}
}, () => {
  menu.show();
  audio.setSettings(profile.settings);
  audio.unlock();
});
document.getElementById('switch-profile').addEventListener('click', () => {
  if (game.active) {
    return;
  }
  audio.pause();
  profilePicker.open(selectedProfile);
});
game.start();
profilePicker.open(selectedProfile, false);
