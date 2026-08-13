---
name: pet-appearance
description: 电子宠物（yoyo 酱）外观/表情素材生成规则——固定角色描述保证一致性，永远走 RightAPI gpt 生图，透明底 PNG
type: prompt
whenToUse: 需要为电子宠物生成、调整外观素材（表情、动画帧、形象图）时；或用户要求修改宠物形象、新增表情时
---

# 宠物外观生成规则（一致性契约）

本项目电子宠物是「yoyo 酱」：奶白色圆脸宝宝 + 淡黄色小熊连帽连体衣 + 棕色小鞋的 3D 软胶 Q 版形象。生成任何宠物素材时**必须**遵守本规则，否则前后生成的图不是同一只宠物。

## 规则

1. **生图通道**：永远调用 RightAPI 的 gpt 生图模型（OpenAI Images API 兼容，`{baseUrl}/v1/images/generations`，默认模型 `gpt-image-2`，`RIGHTAPI_BASE_URL`/`RIGHTAPI_MODEL` 可覆盖）。不要用其他平台或其他模型。
2. **固定角色描述**：每条提示词都必须以下面这段原文开头，一字不改（改动 = 破坏一致性）：

   > A cute chibi mascot character named YOYO: a small cream-white faced baby with big round shiny black eyes, pink blush cheeks, and a tiny 'w' shaped mouth, wearing a pale yellow bear-hooded onesie with round bear ears on the hood and two drawstrings, and tiny brown shoes. Soft 3D clay figurine style (POP MART-like), smooth rounded shapes, warm soft lighting, front view, full body

   然后接 `. The character is <表情/动作描述>. Same character, same outfit, same colors, same art style as described. Isolated on a fully transparent background, no shadows on the ground, no text, no watermark.`
3. **透明底**：API 参数 `background: "transparent"` 与提示词里的 transparent background 双保险；输出 PNG。
4. **该平台不支持 `/v1/images/edits`**（502），不要在原图上改，换表情 = 用固定角色描述整张重绘。
5. 尺寸固定 `1024x1024`，单张生成（`n: 1`）。

## 页面入口（推荐）

用户在 `/pets/[id]` 详情页「外观」标签可直接「AI 生成表情」：输入表情名 + 表情/动作描述即可，服务端路由 `POST /api/pets/[id]/assets/generate` 已实现上述全部规则（固定角色描述常量在 `src/lib/pet-image-gen.ts` 的 `YOYO_CHARACTER`，**两处必须保持完全一致**）。优先引导用户用页面功能，不要绕开它自己拼提示词。

## Agent 手动生成时（页面不适用的情况）

用 `tools/image-mcp.mjs`（RightAPI 生图 MCP）生成，提示词按上面第 2 条拼装。生成物保存到宠物资源目录 `data/pets/<id>/assets/`，并在宠物外观配置里登记为表情槽（`/pets/[id]` 外观标签或 `PATCH /api/pets/[id]` 的 appearance）。

## 环境

workbench 服务端需要 `RIGHTAPI_API_KEY`（sk- 开头，配在 `.env`；docker-compose 已透传）。缺 key 时接口会报「服务器未配置 RIGHTAPI_API_KEY」。
