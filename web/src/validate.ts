import type { BodyMetrics, LlmConfig } from './types';

export function validApiConfig(config: LlmConfig): boolean {
  return !!config.baseUrl.trim() && !!config.apiKey.trim() && !!config.model.trim();
}

export const apiReady = (config: LlmConfig) => validApiConfig(config);

export const BODY_FIELDS: { key: keyof BodyMetrics; label: string; unit: string }[] = [
  { key: 'weight_kg', label: '体重', unit: 'kg' },
  { key: 'body_fat_pct', label: '体脂率', unit: '%' },
  { key: 'muscle_kg', label: '肌肉量', unit: 'kg' },
  { key: 'visceral_fat', label: '内脏脂肪等级', unit: '级' },
  { key: 'bmr_kcal', label: '基础代谢', unit: 'kcal' },
  { key: 'bmi', label: 'BMI', unit: '' },
];

