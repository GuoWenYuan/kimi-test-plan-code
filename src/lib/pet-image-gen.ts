import fs from "node:fs";
import path from "node:path";
import { petAssetsDir } from "@/lib/pet-chat";

/**
 * 宠物外观 AI 生成（RightAPI gpt 生图，OpenAI Images API 兼容）。
 * 一致性规则（与 .kimi-code/skills/pet-appearance 一致）：
 * - 永远使用 RightAPI 的 gpt-image-2（RIGHTAPI_BASE_URL / RIGHTAPI_MODEL 可覆盖）
 * - 每条提示词都以固定角色描述 YOYO_CHARACTER 开头，保证同一角色
 * - background: "transparent" + 提示词双保险，输出透明底 PNG
 * 该平台不支持 /v1/images/edits，换表情/反复调整只能靠固定角色描述 + 累积提示词重绘
 * （每张图的累积描述存在 appearance.prompts[文件名]，调整时拼接沿用、覆盖写回原文件）。
 */

/** 固定角色描述——所有宠物表情生成的共同前缀，改动会破坏外观一致性 */
export const YOYO_CHARACTER =
  "A cute chibi mascot character named YOYO: a small cream-white faced baby with big round shiny black eyes, " +
  "pink blush cheeks, and a tiny 'w' shaped mouth, wearing a pale yellow bear-hooded onesie with round bear ears " +
  "on the hood and two drawstrings, and tiny brown shoes. Soft 3D clay figurine style (POP MART-like), " +
  "smooth rounded shapes, warm soft lighting, front view, full body";

const BASE_URL = (process.env.RIGHTAPI_BASE_URL || "https://www.rightapi.ai/draw").replace(/\/+$/, "");
const MODEL = process.env.RIGHTAPI_MODEL || "gpt-image-2";
// 生图通常 30-60s，留足余量
const FETCH_TIMEOUT_MS = 180_000;

/** 拼装表情生成提示词：固定角色 + 表情/动作描述 + 一致性约束 */
export function buildExpressionPrompt(expressionHint: string): string {
  const hint = expressionHint.trim() || "standing still with a gentle smile, relaxed";
  return (
    `${YOYO_CHARACTER}. The character is ${hint}. ` +
    "Same character, same outfit, same colors, same art style as described. " +
    "Isolated on a fully transparent background, no shadows on the ground, no text, no watermark."
  );
}

/** 调 RightAPI 按完整提示词生图并写到宠物 assets 目录下的指定文件名（存在则覆盖） */
async function generateImageToFile(petId: string, fullPrompt: string, fileName: string): Promise<void> {
  const apiKey = process.env.RIGHTAPI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("服务器未配置 RIGHTAPI_API_KEY（在 .env 里配置 RightAPI 的 sk- key 后重启）");
  }

  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: fullPrompt,
      size: "1024x1024",
      n: 1,
      background: "transparent",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: { b64_json?: string; url?: string }[];
    error?: { message?: string } | string;
  };
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : data.error?.message;
    throw new Error(`RightAPI 返回 ${res.status}：${msg ?? "生成失败"}`);
  }

  const item = data.data?.[0];
  let buf: Buffer | null = null;
  if (item?.b64_json) {
    buf = Buffer.from(item.b64_json, "base64");
  } else if (item?.url) {
    const img = await fetch(item.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!img.ok) throw new Error(`下载生成的图片失败（${img.status}）`);
    buf = Buffer.from(await img.arrayBuffer());
  }
  if (!buf) throw new Error("接口返回中既没有 b64_json 也没有 url");

  const dir = petAssetsDir(petId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buf);
}

/**
 * 调 RightAPI 生成一张表情图并保存到宠物 assets 目录，返回文件名。
 * 未配置 RIGHTAPI_API_KEY 或生成失败时抛错（路由转成 400/502）。
 */
export async function generateExpressionImage(petId: string, expressionName: string, hint: string): Promise<string> {
  const safeName = expressionName.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "expr";
  const fileName = `gen-${Date.now()}-${safeName}.png`;
  await generateImageToFile(petId, buildExpressionPrompt(hint), fileName);
  return fileName;
}

/**
 * 反复调整：按累积描述重绘并覆盖写回原文件名（expressions/stateMap 引用不变）。
 * fileName 必须是纯 basename（路由侧已校验）。
 */
export async function adjustExpressionImage(petId: string, fileName: string, accumulatedHint: string): Promise<void> {
  await generateImageToFile(petId, buildExpressionPrompt(accumulatedHint), fileName);
}
