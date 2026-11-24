import { z } from "zod";
import { dailyXp } from "./rules/growth.js";
export const slots = ["breakfast", "lunch", "dinner", "scale"];
export const sharing = z.array(z.enum([...slots, "weight", "band"])).max(6);
const amount = (max) => z.number().min(0).max(max).optional();
const profile = z.object({
  sex: z.enum(["male", "female"]),
  age: z.number().int().min(18).max(110),
  height: z.number().min(90).max(250),
  startWeight: z.number().min(25).max(350),
  targetWeight: z.number().min(25).max(350),
  workoutDays: z.number().int().min(0).max(7),
});
export const report = z.strictObject({
  profile: profile.optional(),
  weight: amount(350),
  meals: z
    .object({
      breakfast: amount(5000),
      lunch: amount(5000),
      dinner: amount(5000),
    })
    .default({}),
  band: z
    .object({
      steps: amount(100000),
      total_min: amount(1440),
      exercise_min: amount(600),
    })
    .default({}),
  training: z
    .object({
      resistance: amount(600),
      stretch: amount(600),
      hiit: amount(600),
      aerobic: amount(600),
    })
    .default({}),
  shares: sharing.default([]),
});
export function log(row, photos = []) {
  const d = row.data;
  return {
    weight: d.weight,
    meals: Object.fromEntries(
      Object.entries(d.meals).map(([slot, kcal]) => [
        slot,
        {
          total_kcal: kcal,
          meta: { source: photos.includes(slot) ? "screenshot" : "manual" },
        },
      ]),
    ),
    training: d.training,
    health: d.band,
    quests: [],
  };
}
export function damage(rows, date) {
  const profile = rows.find((row) => row.day === date)?.data.profile;
  if (!profile) return 0;
  const days = Object.fromEntries(rows.map((r) => [r.day, log(r, r.photos)]));
  const { xp, belowFloor } = dailyXp({ profile, days }, date);
  return belowFloor
    ? 0
    : Math.min(
        40,
        Object.values(xp).reduce((sum, v) => sum + v, 0),
      );
}
