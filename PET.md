# 电子宠物（yoyo 酱）

宠物系统的完整说明。AGENTS.md 不再重复本文内容，只保留指向本文的指针；**改动宠物功能时同步更新本文**。

## 模型与存储

- **宠物池模型**：宠物是全局实体（`pets` 表 id 主键 + `owner_user_id`，NULL=待领养），仅超管可新增入池，**一宠一主**（被领养后他人不可再领养）、**一人一宠**；旧版 user_id 主键表在 `db.ts` 自动迁移（改名 pets_legacy → 拷贝 → 删除，幂等）
- **三围玩法已移除**（2026-08-11）：饱食/心情/精力不再衰减也不展示，feed/pet/play 互动接口已删；表情改为前端**随机轮播**五状态。`pets` 表的 hunger/mood/energy 等旧列保留（NOT NULL，新插入填 80），代码不再读写
- **数据隔离**：宠物为全局宠物池（一宠一主）；记忆/聊天仅主人；外观 owner 或超管可改；列表与详情所有登录用户可见

## 页面与组件

- 全局右下角悬浮球组件 `PetOverlay`（挂在 `(main)/layout.tsx`，可拖拽移位、右下角手柄拖拽缩放 64–384px，位置/尺寸存 localStorage `pet-ball-pos`/`pet-ball-size`，默认 256px），表情每 8s 在五状态间随机轮播，点开面板改名/看任务汇报/跳详情（领养：从池里选一只未被领养的，可顺便改名）
- `/pets` 列表页：查看所有宠物状态（图、三围、主人），待领养的可领养，超管可新增
- `/pets/[id]` 详情页六个标签：状态 / 对话 / 记忆 / 外观 / 定时任务 / 文档

## 宠物对话（PIAgent）

- `POST /api/pets/[id]/chat`（SSE，仅主人），模型用**主人为宠物绑定的预设**（`pets.preset_id`，主人自己的 key，宠物设置里选择）；SSE 带 10s 心跳注释行（`: ping`）保活，防中间层在工具执行等长静默期间空闲断连
- 每只宠物独立工作区 `data/pets/<id>/workspace`（pi 的 cwd）+ `chat_session_id` 多轮连续；人设+状态+全部记忆每轮注入（`src/lib/pet-chat.ts`）
- **清空对话**：对话标签页顶栏「清空对话」→ `DELETE /api/pets/[id]/chat`（仅主人）——置空 `chat_session_id`（下次开新会话）+ 删除 pi-service 侧会话历史文件（`data/pi-agent/sessions/**` 按文件名后缀 `_<sessionId>.jsonl` 匹配，`deletePiSessionFiles`）+ 清前端 localStorage 记录
- 宠物聊天对所有登录用户开放（限自己的宠物）；原 Server-PIAgent `/pi` 页与 `/api/pi/chat` 已于 2026-08 随功能移除删除，pi-service 现仅供宠物使用

## 长期记忆

- `pet_memories` 表；对话中说「记住/记得/别忘」→ 聊天结束后调 PIAgent 精简为 ≤80 字一条入库（SSE 末尾发 `memory_saved` 事件），之后每次对话自动注入
- `GET/POST/DELETE /api/pets/[id]/memories`（仅主人）

## 定时任务

