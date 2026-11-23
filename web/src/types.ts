export type ClassId = 'warrior' | 'ranger' | 'monk';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Attr = 'str' | 'end' | 'agi' | 'wil';
export type Conf = 'high' | 'low';

export interface Profile {
  name: string;
  cls: ClassId;
  sex: 'male' | 'female';
  age: number;
  height: number;
  startWeight: number;
  targetWeight: number;
  workoutDays: number;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  demo: boolean;
}

export interface BodyMetrics {
  weight_kg?: number;
  body_fat_pct?: number;
  muscle_kg?: number;
  visceral_fat?: number;
  bmr_kcal?: number;
  bmi?: number;
}

export interface BodyAssessment {
  id: string;
  measuredDate: string;
  recordedAt: string;
  metrics: BodyMetrics;
  condition: string;
  sleepHours: string | number;
  availableMinutes: string | number;
  reportResponse?: string;
}

export interface FoodItem {
  name: string;
  portion: string;
  grams?: number;
  kcal: number;
  protein_g?: number;
  carb_g?: number;
  fat_g?: number;
  confidence?: Conf;
}

export interface MealEntry {
  items: FoodItem[];
  total_kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  comment: string;
  text: string;
  at: string;
}

export interface Field<T> {
  value: T | null;
  confidence: Conf;
}

export interface HealthData {
  steps?: number | null;
  active_kcal?: number | null;
  distance_km?: number | null;
  avg_heart_rate?: number | null;
  exercise_min?: number | null;
  bed_time?: string | null;
  wake_time?: string | null;
  total_min?: number | null;
  deep_min?: number | null;
  light_min?: number | null;
  rem_min?: number | null;
  awake_min?: number | null;
  score?: number | null;
  importedAt?: string;
}

export type QuestType = 'steps' | 'water' | 'meal' | 'workout' | 'sleep' | 'record';

export interface Quest {
  id: string;
  type: QuestType;
  title: string;
  target: number;
  unit: string;
  difficulty: number;
  reward_power: number;
  reward_coin: number;
  auto_check: string; // steps | water | meal:lunch | sleep | record | manual
  manualProgress?: number;
  claimed?: boolean;
}

export interface TimelineItem {
  time: string;
  type: string;
  text: string;
  kcal?: number;
  done?: boolean;
}

export interface Plan {
  assessmentId?: string;
  rawResponse?: string;
  coach_message: string;
  status_effect?: { name: string; effect: string } | null;
  targets: { intake_kcal: number; burn_kcal: number; protein_g?: number; water_cups: number; difficulty: number };
  timeline: TimelineItem[];
  quests: Quest[];
  boss?: { name: string; desc: string; days: number } | null;
}

export interface DayLog {
  meals: Partial<Record<MealSlot, MealEntry>>;
  health?: HealthData;
  weight?: number;
  bodyAssessment?: BodyAssessment;
  water: number;
  plan?: Plan; // 已生成待接受的计划
  accepted?: boolean;
  quests: Quest[];
  chestOpened?: boolean;
  bossChecked?: boolean;
}

export interface Boss {
  name: string;
  desc: string;
  days: number;
  progress: number;
  startDate: string;
  done?: boolean;
}

export interface Hero {
  level: number;
  xp: number;
  coins: number;
  gems: number;
  attrs: Record<Attr, number>;
  streak: number;
  lastActive?: string;
  title: string;
}

export interface State {
  version: 1;
  profile: Profile | null;
  llm: LlmConfig;
  hero: Hero;
  days: Record<string, DayLog>;
  inventory: string[];
  equipped: Record<string, string>;
  boss?: Boss;
  tickets: Record<string, number>;
  prefs?: { motion: boolean };
}
