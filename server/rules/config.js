// Ported from web/src/domain/config.ts @ f13c602.
export const CONFIG = {
    metrics: {
        height: ['身高', 'cm', 100, 250, 1, '100–250 cm'], // [10] 录入边界为设计值
        weight: ['体重', 'kg', 25, 300, 1, 'BMI 18.5–23.9；建议晨起如厕后空腹称'], // [1,10]
        waist: ['腰围', 'cm', 40, 200, 1, '男<85/女<80；中心型男≥90/女≥85'], // [1,10]
        targetWeight: ['目标体重', 'kg', 25, 300, 1, '首阶段3–6个月减5%–10%；BMI≥18.5'], // [1,10]
        intake: ['摄入热量', 'kcal', 0, 10000, 0, '按个人补给目标'], // [4,10]
        protein: ['蛋白质', 'g', 0, 500, 1, '目标体重×1.0–1.2'], // [10]
        water: ['喝水', '杯', 0, 30, 0, '每杯250ml；男1700ml/女1500ml'], // [7,10]
        steps: ['步数', '步', 0, 100000, 0, '个人渐进目标'], // [3,10]
        aerobic: ['周有氧', '分钟', 0, 3000, 0, '减重150–420/维持200–300'], // [2,10]
        resistance: ['周抗阻', '次', 0, 14, 0, '每周2–3次'], // [2,10]
        heart: ['心率', 'bpm', 30, 220, 0, '静息60–100'], // [10]
        sleep: ['睡眠', '分钟', 0, 1440, 0, '至少7小时'], // [8,10]
        training: ['训练时长', '分钟', 0, 1440, 0, '按今日安排，量力而行'], // [10]
        age: ['年龄', '岁', 18, 100, 0, '成人模式'], // [10]
        workoutDays: ['每周运动', '天', 0, 7, 0, '0–7天'], // [10]
        bodyFat: ['体脂率', '%', 0, 100, 1, '以报告为准'], // [10]
        muscle: ['肌肉量', 'kg', 0, 300, 1, '以报告为准'], // [10]
        visceral: ['内脏脂肪等级', '级', 0, 100, 1, '以报告为准'], // [10]
        bmr: ['报告基础代谢', 'kcal', 0, 10000, 0, '目标使用本地计算'], // [10]
        bmi: ['报告BMI', '', 5, 100, 1, '18.5–23.9正常'], // [1,10]
        distance: ['距离', 'km', 0, 200, 1, '以设备为准'], // [10]
        score: ['睡眠评分', '分', 0, 100, 0, '以设备为准'], // [10]
    },
    validation: { weightJump: 3, targetReduction: .15, mealLarge: 2000, stepsHigh: 40000, heartLow: 40, heartHigh: 120, sleepLow: 240, sleepHigh: 840 }, // [10] 核对阈值
    target: {
        bmiLow: 18.5, bmiOver: 24, bmiObese: 28, waist: { male: 90, female: 85 }, // [1]
        weekLoss: { supply: 0, maintain: .25, loss: .5 }, phaseReduction: .05, phaseMonths: 6, // [1,10]
        bmr: { weight: 10, height: 6.25, age: 5, male: 5, female: -161 }, // [5]
        activity: [1.2, 1.375, 1.55, 1.725], kcalPerKg: 7700, deficitCap: .3, floors: { male: 1500, female: 1200 }, // [2,4,6,10]
        protein: [1, 1.2], waterMl: { male: 1700, female: 1500 }, cupMl: 250, // [7,10]
        aerobicStart: 150, aerobicCap: 300, aerobicCountCap: 420, aerobicPass: .8, activityIncrease: 1.1, resistance: [2, 3], // [2,10]
        stepsMin: 4000, stepsMax: 12000, stepWindow: 14, trendAlpha: .1, // [10]
        adaptDays: 14, adaptMinimum: 10, adaptEvery: 7, adaptOld: .8, adaptNew: .2, adaptMax: 150, adaptMinFactor: 1.1, adaptMaxFactor: 2.2, // [6,10]
        tooFast: 1, fast: .5, healthy: .1, regain: .2, plateauWeeks: 3, // [1,10]
        shortSleep: 360, recoveryFactor: .8, // [10] 恢复日活动设计值
    },
    growth: {
        initialAttrs: { str: 5, end: 5, agi: 5, wil: 5 }, // [10]
        classAttrs: { warrior: { str: 8, end: 5, agi: 4, wil: 5 }, ranger: { str: 4, end: 8, agi: 6, wil: 4 }, monk: { str: 4, end: 5, agi: 5, wil: 8 } }, // [10]
        badgeWeight: [2, 5], badgeSteps: 10000, badgeWater: 8, badgeWaterDays: 7, badgeQuests: 30, // [10]
        heroBaseXp: 100, heroLevelXp: 50, bossXp: 150, bossCoins: 300, bossGems: 5, bossDailyXp: 10, bossDailyCoins: 5, // [10]
        shopCosts: { rest: 300, cheat: 800, skin: 1500 }, // [10]
        dailyXp: 10, manual: .7, excessRate: .25, excessLimit: .8, weeklyCap: 60, threshold: 6, exponent: 1.5, maxLevel: 99, trialEvery: 20, // [10] 全部游戏设计值
        weights: { str: 10, end: 10, agi: 8, wil: 12 }, stateMin: .8, stateRange: .4, stateDays: 28, equipment: { common: .01, rare: .02, epic: .04, legend: .06 }, equipCap: .3, powerCap: 6178, // [10]
        dietTolerance: .1, sleepMin: 420, stretchDaily: 10, hiitDaily: 10, resistanceMinutes: 20, trainingDays: 7, // [8,10]
        weeklyCoins: 500, difficulty: [{ xp: 10, coins: 5 }, { xp: 20, coins: 10 }, { xp: 30, coins: 15 }], // [10]
        milestone: .02, guardianBand: 1.5, weightCoins: 40, guardianCoins: 30, chestMin: 20, chestRange: 41, dropChance: .2, gemChance: .3, // [10]
        rarityLevels: { common: 1, rare: 20, epic: 40, legend: 60 }, // [10]
    },
    guild: { maxMembers: 12, mockPeers: 4, dailyDamage: 40, targetDamage: 25, bossFactor: .7, weekDays: 7, victoryCoins: 200, consolation: 10, flags: ['sword', 'star', 'water', 'boot'], cheers: ['加油', '坚持就是胜利', '一起出征'] }, // [10]
};
