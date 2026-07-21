/**
 * 各平台官方用量/余额页面映射（客户端安全，无敏感信息）。
 *
 * /models 页据此把模型预设对应到官方控制台用量页并 iframe 内嵌：
 * 官方页面信息比 API 更全（每日明细、分模型费用、趋势图等），
 * 登录态使用用户浏览器中的官方账号。
 *
 * 注意：官方页面普遍禁止跨源 iframe（X-Frame-Options / CSP frame-ancestors），
 * 内嵌需要用户在 Chrome 安装去除这类响应头的扩展（如 Ignore X-Frame Headers 一类），
 * 未安装时页面提供「新标签打开」兜底。
 */

export interface OfficialUsagePage {
  provider: string;
  url: string;
}

export function officialUsagePage(input: { baseUrl: string; apiKey: string }): OfficialUsagePage | null {
  const { baseUrl, apiKey } = input;
  if (/right\.codes/i.test(baseUrl)) {
    return { provider: "Right.codes", url: "https://www.right.codes/dashboard" };
  }
  if (/deepseek/i.test(baseUrl)) {
    return { provider: "DeepSeek 开放平台", url: "https://platform.deepseek.com/usage" };
  }
  if (apiKey.startsWith("sk-kimi-") || /api\.kimi\.com\/coding/i.test(baseUrl)) {
    return { provider: "Kimi Code 控制台", url: "https://www.kimi.com/code/console" };
  }
  if (/moonshot|api\.kimi\.com|platform\.kimi/i.test(baseUrl)) {
    return { provider: "Kimi 开放平台", url: "https://platform.kimi.com/" };
  }
  return null;
}
