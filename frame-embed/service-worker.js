/**
 * AI 工作台控制台内嵌助手 —— service worker。
 * 点击扩展图标切换 ruleset 启用/停用，徽章显示 ON / OFF，状态存 chrome.storage。
 */

const RULESET_ID = "ruleset_1";
const STORAGE_KEY = "enabled";

async function syncState() {
  const { [STORAGE_KEY]: enabled = true } = await chrome.storage.local.get(STORAGE_KEY);
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enabledRulesetIds: enabled ? [RULESET_ID] : [],
    disabledRulesetIds: enabled ? [] : [RULESET_ID],
  });
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#16a34a" : "#9ca3af" });
}

chrome.runtime.onInstalled.addListener(syncState);
chrome.runtime.onStartup.addListener(syncState);

chrome.action.onClicked.addListener(async () => {
  const { [STORAGE_KEY]: enabled = true } = await chrome.storage.local.get(STORAGE_KEY);
  await chrome.storage.local.set({ [STORAGE_KEY]: !enabled });
  await syncState();
});
