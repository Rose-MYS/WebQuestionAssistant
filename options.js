const form = document.getElementById("settings-form");
const endpointInput = document.getElementById("endpoint");
const modelInput = document.getElementById("model");
const apiKeyInput = document.getElementById("api-key");
const statusElement = document.getElementById("settings-status");

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

async function initialize() {
  const saved = await chrome.storage.local.get(["endpoint", "model"]);
  endpointInput.value = saved.endpoint || "https://api.deepseek.com/chat/completions";
  modelInput.value = saved.model || "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const endpoint = endpointInput.value.trim();
  const model = modelInput.value.trim();
  if (!endpoint || !model) {
    setStatus("请填写 API 地址和模型名称。", true);
    return;
  }

  const values = { endpoint, model };
  if (apiKeyInput.value.trim()) {
    values.apiKey = apiKeyInput.value.trim();
  }

  try {
    await chrome.storage.local.set(values);
    apiKeyInput.value = "";
    setStatus("设置已保存。");
  } catch {
    setStatus("保存失败，请检查浏览器扩展存储是否可用。", true);
  }
});

document.getElementById("clear-key").addEventListener("click", async () => {
  try {
    await chrome.storage.local.remove("apiKey");
    apiKeyInput.value = "";
    setStatus("已清除保存的 API Key。");
  } catch {
    setStatus("清除失败，请稍后重试。", true);
  }
});

initialize().catch(() => setStatus("读取设置失败，请重新加载此页面。", true));
