const urlInput = document.getElementById("url");
const tokenInput = document.getElementById("token");
const status = document.getElementById("status");

chrome.storage.local.get(["workbenchUrl", "token"]).then((s) => {
  urlInput.value = s.workbenchUrl ?? "";
  tokenInput.value = s.token ?? "";
});

document.getElementById("save").addEventListener("click", async () => {
  const workbenchUrl = urlInput.value.trim().replace(/\/+$/, "");
  const token = tokenInput.value.trim();
  if (!workbenchUrl || !token) {
    status.style.color = "#b33939";
    status.textContent = "两项都要填写";
    return;
  }
  await chrome.storage.local.set({ workbenchUrl, token });
  status.style.color = "#2a7d2a";
  status.textContent = "已保存。回到本机 AI 工具页面，点右下角「用量」即可查看。";
});