- `pet_tasks` 表（name/prompt/cron/interval_minutes/run_at/enabled/next_run_at/last_run_at/last_status/last_result/notified_at）。**三种触发三选一**：cron 五段（分 时 日 月 周，服务器本地时区——compose 已给 workbench 设 `TZ=Asia/Shanghai` 与用户时区一致，各段 AND 语义，支持 `* , - /`，日历周期重复）、**interval_minutes 纯间隔**（1–10080 分钟重复）、**run_at 一次性绝对时间**（执行一次后自动停用）。解析器与调度计算在 `src/lib/pet-tasks.ts`（零依赖自研，`normalizeSchedule` 统一校验、`nextRunFor` 统一下次触发）
- 调度器：主应用进程内 30s 一拍（globalThis 懒启动单例，由宠物相关路由首次命中时 `ensureSchedulerStarted()`），扫描到期任务异步执行；状态全落库，重启自动恢复
- 执行 = 以宠物人设 + 主人预设 + 宠物工作区跑一轮 PIAgent（与对话同一条 `chat_session_id`，主人可在对话里追问任务）；结果截断 2000 字写回任务行
- 占用锁 `src/lib/pet-busy.ts`：同一时刻只让一个进程占用宠物 pi 会话，**任务给聊天让道**（忙碌则跳过该拍，下一拍重试）
- 汇报：双通道——① 站内：任务完成后主人下次拉 `/api/pet` 时返回 `notices`（取出即标记 `notified_at`），悬浮球对话泡展示一次——**收起态球旁也会弹出对话泡**（多条全列、完整结果、20s，点击关闭）；② **微信推送**：任务完成/失败即经 Server酱推到主人微信（`src/lib/pet-notify.ts`，SendKey 走环境变量 `SERVERCHAN_SENDKEY`，compose 已透传，未配置则静默跳过，推送失败只记日志不影响任务）
- **自然语言一句话建任务**：`POST /api/pets/[id]/tasks/parse`（仅主人，需已绑预设）。时间规律**不写死在代码里**——「1 分钟后提醒我」→ 一次性、「每天…」→ cron 日历周期、「每隔…」→ 纯间隔，意图判断交给 PIAgent，规则统一维护在 `src/lib/pet-task-rule.ts`（`NL_TASK_RULE`，调口径只改这里，parse 路由每次自动注入）。模型输出 name+prompt+时间字段的 JSON，服务端 `normalizeSchedule` 校验后**直接 createTask 建好任务**（前端不展示转换中间结果）
- 详情页「定时任务」标签（仅主人）：顶部一句话输入框「创建任务」为主入口；下方手动表单（按间隔/按 cron）精确配置；启停/删除/立即运行（忙碌 409），15s 轮询看结果

## 外观

- `pets.appearance` JSON `{expressions: {表情名: 文件名}, stateMap: {状态: 表情名}, prompts: {文件名: 累积生成描述}}`，任意命名表情槽，资源存 `data/pets/<id>/assets/`（png/jpg/gif/webp/svg ≤5MB，GIF 即动画），上传/读取走 `/api/pets/[id]/assets[/file]`。stateMap 覆盖**五种显示状态**（`PetDisplayState`：idle/hungry/sleepy/eating/petted，悬浮球随机轮播这五种），无映射回退内置 `public/pet/{idle,petted,sleepy,hungry,eating}.png`（前端统一由 `pet-image.ts` 的 `petImageUrl` 解析）
- **AI 生成表情**：外观标签页「AI 生成表情」→ `POST /api/pets/[id]/assets/generate`（owner 或超管），走 RightAPI gpt 生图（`src/lib/pet-image-gen.ts`，固定角色描述 `YOYO_CHARACTER` 保证一致性 + `background:"transparent"`，key 用 `RIGHTAPI_API_KEY`，compose 已透传；规则同步维护在 `.kimi-code/skills/pet-appearance/`）；生成描述记入 `prompts[文件名]`
- **反复调整**：表情卡片「调整」→ `POST /api/pets/[id]/assets/adjust`（owner 或超管，body `{file, instruction}`）。RightAPI 不支持 `/v1/images/edits`（502），采用固定角色描述 + **累积提示词重绘**：`prompts[file]` 拼接本次意见后重绘，**覆盖写回原文件名**（expressions/stateMap 引用不变），累积描述写回 `prompts[file]`；散传图无历史则只用本次意见

## 接口一览

