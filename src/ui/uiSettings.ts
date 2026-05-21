export type AutoSpeed = 'normal' | 'double' | 'turbo';

export interface UISettings {
  autoSpeed:      AutoSpeed;
  stopAutoOnPeka: boolean;
  bonusManualMode: boolean; // SettingsModal で編集 → dispatch(SET_BONUS_MANUAL) で同期
}

export const DEFAULT_UI_SETTINGS: UISettings = {
  autoSpeed:      'normal',
  stopAutoOnPeka: false,
  bonusManualMode: false,
};

export const AUTO_SPEED_DELAY: Record<AutoSpeed, number> = {
  normal: 600,
  double: 300,
  turbo:  80,
};

export const AUTO_SPEED_LABEL: Record<AutoSpeed, string> = {
  normal: '等速 (600ms)',
  double: '倍速 (300ms)',
  turbo:  '超高速 (80ms)',
};
