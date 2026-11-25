// Ported from web/src/domain/metrics.ts @ f13c602.
import { CONFIG } from './config.js';
export function validateMetric(key, raw, context = {}) {
    const [label, unit, min, max] = CONFIG.metrics[key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    const hard = [], soft = [];
    if (!Number.isFinite(value) || value < min || value > max)
        hard.push(`${label}须为 ${min}–${max} ${unit}，不可留空`);
    if (Number.isFinite(value) && CONFIG.metrics[key][4] === 0 && !Number.isInteger(value))
        hard.push(`${label}请填写整数`);
    if (hard.length)
        return { hard, soft };
    if (key === 'targetWeight') {
        if (!context.height || value / (context.height / 100) ** 2 < CONFIG.target.bmiLow)
            hard.push('目标体重对应 BMI 不可低于18.5');
        if (context.weight && (context.weight - value) / context.weight > CONFIG.validation.targetReduction)
            soft.push('首阶段超过15%，建议拆分为多个阶段');
    }
    if (key === 'weight' && context.previous && Math.abs(value - context.previous) > CONFIG.validation.weightJump)
        soft.push('与上次体重变化超过3kg，请核对');
    if (key === 'intake' && context.safeFloor && value < context.safeFloor)
        soft.push('低于个人补给下限，请核对');
    if (key === 'intake' && context.meal && value > CONFIG.validation.mealLarge)
        soft.push('单餐超过2000kcal，请核对');
    if (key === 'steps' && value > CONFIG.validation.stepsHigh)
        soft.push('步数超过40000，请核对');
    if (key === 'aerobic' && value > CONFIG.target.aerobicCountCap)
        soft.push('周有氧超过420分钟，超出部分不计经验');
    if (key === 'heart' && (value < CONFIG.validation.heartLow || value > CONFIG.validation.heartHigh))
        soft.push('心率超出核对区间');
    if (key === 'sleep' && (value < CONFIG.validation.sleepLow || value > CONFIG.validation.sleepHigh))
        soft.push('睡眠时长请核对');
    if (context.confidence === 'low')
        soft.push('识别置信度较低，请核对');
    return { hard, soft };
}
export const combine = (results) => ({ hard: results.flatMap((entry) => entry.hard), soft: results.flatMap((entry) => entry.soft) });
export const manualMeta = () => ({ source: 'manual', edited: false });
export const BODY_METRIC = { weight_kg: 'weight', body_fat_pct: 'bodyFat', muscle_kg: 'muscle', visceral_fat: 'visceral', bmr_kcal: 'bmr', bmi: 'bmi' };
export const HEALTH_METRIC = { steps: 'steps', active_kcal: 'intake', distance_km: 'distance', avg_heart_rate: 'heart', exercise_min: 'training', total_min: 'sleep', deep_min: 'sleep', light_min: 'sleep', rem_min: 'sleep', awake_min: 'sleep', score: 'score' };
export function scaleFood(food, grams) {
    const density = food.kcal_per_100g ?? (food.grams ? food.kcal / food.grams * 100 : 0);
    const ratio = food.grams ? grams / food.grams : 0;
    return { ...food, grams, kcal_per_100g: density, kcal: Math.round(grams * density / 100), protein_g: (food.protein_g ?? 0) * ratio, carb_g: (food.carb_g ?? 0) * ratio, fat_g: (food.fat_g ?? 0) * ratio };
}
