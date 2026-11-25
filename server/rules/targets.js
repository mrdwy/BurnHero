// Ported from web/src/domain/targets.ts @ f13c602.
import { CONFIG } from './config.js';
import { validateMetric } from './metrics.js';
const C = CONFIG.target;
export const shiftDate = (key, offset) => { const date = new Date(key + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
export const weekKey = (key) => shiftDate(key, -((new Date(key + 'T12:00:00Z').getUTCDay() + 6) % 7));
export const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
export const intake = (entry) => Object.values(entry?.meals ?? {}).reduce((sum, meal) => sum + (Number.isFinite(meal?.total_kcal) ? meal.total_kcal : 0), 0);
export const completeMeals = (entry) => !!entry && ['breakfast', 'lunch', 'dinner'].every((key) => { const meal = entry.meals[key]; return !!meal && !validateMetric('intake', meal.total_kcal).hard.length; });
export function trendSeries(days, initial, through = '9999-12-31') {
    let trend = initial;
    return Object.keys(days).sort().filter((key) => key <= through && !validateMetric('weight', days[key].weight).hard.length).map((date) => {
        trend += C.trendAlpha * (days[date].weight - trend);
        return { date, value: trend };
    });
}
export function trendAt(state, date) {
    const series = trendSeries(state.days, state.profile?.startWeight ?? 0, date);
    return series.at(-1)?.value ?? state.profile?.startWeight ?? 0;
}
export function modeFor(profile, weight, waist = profile.waist) {
    const bmi = weight / (profile.height / 100) ** 2;
    if (bmi < C.bmiLow)
        return 'supply';
    if (weight <= profile.targetWeight)
        return 'guardian';
    return bmi >= C.bmiOver || (waist != null && waist >= C.waist[profile.sex]) ? 'loss' : 'maintain';
}
export const MODE_LABEL = { supply: '补给模式', maintain: '维持 / 塑形', loss: '减重模式', guardian: '守护者' };
export function speedFor(lossPerWeek, plateau = false) {
    if (lossPerWeek > C.tooFast)
        return 'tooFast';
    if (lossPerWeek > C.fast)
        return 'fast';
    if (lossPerWeek >= C.healthy)
        return 'healthy';
    if (lossPerWeek < -C.regain)
        return 'regain';
    return plateau ? 'plateau' : 'stable';
}
export function weightSpeed(state, date) {
    const series = trendSeries(state.days, state.profile?.startWeight ?? 0, date);
    const start = shiftDate(date, -C.adaptDays);
    const before = series.filter((point) => point.date <= start).at(-1);
    const latest = series.at(-1);
    if (!before || !latest || latest.date <= start || latest.date < shiftDate(date, -C.adaptEvery))
        return { status: 'insufficient', lossPerWeek: 0 };
    const elapsed = (Date.parse(latest.date) - Date.parse(before.date)) / 86400000;
    const lossPerWeek = (before.value - latest.value) * C.adaptEvery / elapsed;
    const plateau = Array.from({ length: C.plateauWeeks }, (_, index) => {
        const end = shiftDate(date, -index * C.adaptEvery), begin = shiftDate(end, -C.adaptEvery);
        const a = series.filter((point) => point.date <= begin).at(-1), b = series.filter((point) => point.date <= end).at(-1);
        return !!a && !!b && a.date !== b.date && Math.abs(a.value - b.value) < C.healthy;
    }).every(Boolean);
    return { status: speedFor(lossPerWeek, plateau), lossPerWeek };
}
export function adaptTdee(old, bmr, averageIntake, trendDelta) {
    const observed = averageIntake - trendDelta * C.kcalPerKg / C.adaptDays;
    const blended = C.adaptOld * old + C.adaptNew * observed;
    return clamp(clamp(blended, old - C.adaptMax, old + C.adaptMax), bmr * C.adaptMinFactor, bmr * C.adaptMaxFactor);
}
export function calculateTargets(state, date) {
    const p = state.profile;
    if (!p)
        throw new Error('请先完善资料');
    const trend = trendAt(state, date);
    const latestWaist = Object.keys(state.days).filter((key) => key <= date && state.days[key].waist != null).sort().at(-1);
    const classified = modeFor(p, trend, latestWaist ? state.days[latestWaist].waist : p.waist);
    const mode = state.guardianSince && state.guardianSince <= date && classified !== 'supply' && trend <= p.targetWeight + CONFIG.growth.guardianBand ? 'guardian' : classified;
    const bmr = C.bmr.weight * trend + C.bmr.height * p.height - C.bmr.age * p.age + C.bmr[p.sex];
    const factor = C.activity[Math.min(C.activity.length - 1, Math.floor(clamp(p.workoutDays, 0, 7) / 2))];
    const initialTdee = bmr * factor;
    let tdee = state.calibration?.date && state.calibration.date <= date ? clamp(state.calibration.tdee, bmr * C.adaptMinFactor, bmr * C.adaptMaxFactor) : initialTdee;
    const speed = weightSpeed(state, date);
    let calibration;
    const lastDate = state.calibration?.date;
    if (!lastDate || date >= shiftDate(lastDate, C.adaptEvery)) {
        const keys = Array.from({ length: C.adaptDays }, (_, index) => shiftDate(date, -index));
        const complete = keys.filter((key) => completeMeals(state.days[key]));
        const trendStart = trendSeries(state.days, p.startWeight, shiftDate(date, -C.adaptDays)).at(-1);
        const trendEnd = trendSeries(state.days, p.startWeight, date).at(-1);
        if (complete.length >= C.adaptMinimum && trendStart && trendEnd?.date === date) {
            tdee = adaptTdee(tdee, bmr, complete.reduce((sum, key) => sum + intake(state.days[key]), 0) / complete.length, trend - trendStart.value);
            calibration = { date, tdee };
        }
    }
    const kg = mode === 'supply' || mode === 'guardian' ? 0 : C.weekLoss[mode];
    const deficit = speed.status === 'tooFast' ? 0 : Math.min(kg * C.kcalPerKg / C.adaptEvery, tdee * C.deficitCap);
    const safeFloor = Math.max(bmr, C.floors[p.sex]);
    const calories = Math.max(tdee - deficit, safeFloor);
    const stepValues = Array.from({ length: C.stepWindow }, (_, index) => state.days[shiftDate(date, -index)]?.health?.steps).filter((value) => value != null && !validateMetric('steps', value).hard.length).sort((a, b) => a - b);
    const median = stepValues.length ? (stepValues[Math.floor((stepValues.length - 1) / 2)] + stepValues[Math.floor(stepValues.length / 2)]) / 2 : C.stepsMin / C.activityIncrease;
    let aerobic = C.aerobicStart;
    const currentWeek = weekKey(date);
    const weeks = [...new Set(Object.keys(state.days).filter((key) => key < currentWeek).map(weekKey))].sort();
    for (const week of weeks) {
        const actual = Object.entries(state.days).filter(([key]) => weekKey(key) === week).reduce((sum, [, entry]) => sum + (entry.training?.aerobic ?? entry.health?.exercise_min ?? 0), 0);
        if (actual / aerobic >= C.aerobicPass)
            aerobic = Math.min(C.aerobicCap, aerobic * C.activityIncrease);
    }
    const minWeight = C.bmiLow * (p.height / 100) ** 2;
    const phaseBase = state.phase?.startWeight ?? p.startWeight;
    const phaseTarget = mode === 'supply' ? Math.max(p.targetWeight, minWeight) : Math.max(p.targetWeight, minWeight, phaseBase * (1 - C.phaseReduction));
    return { mode, bmi: trend / (p.height / 100) ** 2, trend, bmr, factor, tdee, deficit, safeFloor, calories, protein: C.protein.map((value) => value * p.targetWeight), waterCups: Math.ceil(C.waterMl[p.sex] / C.cupMl), steps: Math.round(clamp(median * C.activityIncrease, C.stepsMin, C.stepsMax)), aerobic: Math.round(aerobic), resistance: C.resistance, phaseTarget, phaseMonths: C.phaseMonths, speed, physician: trend / (p.height / 100) ** 2 >= C.bmiObese, calibration };
}
