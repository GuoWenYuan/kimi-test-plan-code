import type { ModelPreset } from "@/lib/models-store";

/** 下发给前端的简化事件（SSE data 行内容），与 pi-service 输出 schema 一致 */
export type PiChatEvent =
  | { type: "think"; text: string }
  | { type: "delta"; text: string }
  | { type: "tool_start"; tool: string; args: string }
  | { type: "tool_end"; tool: string; isError: boolean }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * 调用独立的 pi-service（Docker compose 内网服务，HTTP/SSE 包装 pi CLI），
 * 把它的 SSE 事件逐个转发给 send。本地开发时默认 http://127.0.0.1:39273，
 * 可用 PI_SERVICE_URL 覆盖；pi-service 设了 PI_SERVICE_TOKEN 时主应用需带同名 token。
 */
export async function runPiChat(opts: {
  preset: ModelPreset;
  sessionId: string;
  message: string;
  send: (e: PiChatEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { preset, sessionId, message, send, signal } = opts;
  const base = (process.env.PI_SERVICE_URL ?? "http://127.0.0.1:39273").replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.PI_SERVICE_TOKEN) headers["x-pi-token"] = process.env.PI_SERVICE_TOKEN;

  let res: Response;
  try {
    res = await fetch(`${base}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        sessionId,
        preset: { model: preset.model, baseUrl: preset.baseUrl, apiKey: preset.apiKey },
      }),
      signal,
    });
  } catch (e) {
    send({
      type: "error",
      message: `无法连接 pi-service（${base}）：${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    send({ type: "error", message: err?.error ?? `pi-service 响应异常（${res.status}）` });
    return;
  }

  // 逐行解析 pi-service 的 SSE 流并转发
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith("data:")) continue;
        try {
          send(JSON.parse(line.slice(5)) as PiChatEvent);
        } catch {
          /* 忽略无法解析的行 */
        }
      }
    }
  } catch {
    // 客户端断开（signal 触发 abort）等场景，静默结束
  }
}