| 路由 | 方法 | 权限 | 说明 |
|---|---|---|---|
| `/api/pets` | GET / POST | 登录 / 超管 | 宠物池列表（含 myPetId）/ 新增宠物入池 |
| `/api/pets/[id]` | GET / PATCH | 登录（PATCH 需 owner 或超管） | 详情 / 改名·绑预设·外观 |
| `/api/pets/[id]/adopt` | POST | 登录 | 领养（池内未被领养 + 自己无宠物） |
| `/api/pets/[id]/chat` | POST / DELETE | owner | SSE 对话（PIAgent）/ 清空对话历史（重置会话 + 删 pi 会话文件） |
| `/api/pets/[id]/memories` | GET / POST / DELETE | owner | 记忆列表 / 手动补一条 / 删除 |
| `/api/pets/[id]/tasks` | GET / POST | owner | 定时任务列表 / 新建（name+prompt + cron/intervalMinutes/runAt 三选一） |
| `/api/pets/[id]/tasks/parse` | POST | owner | 自然语言一句话 → PIAgent 按 NL_TASK_RULE 分析意图，直接建好任务 |
| `/api/pets/[id]/tasks/[taskId]` | PATCH / DELETE | owner | 改名/内容/cron/间隔/一次性时间/启停 / 删除 |
| `/api/pets/[id]/tasks/[taskId]/run` | POST | owner | 立即运行（宠物忙碌 409） |
| `/api/pets/[id]/assets` | POST / DELETE | owner 或超管 | 上传 / 删除外观资源文件 |
| `/api/pets/[id]/assets/generate` | POST | owner 或超管 | AI 生成表情（RightAPI gpt 生图） |
| `/api/pets/[id]/assets/adjust` | POST | owner 或超管 | 反复调整一张图（累积提示词重绘，覆盖原文件） |
| `/api/pets/[id]/assets/[file]` | GET | 登录 | 读资源（basename 防穿越） |
| `/api/pets/[id]/files` | GET | owner 或超管 | 工作区文档预览：无参列文本文件（递归、跳过隐藏项与 node_modules，上限 200 条），`?file=<相对路径>` 读内容（resolve 后必须落在工作区内防穿越，md/txt/json/csv/log/xml/html/yaml/toml，≤512KB） |
| `/api/pet` | GET / POST | 登录 | 悬浮球：我的宠物（GET 附带定时任务汇报 notices），rename，adopt 收 petId |

## 关键文件

- `src/lib/pet-store.ts` — 宠物池存储（三围已移除，旧列保留不写）
- `src/lib/pet-chat.ts` — PIAgent 对话（人设+记忆注入、工作区、记忆精简）
- `src/lib/pet-tasks.ts` + `src/lib/pet-busy.ts` — 定时任务（cron 解析、调度器、执行）与宠物占用锁
- `src/lib/pet-notify.ts` — 微信通知（Server酱，`SERVERCHAN_SENDKEY` 环境变量）
- `src/lib/pet-image-gen.ts` — RightAPI 外观生成（`YOYO_CHARACTER` 一致性规则）
- `src/lib/pet-types.ts` — 纯类型（客户端/服务端共用）
- `src/app/api/pets/*` + `src/app/api/pet/route.ts` — 接口
- `src/components/pet/{PetOverlay.tsx,pet-image.ts}` — 悬浮球组件与图片解析
- `src/components/pet/Markdown.tsx` — 零依赖轻量 Markdown 渲染器（React 节点输出，文档预览用）
- `src/app/(main)/pets/page.tsx` + `src/app/(main)/pets/[id]/page.tsx` — 列表页与详情页

## 更新记录

- **2026-08-11 对话流加固（防空白回复）**：① 聊天 SSE 路由新增 10s 心跳注释行（`: ping`），工具执行等长静默期间保活，防代理/隧道空闲断连；② 前端兜底——流正常结束但没收到任何正文时显示「这次回复好像丢了，再问我一次吧～」提示，不再留下永久空白气泡（空白气泡会误导用户重复提问，而服务端实际已答完，宠物反而说"问过了"）。

- **2026-08-11 工作区文档预览**：详情页新增「文档」标签（仅主人）——左侧列出宠物工作区（`data/pets/<id>/workspace`）里的文本文件（递归、按修改时间倒序），右侧预览（.md 走新增的零依赖渲染器 `src/components/pet/Markdown.tsx`，其余文本原样展示）。新增 `GET /api/pets/[id]/files`（owner 或超管）：无参列文件（上限 200 条，跳过隐藏项与 node_modules），`?file=<相对路径>` 读内容（resolve 后必须落在工作区内防穿越，限 md/txt/json/csv/log/xml/html/yaml/toml、≤512KB）。

