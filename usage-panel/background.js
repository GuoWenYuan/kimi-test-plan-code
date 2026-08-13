/**
 * 后台：代理 content script 拉取 workbench 用量汇总（避免页面上下文跨域/CORS 问题），
 * 30s 内存缓存。workbenchUrl 与令牌在选项页配置，存 chrome.storage.local（仅本机）。
 */

let cache = null; // { at, response }

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "usage.fetch") {
    fetchSummary(Boolean(msg.force)).then(sendResponse);
    return true;
  }
  if (msg?.type === "open.options") {
    chrome.runtime.openOptionsPage();
    return false;
  }
  return false;
});

async function fetchSummary(force) {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.response;
  const { workbenchUrl, token } = await chrome.storage.local.get(["workbenchUrl", "token"]);
  if (!workbenchUrl || !token) {
    return { ok: false, needConfig: true, error: "尚未配置工作台地址或令牌" };
  }
  const url = workbenchUrl.replace(/\/+$/, "") + "/api/usage/summary";
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${String(token).trim()}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) return { ok: false, error: "令牌无效或已过期（401），请在选项页重新填写" };
    if (!res.ok) return { ok: false, error: `工作台返回 HTTP ${res.status}` };
    const data = await res.json();
    const response = { ok: true, items: Array.isArray(data.items) ? data.items : [], serverTime: data.serverTime ?? null };
    cache = { at: Date.now(), response };
    return response;
  } catch (e) {
    return { ok: false, error: `无法连接工作台：${e?.message ?? e}` };
  }
}
