/**
 * 内容脚本：在本机 AI 工具页（Kimi Web UI 58627 / PIAgent 本机版 39273）右下角注入用量面板。
 * 数据由 background 代理从 AI 工作台 /api/usage/summary 拉取；收起状态持久化。
 */
(function () {
  if (window.__workbenchUsagePanel) return;
  window.__workbenchUsagePanel = true;

  const REFRESH_INTERVAL_MS = 5 * 60_000;
  const COLLAPSED_KEY = "usagePanelCollapsed";

  const css = `
    .wup-fab {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.12);
      background: #26272c; color: #d7d8dc; font: 12px/1.6 system-ui, sans-serif;
      cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.35); user-select: none;
    }
    .wup-fab:hover { background: #303136; }
    .wup-card {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      width: 320px; max-height: 70vh; overflow-y: auto;
      border-radius: 12px; border: 1px solid rgba(255,255,255,.1);
      background: #1e1f24; color: #e8e9eb; font: 12px/1.5 system-ui, sans-serif;
      box-shadow: 0 8px 32px rgba(0,0,0,.45);
    }
    .wup-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.08);
      position: sticky; top: 0; background: #1e1f24;
    }
    .wup-title { font-weight: 600; font-size: 13px; }
    .wup-btn { background: none; border: none; color: #9a9ba1; cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 6px; }
    .wup-btn:hover { color: #e8e9eb; background: rgba(255,255,255,.06); }
    .wup-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
    .wup-item { border: 1px solid rgba(255,255,255,.07); border-radius: 8px; padding: 8px 10px; background: rgba(255,255,255,.02); }
    .wup-name { font-weight: 600; font-size: 12px; }
    .wup-model { color: #9a9ba1; font-size: 11px; margin-left: 6px; }
    .wup-row { display: flex; justify-content: space-between; margin-top: 4px; color: #c9cad0; }
    .wup-muted { color: #8a8b91; }
    .wup-big { font-size: 16px; font-weight: 600; }
    .wup-bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,.08); margin-top: 4px; overflow: hidden; }
    .wup-fill { height: 100%; border-radius: 2px; background: #3b82f6; }
    .wup-fill.warn { background: #f59e0b; }
    .wup-fill.crit { background: #ef4444; }
    .wup-err { color: #f0a3a3; }
    .wup-foot { padding: 6px 12px; border-top: 1px solid rgba(255,255,255,.08); color: #8a8b91; display: flex; justify-content: space-between; }
  `;

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function fmtTokens(n) {
    n = Math.floor(Number(n) || 0);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  function cacheHit(b) {
    const total = (b.input || 0) + (b.cacheRead || 0) + (b.cacheWrite || 0);
    return total > 0 ? ((b.cacheRead / total) * 100).toFixed(1) + "%" : "—";
  }

  function renderItem(item) {
    const box = h("div", "wup-item");
    const head = h("div");
    head.append(h("span", "wup-name", item.name), h("span", "wup-model", item.model));
    box.append(head);

    const u = item.usage;
    if (u && u.kind === "balance") {
      const row = h("div", "wup-row");
      row.append(h("span", "wup-muted", "余额"), h("span", "wup-big", `${u.currency}${Number(u.total).toFixed(2)}`));
      box.append(row);
      const sub = h("div", "wup-row wup-muted");
      sub.append(h("span", null, `充值 ${u.currency}${Number(u.paid).toFixed(2)}`), h("span", null, `赠送 ${u.currency}${Number(u.granted).toFixed(2)}`));
      box.append(sub);
    } else if (u && u.kind === "plan") {
      for (const w of u.windows) {
        const pct = Math.max(0, Math.min(100, Number(w.percent) || 0));
        const row = h("div", "wup-row");
        row.append(h("span", "wup-muted", w.label), h("span", null, `已用 ${pct.toFixed(1)}%`));
        const bar = h("div", "wup-bar");
        const fill = h("div", "wup-fill" + (pct >= 95 ? " crit" : pct >= 80 ? " warn" : ""));
        fill.style.width = pct + "%";
        bar.append(fill);
        box.append(row, bar);
      }
    } else if (item.usageError) {
      box.append(h("div", "wup-row wup-muted", item.usageError));
    }

    if (item.tokens) {
      const t = item.tokens.h24;
      const row = h("div", "wup-row wup-muted");
      row.append(
        h("span", null, `24h 输入 ${fmtTokens(t.input)} · 输出 ${fmtTokens(t.output)}`),
        h("span", null, `命中 ${cacheHit(t)}`)
      );
      box.append(row);
    }
    return box;
  }

  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  let card = null;
  let fab = null;
  let timer = null;

  function setCollapsed(collapsed) {
    chrome.storage.local.set({ [COLLAPSED_KEY]: collapsed });
    if (collapsed) {
      card?.remove();
      card = null;
      clearInterval(timer);
      timer = null;
      if (!fab) {
        fab = h("div", "wup-fab", "用量");
        fab.addEventListener("click", () => setCollapsed(false));
        document.body.append(fab);
      }
    } else {
      fab?.remove();
      fab = null;
      openCard();
    }
  }

  async function fill(body, foot, force) {
    body.textContent = "";
    body.append(h("div", "wup-muted", "加载中…"));
    const res = await chrome.runtime.sendMessage({ type: "usage.fetch", force });
    body.textContent = "";
    if (!res?.ok) {
      const err = h("div", res?.needConfig ? "wup-muted" : "wup-err", res?.error ?? "查询失败");
      body.append(err);
      if (res?.needConfig) {
        const btn = h("button", "wup-btn", "打开设置");
        btn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "open.options" }));
        body.append(btn);
      }
      return;
    }
    if (!res.items.length) {
      body.append(h("div", "wup-muted", "工作台还没有模型预设"));
    }
    for (const item of res.items) body.append(renderItem(item));
    foot.textContent = res.serverTime ? `更新于 ${new Date(res.serverTime).toLocaleTimeString()}` : "";
  }

  function openCard() {
    card = h("div", "wup-card");
    const head = h("div", "wup-head");
    head.append(h("span", "wup-title", "AI 工作台用量"));
    const actions = h("div");
    const refreshBtn = h("button", "wup-btn", "刷新");
    const collapseBtn = h("button", "wup-btn", "收起");
    const settingBtn = h("button", "wup-btn", "设置");
    actions.append(refreshBtn, settingBtn, collapseBtn);
    head.append(actions);
    const body = h("div", "wup-body");
    const foot = h("div", "wup-foot");
    card.append(head, body, foot);
    document.body.append(card);

    refreshBtn.addEventListener("click", () => fill(body, foot, true));
    collapseBtn.addEventListener("click", () => setCollapsed(true));
    settingBtn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "open.options" }));

    fill(body, foot, false);
    timer = setInterval(() => fill(body, foot, false), REFRESH_INTERVAL_MS);
  }

  chrome.storage.local.get(COLLAPSED_KEY).then((s) => setCollapsed(s[COLLAPSED_KEY] === true));
})();
