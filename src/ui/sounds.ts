const cache: Record<string, HTMLAudioElement> = {};

function playSound(path: string): void {
  if (!cache[path]) cache[path] = new Audio(path);
  const audio = cache[path]!.cloneNode() as HTMLAudioElement;
  audio.play().catch(() => {});
}

export const SFX = {
  maxbet:   () => playSound('/assets/sounds/btn_maxbet.m4a'),
  lever:    () => playSound('/assets/sounds/btn_lever.m4a'),
  stop1:    () => playSound('/assets/sounds/btn_stop1.m4a'),
  stop2:    () => playSound('/assets/sounds/btn_stop2.m4a'),
  stop3:    () => playSound('/assets/sounds/btn_stop3.m4a'),
  stop3Win: () => playSound('/assets/sounds/btn_stop3_win.m4a'),
} as const;
