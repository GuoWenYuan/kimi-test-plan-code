// Pi agent 独立服务：零依赖 HTTP 服务，把 pi CLI（--mode json）包装成 SSE 接口。
// 仅监听 compose 内网（不发布端口到宿主机）；若设了 PI_SERVICE_TOKEN 则强制校验 x-pi-token 头。
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const PORT = Number(process.env.PORT || 39273);
const TOKEN = process.env.PI_SERVICE_TOKEN || "";
const PI_BIN = path.join(process.cwd(), "node_modules", ".bin", "pi");
const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(process.cwd(), "data", "pi-agent");
const RUN_TIMEOUT_MS = 5 * 60 * 1000;

/** Kimi Code 端点是 Anthropic 兼容协议，其余按 OpenAI 兼容处理 */
function apiFor(baseUrl) {
  return String(baseUrl).includes("api.kimi.com/coding") ? "anthropic-messages" : "openai-completions";
}

/** 把模型预设写成 pi 的自定义 provider（pi 只认已注册 provider，CLI 无法直接传 baseUrl） */
function writeModelsJson(preset) {
  fs.mkdirSync(AGENT_DIR, { recursive: true });
  const modelsJson = {
    providers: {
      workbench: {
        baseUrl: preset.baseUrl,
        api: apiFor(preset.baseUrl),
        apiKey: preset.apiKey,
        models: [{ id: preset.model }],
      },
    },
  };
  fs.writeFileSync(path.join(AGENT_DIR, "models.json"), JSON.stringify(modelsJson, null, 2));
}

function preview(v, max = 120) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function handlePiEvent(ev, send) {
  switch (ev.type) {
    case "message_update": {
      const sub = ev.assistantMessageEvent;
      if (sub?.type === "text_delta" && sub.delta) send({ type: "delta", text: sub.delta });
      else if (sub?.type === "thinking_delta" && sub.delta) send({ type: "think", text: sub.delta });
      break;
    }
    case "tool_execution_start":
      send({ type: "tool_start", tool: String(ev.toolName ?? "tool"), args: preview(ev.args) });
      break;
    case "tool_execution_end":
      send({ type: "tool_end", tool: String(ev.toolName ?? "tool"), isError: Boolean(ev.isError) });
      break;
    case "message_end": {
      // json 模式遇模型错误不改退出码，必须检查 stopReason
      const msg = ev.message;
      if (msg?.role === "assistant" && msg.stopReason === "error") {
        send({ type: "error", message: msg.errorMessage || "模型调用失败" });
      }
      break;
    }
    case "agent_end":
      send({ type: "done" });
      break;
  }
}

/**
 * 非交互执行一轮 pi 对话，stdout JSONL 转 SSE 事件。
 * 多轮连续性靠固定 cwd + --session-id（pi 按 cwd 分组存 session）。
 * 注意 stdin 必须 "ignore"——pi 启动时会读管道 stdin 直到 end，不关流会永久挂起。
 * 本服务只访问所在机器自身（server-only），不再有浏览器中转的本机桥模式。
 */
function runPi({ preset, sessionId, message }, res) {
  writeModelsJson(preset);
  const send = (e) => {
    try {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    } catch { /* 客户端已断开 */ }
  };

  const child = spawn(
    PI_BIN,
    [
      "--mode", "json",
      "--provider", "workbench",
      "--model", preset.model,
      "--session-id", sessionId,
      // 服务端运行：扩展/技能发现保持开启（agent 目录由我们独占控制，
      // 社区包经 pi install 装入 settings.json：mcp-adapter/web-access/plan-mode/goal/
      // subagents/hermes-memory/rpiv-todo）；仅禁用项目侧自动加载与网络启动项
      "--no-prompt-templates", "--no-themes",
      "--no-context-files", "--offline", "--no-approve",
      message,
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PI_CODING_AGENT_DIR: AGENT_DIR },
    }
  );

  let stderrTail = "";
  const kill = () => { if (!child.killed) child.kill("SIGTERM"); };
  const timer = setTimeout(() => {
    send({ type: "error", message: "执行超时（5 分钟），已终止" });
    kill();
  }, RUN_TIMEOUT_MS);
  res.on("close", () => { if (!res.writableFinished) kill(); });

  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf-8");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        handlePiEvent(JSON.parse(line), send);
      } catch { /* 忽略无法解析的行 */ }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk.toString("utf-8")).slice(-500);
  });
  child.on("error", (e) => {
    clearTimeout(timer);
    send({ type: "error", message: `无法启动 pi：${e.message}` });
    res.end();
  });
  child.on("close", () => {
    clearTimeout(timer);
    res.end();
  });
}

/** 读取 JSON 请求体（1MB 上限），失败返回 null */
function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    // 内置聊天网页（本机部署时直接用浏览器打开 / 被 /tools 页 iframe 嵌入）
    try {
      const html = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      json(res, 404, { error: "页面文件不存在" });
    }
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true, name: "pi-service" });
    return;
  }
  if (TOKEN && req.headers["x-pi-token"] !== TOKEN) {
    json(res, 401, { error: "未授权" });
    return;
  }
  if (req.method === "POST" && req.url === "/chat") {
    const parsed = await readBody(req);
    if (!parsed) {
      json(res, 400, { error: "请求体不是合法 JSON" });
      return;
    }
    const { message, sessionId, preset } = parsed;
    if (typeof message !== "string" || !message.trim()
      || typeof sessionId !== "string" || !/^[0-9a-fA-F-]{8,64}$/.test(sessionId)
      || !preset?.model || !preset?.baseUrl || !preset?.apiKey) {
      json(res, 400, { error: "message / sessionId / preset(model,baseUrl,apiKey) 均为必填" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    runPi({ preset, sessionId, message: message.trim() }, res);
    return;
  }
  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`pi-service listening on :${PORT} (agent dir: ${AGENT_DIR}, token: ${TOKEN ? "on" : "off"})`);
});
