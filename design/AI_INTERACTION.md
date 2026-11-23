# 燃脂勇者 · AI 输入交互与大模型指令 v0.1

效果图：`design/mockups/07_record_hub.png`、`08_meal_submit.png`、`09_screenshot_import.png`、`10_sleep.png`。
底部导航改为 5 格，中间是凸起的橙色「+ 记录」按钮，任何页面一键进入记录中心。

---

## 1. 每日数据流

```
 用户输入（记录中心 +）                     大模型                         游戏层
 ┌───────────────────────┐
 │ 餐饮：拍照 / 文字 / 语音 │──► ① 餐饮识别（视觉+文本）──► 热量/营养 JSON ──┐
 │ 手环截图：活动页/睡眠页  │──► ② 截图识别（视觉）     ──► 步数/心率/睡眠 JSON ┤
 │ 体重：手动输入          │──────────────────────────────────────────────┤
 └───────────────────────┘                                                ▼
                                                     用户在 App 里核对/修改 → 确认
                                                                           ▼
                                           本地数据库（Room）：每日记录 DailyLog
                                                                           ▼
      每天首次打开 / 0 点 ──► ③ 每日计划生成 ──► 今日任务 + 卡路里目标 + 教练寄语 + BOSS
                                                                           ▼
                                           任务进度自动结算 → 战力 / XP / 金币 / 掉落
```

关键原则：
- **AI 只给"建议值"，用户确认后才入库。** 识别结果页每一项都能改（铅笔图标），置信度低的标橙色「请核对」。
- **所有 AI 调用都要求返回固定 JSON**，客户端用 schema 校验，失败就重试一次，再失败退回手动填写。
- **一次截图识别可以同时传多张图**（活动页 + 睡眠页），模型合并输出。
- 截图是前期方案；后续接 Health Connect / 第三方 API 时，只替换「数据来源」，下游 JSON 结构不变。

## 2. 记录中心（07）

| 区块 | 交互 | 完成后 |
|---|---|---|
| 餐饮 4 格（早/午/晚/加餐） | 点空格 → 进入提交餐饮页 | 显示热量 + 绿勾，汇总条「已摄入 / 目标」 |
| 手环截图 | 「上传截图」→ 系统相册多选 | 显示「上次导入 时间」，步数类任务自动推进 |
| 睡眠 | 来自截图识别，点开看睡眠详情（10） | 生成状态效果（疲惫 / 精力充沛） |
| 体重 | 数字键盘输入 | 显示与昨日差值，更新体重里程碑 |

顶部「已记录 3/6」本身也是一个每日任务：6 项全记录 = 「完美记录」+20 战力。

## 3. 大模型指令

客户端统一走 OpenAI 兼容的 `POST /v1/chat/completions`，需要能看图的模型（视觉模型）。下面 `{...}` 是客户端填入的变量。

### ① 餐饮识别

**System：**
```
你是一名注册营养师，负责估算中国家常饮食的热量和营养。
规则：
1. 根据图片和用户描述识别每种食物，估算份量（克）和热量（kcal）。用户描述与图片冲突时，以用户描述的份量为准。
2. 份量不确定时，按中国成年人常见的一份估算，并把 confidence 设为 "low"。
3. 只输出 JSON，不要输出任何其他文字。
4. comment 是给用户的一句话点评（≤30 字），语气像游戏里的贤者导师，鼓励为主，给一个具体可执行的建议。
```

**User：**（content 里附图片，可为空）
```
餐次：{晚餐}
用户描述：{米饭半碗，番茄炒蛋，清炒西兰花}
今日已摄入：{1030} kcal，今日目标：{1650} kcal
```

**返回 JSON：**
```json
{
  "items": [
    {"name": "米饭", "portion": "半碗", "grams": 120, "kcal": 140, "protein_g": 3, "carb_g": 31, "fat_g": 0.3, "confidence": "high"}
  ],
  "total_kcal": 430,
  "protein_g": 22, "carb_g": 55, "fat_g": 14,
  "comment": "不错！蛋白质再多一点更好，明天午餐加个鸡蛋。"
}
```

### ② 手环 / 运动 App 截图识别

**System：**
```
你是数据录入助手，从手机健康类 App（手环、手表、运动 App）的截图中提取数据。
规则：
1. 只提取截图里明确显示的数字，绝不推算或编造。看不到的字段填 null。
2. 时长统一换算成分钟，时间用 24 小时制 "HH:MM"，日期用 "YYYY-MM-DD"。
3. 截图日期看不出来时，date 填 null，客户端默认用今天。
4. 每个字段给出 confidence：数字清晰可读为 "high"，模糊、被遮挡或需要从图表估读为 "low"。
5. 多张截图合并成一个结果；同一字段在多张图里出现时取最清晰的那个。
6. 只输出 JSON。
```

**User：**（附 1~4 张截图）
```
请识别这些截图。今天是 {2026-11-20}。
```

**返回 JSON：**
```json
{
  "date": "2026-11-20",
  "source_app_guess": "某手环App",
  "activity": {
    "steps":         {"value": 8532, "confidence": "high"},
    "active_kcal":   {"value": 412,  "confidence": "high"},
    "distance_km":   {"value": 5.9,  "confidence": "high"},
    "avg_heart_rate":{"value": 72,   "confidence": "high"},
    "exercise_min":  {"value": 35,   "confidence": "low"}
  },
  "sleep": {
    "bed_time":   {"value": "00:48", "confidence": "high"},
    "wake_time":  {"value": "07:00", "confidence": "high"},
    "total_min":  {"value": 372, "confidence": "high"},
    "deep_min":   {"value": 65,  "confidence": "low"},
    "light_min":  {"value": 220, "confidence": "high"},
    "rem_min":    {"value": 75,  "confidence": "high"},
    "awake_min":  {"value": 12,  "confidence": "high"},
    "score":      {"value": 68,  "confidence": "high"}
  }
}
```
客户端：`confidence == "low"` 显示橙色「请核对」，其余显示绿色「准确」。

