#!/usr/bin/env node
// RightAPI 生图 MCP server（零依赖，Node ≥ 18）
// 让本机的 Kimi Code CLI / Kimi Web 通过 MCP 协议调用 RightAPI 平台的生图模型
// （gpt-image-2 等，OpenAI Images API 兼容），图片保存到本地目录后返回文件路径。
// 传输：stdio（换行分隔的 JSON-RPC）；stdout 只走协议，日志一律写 stderr。
//
// 配置（环境变量，通常写在 ~/.kimi-code/mcp.json 的 env 里）：
//   RIGHTAPI_API_KEY   RightAPI 平台 API Key（必填，sk- 开头）
//   RIGHTAPI_BASE_URL  接口地址，默认 https://www.rightapi.ai/draw
//   RIGHTAPI_MODEL     默认生图模型，默认 gpt-image-2（可用 list_image_models 看全部）
//   IMAGE_MCP_SAVE_DIR 图片保存目录，默认 <运行目录>/generated-images
//
// mcp.json 示例：
//   { "mcpServers": { "rightapi-image": {
//       "command": "node",
//       "args": ["/path/to/image-mcp.mjs"],
//       "env": { "RIGHTAPI_API_KEY": "<你的 sk- key>" }
//   } } }

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = (process.env.RIGHTAPI_BASE_URL || "https://www.rightapi.ai/draw").replace(/\/+$/, "");
const API_KEY = process.env.RIGHTAPI_API_KEY || "";
const DEFAULT_MODEL = process.env.RIGHTAPI_MODEL || "gpt-image-2";
const SAVE_DIR = path.resolve(process.env.IMAGE_MCP_SAVE_DIR || "generated-images");

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "rightapi-image", version: "1.0.0" };
// 生图通常 30-60s，留足余量
const FETCH_TIMEOUT_MS = 180_000;

const TOOLS = [
  {
    name: "generate_image",
    description:
      "用 RightAPI 平台的生图模型按提示词生成图片，保存为本地 PNG 后返回文件绝对路径（默认模型 gpt-image-2，按次计费）",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "英文或中文绘图提示词，越具体越好" },
        size: {
          type: "string",
          enum: ["1024x1024", "1024x1536", "1536x1024"],
          description: "图片尺寸，默认 1024x1024",
        },
        n: { type: "number", description: "生成张数，默认 1，最大 4（每张单独计费）" },
        model: { type: "string", description: `生图模型，默认 ${DEFAULT_MODEL}（可用 list_image_models 查看可选模型）` },
      },
      required: ["prompt"],
    },
  },
  {
    name: "list_image_models",
    description: "列出 RightAPI 平台当前可用的生图模型及单价",
    inputSchema: { type: "object", properties: {} },
  },
];

function log(...args) {
  console.error("[image-mcp]", ...args);
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function textResult(text, isError) {
  const result = { content: [{ type: "text", text: String(text) }] };
  if (isError) result.isError = true;
  return result;
}

/** 调 RightAPI（OpenAI 兼容），返回解析后的 JSON；网络层失败抛异常 */
async function api(pathname, options = {}) {
  if (!API_KEY) {
    throw new Error("缺少 RIGHTAPI_API_KEY 环境变量（在 mcp.json 的 env 里配置 sk- key）");
  }
  const res = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", ...options.headers },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.error ?? JSON.stringify(data).slice(0, 300);
    throw new Error(`RightAPI 返回 ${res.status}：${msg}`);
  }
  return data;
}

async function callTool(name, args = {}) {
  if (name === "list_image_models") {
    const data = await api("/v1/models");
    const models = (data.data ?? []).filter((m) => m.enabled !== false);
    if (models.length === 0) return textResult("没有可用模型");
    return textResult(
      models
        .map((m) => `- ${m.id}${m.price_config?.request_price != null ? `（$${m.price_config.request_price}/次）` : ""}`)
        .join("\n")
    );
  }
  if (name === "generate_image") {
    const prompt = String(args.prompt ?? "").trim();
    if (!prompt) return textResult("prompt 为必填", true);
    const size = ["1024x1024", "1024x1536", "1536x1024"].includes(args.size) ? args.size : "1024x1024";
    const n = Math.max(1, Math.min(4, Number(args.n) || 1));
    const model = String(args.model ?? "").trim() || DEFAULT_MODEL;

    const data = await api("/v1/images/generations", {
      method: "POST",
      body: JSON.stringify({ model, prompt, size, n }),
    });
    const items = data.data ?? [];
    if (items.length === 0) return textResult("接口未返回图片", true);

    await mkdir(SAVE_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const saved = [];
    for (let i = 0; i < items.length; i++) {
      const file = path.join(SAVE_DIR, `${model}-${stamp}-${i + 1}.png`);
      if (items[i].b64_json) {
        await writeFile(file, Buffer.from(items[i].b64_json, "base64"));
      } else if (items[i].url) {
        const img = await fetch(items[i].url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!img.ok) throw new Error(`下载图片失败：${img.status}（${items[i].url}）`);
        await writeFile(file, Buffer.from(await img.arrayBuffer()));
      } else {
        continue;
      }
      saved.push(file);
    }
    if (saved.length === 0) return textResult("接口返回中既没有 b64_json 也没有 url", true);
    return textResult(
      `已生成 ${saved.length} 张图片（模型 ${model}，尺寸 ${size}）：\n` + saved.map((f) => `- ${f}`).join("\n")
    );
  }
  throw new Error(`未知工具：${name}`);
}

async function handle(msg) {
  const { id, method, params } = msg;
  // 通知（无 id）只需吞掉
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  try {
    if (method === "initialize") {
      reply(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
      return;
    }
    if (method === "ping") {
      reply(id, {});
      return;
    }
    if (method === "tools/list") {
      reply(id, { tools: TOOLS });
      return;
    }
    if (method === "tools/call") {
      try {
        reply(id, await callTool(params?.name, params?.arguments));
      } catch (e) {
        reply(id, textResult(e instanceof Error ? e.message : String(e), true));
      }
      return;
    }
    if (id === undefined) return; // 未知通知忽略
    replyError(id, -32601, `方法不存在：${method}`);
  } catch (e) {
    log("处理消息失败：", e);
    if (id !== undefined) replyError(id, -32603, "内部错误");
  }
}

const pending = new Set();

function track(msg) {
  const p = Promise.resolve(handle(msg)).finally(() => pending.delete(p));
  pending.add(p);
}

let buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      log("无法解析的输入行：", line.slice(0, 200));
      continue;
    }
    track(msg);
  }
});

process.stdin.on("end", async () => {
  // stdin 关闭前可能还有进行中的请求（生图较慢），等它们写完响应再退出
  while (pending.size > 0) await Promise.all([...pending]);
  process.exit(0);
});
log(`已启动，RightAPI ${BASE_URL}，默认模型 ${DEFAULT_MODEL}，保存目录 ${SAVE_DIR}${API_KEY ? "" : "（未配置 RIGHTAPI_API_KEY）"}`);
