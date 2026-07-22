import crypto from "node:crypto";

/**
 * 浏览器回调（client call）注册表：
 * 某些节点（如 Unity 工具）的调用目标在用户的浏览器本机（127.0.0.1），
 * 服务端无法直接访问。引擎执行到这类节点时，通过 SSE 下发 client_call 事件，
 * 浏览器执行后经 POST /api/workflows/client-result 回传结果，此处按 callId 撮合。
 *
 * 表挂在 globalThis 上，避免不同 Route 模块各自实例化导致撮合失败。
 */

export interface ClientCallPayload {
  /** 浏览器侧要请求的地址，如 http://127.0.0.1:39271 */
  url: string;
  /** 桥端命令名 */
  name: string;
  /** 已渲染模板后的参数字符串 */
  args: string;
  /** 桥端令牌（本机桥需要；Unity Bridge 无令牌不传） */
  token?: string;
}

interface Pending {
  resolve: (v: string) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

const pending: Map<string, Pending> = (() => {
  const g = globalThis as unknown as { __workflowClientCalls?: Map<string, Pending> };
  if (!g.__workflowClientCalls) g.__workflowClientCalls = new Map();
  return g.__workflowClientCalls;
})();

/** 注册一次浏览器调用，返回 callId 与等待结果的 Promise（超时自动拒绝） */
export function createClientCall(timeoutMs = 120_000): { callId: string; promise: Promise<string> } {
  const callId = crypto.randomUUID();
  const promise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(callId);
      reject(new Error("等待浏览器执行超时：请确认运行页面保持打开，且本机目标服务（如 Unity Bridge）已启动"));
    }, timeoutMs);
    pending.set(callId, { resolve, reject, timer });
  });
  return { callId, promise };
}

/** 浏览器回传结果：ok=true 用 result 解决，否则用 error 拒绝；callId 不存在返回 false */
export function settleClientCall(callId: string, ok: boolean, value: string): boolean {
  const p = pending.get(callId);
  if (!p) return false;
  clearTimeout(p.timer);
  pending.delete(callId);
  if (ok) p.resolve(value);
  else p.reject(new Error(value || "浏览器侧执行失败"));
  return true;
}