- **2026-08-11 清空对话历史**：对话标签页顶栏新增「清空对话」按钮（`confirm` 确认后不可恢复）；新增 `DELETE /api/pets/[id]/chat`（仅主人）——`clearChatSession` 置空 `pets.chat_session_id`（下次对话开新会话），`deletePiSessionFiles` 扫 `data/pi-agent/sessions/**` 按 `_<sessionId>.jsonl` 后缀删除 pi 侧会话历史文件（空目录顺手移除），前端同时清 localStorage `pet-chat-<id>`。
- **2026-08-11 移除三围玩法，表情随机轮播**：删除饱食/心情/精力的衰减、互动冷却、每日奖励与 feed/pet/play 接口（`/api/pet` 只剩 adopt/rename）；悬浮球/列表页/详情页不再展示三围条与互动按钮，表情改为前端每 8s 在五状态（idle/hungry/sleepy/eating/petted）间随机轮播；聊天人设注入去掉三围。`pets` 表旧三围列保留（NOT NULL 填 80）不做删列迁移。
- **2026-08-11 修复任务时间跑偏 8 小时**：workbench 容器原为 UTC，「8月13日下午4点」被按 UTC 落库（= 北京 08-14 00:00）；compose 给 workbench 加 `TZ=Asia/Shanghai`（仅 env 变更，`up -d` 重建即可），cron/一次性/间隔的时间口径从此与用户一致。**修复前建错的任务需删掉重建**（存量 run_at/next_run_at 是绝对时间戳，不自动纠正）。
- **2026-08-11 定时任务微信推送**：新增 `src/lib/pet-notify.ts`（Server酱 Turbo API，`SERVERCHAN_SENDKEY` 环境变量，compose 透传，未配置静默跳过、失败只记日志）；任务完成/失败（含立即运行）在写回任务行后即推微信，与站内 notices 气泡并行互不干扰。
- **2026-08-07 定时任务：一次性 + 意图规则化 + 一句话直建**：① 新增第三种触发 `run_at` 一次性绝对时间（幂等 ALTER，执行后自动停用，列表显示「已完成」）；② 时间规律识别不再写死——意图规则抽到 `src/lib/pet-task-rule.ts`（`NL_TASK_RULE`），parse 路由每次自动注入让 PIAgent 判断一次性/日历周期/纯间隔；③ `tasks/parse` 改为直接建任务：模型同时提取 name+prompt+时间字段，服务端校验后 `createTask`，前端一句话输入框「创建任务」为主入口，不再展示 cron/间隔中间结果。
- **2026-08-07 定时任务增强 + 外观全量可改**：① 定时任务新增纯间隔模式（`pet_tasks.interval_minutes`，幂等 ALTER 补列；`normalizeSchedule`/`nextRunFor` 统一校验与下次触发计算），创建表单支持「按间隔/按 cron」；② 新增 `POST /api/pets/[id]/tasks/parse`——自然语言时间经 PIAgent 单轮转 cron/间隔 JSON（新 sessionId 不污染对话），前端「智能转换」自动填表；③ stateMap 扩为五状态（新增 `PetDisplayState = PetExpression | "eating" | "petted"`），进食/被摸两张内置互动图也可替换；④ 外观「反复调整」——`appearance.prompts[文件名]` 记录累积生成描述，新增 `POST /api/pets/[id]/assets/adjust` 拼接意见重绘并覆盖原文件（RightAPI 无 edits 接口的既定方案）；`pet-image-gen.ts` 重构出 `generateImageToFile`/`adjustExpressionImage`。
- **2026-08-07 宠物定时任务上线**：新增 `pet_tasks` 表与 `src/lib/pet-tasks.ts`（零依赖 cron 五段解析、30s 进程内调度器、懒启动单例）；任务以宠物人设 + 主人预设 + 宠物工作区执行（与对话同一 `chat_session_id`）；新增占用锁 `src/lib/pet-busy.ts`（任务给聊天让道）；结果回流——任务行记录 last_status/last_result，`/api/pet` GET 附 `notices` 一次性汇报（悬浮球气泡展示）；详情页新增「定时任务」标签；新增路由 `/api/pets/[id]/tasks`、`/api/pets/[id]/tasks/[taskId]`、`/api/pets/[id]/tasks/[taskId]/run`。已重新部署（docker compose build + up -d）。