### ③ 每日计划生成

**System：**
```
你是减肥 RPG 游戏里的 AI 教练「贤者」，同时具备运动康复和营养学知识。
你的任务是根据玩家的身体数据和昨天的表现，生成今天的减肥计划，并拆成可打卡的游戏任务。
安全规则（必须遵守）：
- 每日热量目标不低于 基础代谢(BMR) 且不低于 女 1200 / 男 1500 kcal；每周减重目标不超过体重的 1%。
- 睡眠 < 6 小时或用户报告不适时，降低运动强度，不安排高强度训练。
- 不给出药物、节食断食或任何医疗建议；用户提到疾病/疼痛时，coach_message 里建议就医。
游戏规则：
- 生成 4~6 个任务，类型从 [steps, water, meal, workout, sleep, record] 中选，至少 1 个 meal 和 1 个运动类。
- 任务要具体、可量化、今天能完成。难度 1~3。
- reward_power：难度1=10~20，难度2=30~50，难度3=60~80。reward_coin 约为战力的一半。
- 如果玩家没有本周 BOSS，生成一个针对其最薄弱习惯的 7 天 BOSS 挑战。
- coach_message 用 RPG 导师口吻，≤40 字，先点评昨天，再说今天重点。
只输出 JSON。
```

**User：**
```json
{
  "date": "2026-11-20", "weekday": "周四",
  "profile": {"sex": "male", "age": 28, "height_cm": 175, "weight_kg": 72.1, "target_kg": 65, "class": "战士", "workout_days_per_week": 4},
  "yesterday": {
    "intake_kcal": 1820, "target_kcal": 1650, "protein_g": 70,
    "steps": 8532, "active_kcal": 412,
    "sleep_min": 372, "sleep_score": 68,
    "quests_done": 4, "quests_total": 5, "missed": ["核心训练 15 分钟"]
  },
  "weight_trend_7d": [72.9, 72.8, 72.6, 72.6, 72.4, 72.4, 72.1],
  "streak_days": 14,
  "current_boss": {"name": "甜食魔王", "days_left": 3, "progress": "4/7"},
  "user_note": "{用户在计划页输入框写的话，可为空}"
}
```

**返回 JSON：**
```json
{
  "coach_message": "勇者，昨晚睡眠不足，今天降低强度，以快走为主。",
  "status_effect": {"name": "疲惫", "effect": "今日任务强度 -20%"},
  "targets": {"intake_kcal": 1650, "burn_kcal": 450, "protein_g": 100, "water_cups": 8, "difficulty": 2},
  "timeline": [
    {"time": "07:30", "type": "meal", "text": "早餐 燕麦+鸡蛋", "kcal": 420},
    {"time": "18:00", "type": "workout", "text": "快走 40 分钟"}
  ],
  "quests": [
    {"id": "q1", "type": "steps",   "title": "晨间快走 6000 步", "target": 6000, "unit": "步", "difficulty": 1, "reward_power": 30, "reward_coin": 20, "auto_check": "steps"},
    {"id": "q2", "type": "water",   "title": "喝水 8 杯",        "target": 8,    "unit": "杯", "difficulty": 1, "reward_power": 10, "reward_coin": 5,  "auto_check": "manual"},
    {"id": "q3", "type": "meal",    "title": "低卡午餐 ≤600kcal", "target": 600,  "unit": "kcal", "difficulty": 2, "reward_power": 30, "reward_coin": 15, "auto_check": "meal:lunch"}
  ],
  "boss": null
}
```
`auto_check` 告诉客户端用哪条数据自动判定完成：`steps` 看截图导入的步数，`meal:lunch` 看午餐热量，`sleep` 看入睡时间，`manual` 由用户手动打勾。

### 计划页输入框（04 页底部「告诉教练你的情况…」）

用户随时可以说「今天加班没时间运动」「膝盖有点疼」「晚上有聚餐」。客户端把这句话放进 `user_note`，重新调用 ③，返回新计划替换今天未完成的任务（已完成任务和奖励保留）。

## 4. 数据接入路线

| 阶段 | 方式 | 说明 |
|---|---|---|
| **前期（现在）** | 截图 + 视觉模型识别 | 任何手环/App 都能用，零对接成本；缺点是要手动截图 |
| 中期 | Android **Health Connect** | 谷歌官方健康数据中心，可读步数、心率、睡眠、体重。小米运动健康、Zepp、Fitbit、Samsung Health、Google Fit 等可同步到这里；华为运动健康目前基本不支持，仍需截图 |
| 后期 | 厂商开放 API | 如 Zepp / Fitbit / Garmin 等提供开发者接口，需要申请和 OAuth 授权，按用户群决定是否做 |

客户端用统一的 `HealthDataSource` 接口抽象（`ScreenshotSource` / `HealthConnectSource` / `VendorApiSource`），输出同一个 `DailyHealth` 结构，切换来源不影响游戏逻辑。

## 5. 隐私

- 截图和餐饮照片只发给用户自己配置的大模型 API，识别完成后本地只保留提取出的数字，原图默认不保存（设置里可开）。
- API Key 存在 EncryptedSharedPreferences，不上传任何服务器。
