// Ported from web/src/domain/growth.ts @ f13c602.
import { CONFIG } from './config.js';
import { validateMetric } from './metrics.js';
import { calculateTargets, clamp, completeMeals, intake, shiftDate, trendAt, weekKey } from './targets.js';
const G = CONFIG.growth;
export const ATTRS = ['str', 'end', 'agi', 'wil'];
export const zeros = () => ({ str: 0, end: 0, agi: 0, wil: 0 });
export const xpThreshold = (level) => G.threshold * clamp(level, 0, G.maxLevel) ** G.exponent;
export function attributeLevel(xp, trials = [], legacyLevel = 1) {
    let level = 1;
    while (level < G.maxLevel && xp >= xpThreshold(level + 1))
        level++;
    for (let gate = G.trialEvery; gate < G.maxLevel; gate += G.trialEvery)
        if (level > gate && !trials.includes(gate) && legacyLevel <= gate)
            return gate;
    return Math.max(clamp(Math.floor(legacyLevel), 1, G.maxLevel), level);
}
export const credibility = (meta) => meta?.source === 'screenshot' || meta?.source === 'healthConnect' ? 1 : G.manual;
export function behaviorXp(ratio, confidence) {
    if (Number.isNaN(ratio) || ratio < 0)
        return 0;
    const r = ratio === Infinity ? 1 + G.excessLimit : ratio;
    return G.dailyXp * clamp(confidence, 0, 1) * (Math.min(r, 1) + G.excessRate * Math.min(Math.max(r - 1, 0), G.excessLimit));
}
export function dailyXp(state, date) {
    const entry = state.days[date];
    if (!entry || !state.profile)
        return { xp: zeros(), completion: 0, belowFloor: false };
    const targets = calculateTargets(state, date), training = entry.training;
    const h = entry.health;
    const valid = (metric, value) => !validateMetric(metric, value).hard.length;
    const ratioXp = (value, goal, metric, meta) => value != null && valid(metric, value) ? behaviorXp(value / goal, credibility(meta)) : 0;
    const priorAerobic = Object.entries(state.days).filter(([key]) => key < date && weekKey(key) === weekKey(date)).reduce((sum, [, item]) => { const v = item.training?.aerobic ?? item.health?.exercise_min ?? 0; return sum + (valid('training', v) ? v : 0); }, 0);
    const aerobicActual = training?.aerobic ?? h?.exercise_min ?? 0;
    const aerobic = valid('training', aerobicActual) ? Math.min(aerobicActual, Math.max(0, CONFIG.target.aerobicCountCap - priorAerobic)) : 0;
    const str = ratioXp(training?.resistance, G.resistanceMinutes * targets.resistance[0] / G.trainingDays, 'training', entry.meta?.training);
    const end = (ratioXp(h?.steps, targets.steps, 'steps', h?.meta?.steps) + ratioXp(aerobic, targets.aerobic / G.trainingDays, 'training', training ? entry.meta?.training : h?.meta?.exercise_min)) / 2;
    const agi = Math.max(ratioXp(training?.stretch, G.stretchDaily, 'training', entry.meta?.training), ratioXp(training?.hiit, G.hiitDaily, 'training', entry.meta?.training));
    const kcal = intake(entry);
    const belowFloor = kcal < targets.safeFloor;
    const diet = !belowFloor && Math.abs(kcal - targets.calories) <= targets.calories * G.dietTolerance && Object.values(entry.meals).every((meal) => valid('intake', meal?.total_kcal));
    const meals = Object.values(entry.meals).filter(Boolean);
    const mealConfidence = meals.length ? meals.reduce((sum, meal) => sum + credibility(meal?.meta), 0) / meals.length : G.manual;
    const complete = completeMeals(entry) && valid('weight', entry.weight) && !!h && valid('steps', h.steps) && valid('sleep', h.total_min);
    const sleep = h?.total_min != null && valid('sleep', h.total_min) && h.total_min >= G.sleepMin;
    const wil = (behaviorXp(diet ? 1 : 0, mealConfidence) + behaviorXp(complete ? 1 : 0, G.manual) + behaviorXp(sleep ? 1 : 0, credibility(h?.meta?.total_min))) / 3;
    const xp = { str, end, agi, wil };
    const physicalRatio = (value, goal, metric) => value != null && valid(metric, value) ? clamp(value / goal, 0, 1) : 0;
    const completion = (physicalRatio(training?.resistance, G.resistanceMinutes * targets.resistance[0] / G.trainingDays, 'training') +
        (physicalRatio(h?.steps, targets.steps, 'steps') + physicalRatio(aerobic, targets.aerobic / G.trainingDays, 'training')) / 2 +
        Math.max(physicalRatio(training?.stretch, G.stretchDaily, 'training'), physicalRatio(training?.hiit, G.hiitDaily, 'training')) +
        (Number(diet) + Number(complete) + Number(sleep)) / 3) / ATTRS.length;
    return { xp, completion, belowFloor };
}
