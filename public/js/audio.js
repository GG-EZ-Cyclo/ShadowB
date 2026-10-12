const homeBgm = new Audio("/audio/homeBGM1.mp3");
const battleBgm = new Audio("/audio/BattleBGM(Lowen).mp3");

[homeBgm, battleBgm].forEach(audio => {
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0.25;
});


const audioManager = {
  unlocked: false,
  active: "home",
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.setBgm(this.active);
  },
  setBgm(mode) {
    this.active = mode;
    const target = mode === "battle" ? battleBgm : homeBgm;
    [homeBgm, battleBgm].forEach(audio => {
      if (audio !== target) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    if (!this.unlocked) return;
    target.play().catch(() => {});
  },
  playEffect(path, volume = 0.6) {
    const audio = new Audio(path);
    audio.volume = volume;
    audio.preload = "auto";
    audio.play().catch(() => {});
  }
};

export { audioManager };
