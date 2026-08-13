/**
 * 微信通知（Server酱 Turbo）：宠物定时任务完成/失败时推送到主人微信。
 * SendKey 走环境变量 SERVERCHAN_SENDKEY（.env，compose 透传），未配置则静默跳过；
 * 推送失败只记日志，绝不影响任务执行本身。
 */

/** 发送一条微信推送；未配置 SendKey 返回 false */
export async function sendWeChatNotify(title: string, desp: string): Promise<boolean> {
  const key = process.env.SERVERCHAN_SENDKEY ?? "";
  if (!key) return false;
  try {
    const res = await fetch(`https://sctapi.ftqq.com/${key}.send`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      // Server酱 title 上限 32 字符；desp 够长，这里截 2000 与任务结果上限一致
      body: new URLSearchParams({ title: title.slice(0, 32), desp: desp.slice(0, 2000) }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
    if (!res.ok || data?.code !== 0) {
      console.error("[pet-notify] Server酱推送失败:", res.status, JSON.stringify(data));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[pet-notify] Server酱推送异常:", e);
    return false;
  }
}

/** 任务执行完毕推微信（fire-and-forget） */
export function notifyTaskResult(petName: string, taskName: string, status: "ok" | "error", result: string): void {
  const title = `${petName}的任务「${taskName}」${status === "ok" ? "完成✅" : "失败❌"}`;
  void sendWeChatNotify(title, result || "（任务完成，没有文字回复）");
}
