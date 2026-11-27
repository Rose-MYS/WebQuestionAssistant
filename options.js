const form = document.getElementById("settings-form");
const endpointInput = document.getElementById("endpoint");
const modelInput = document.getElementById("model");
const apiKeyInput = document.getElementById("api-key");
const statusElement = document.getElementById("settings-status");

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function validateEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("API 地址不是有效的 URL。");
  }
  const isLocalHttp = url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if ((url.protocol !== "https:" && !isLocalHttp) || url.username || url.password) {
    throw new Error("API 地址必须使用 HTTPS（本机 localhost 可使用 HTTP），且不能包含账号密码。");
  }
}

async function initialize() {
  const saved = await chrome.storage.local.get(["endpoint", "model", "apiKey"]);
  endpointInput.value = saved.endpoint || "https://api.deepseek.com/chat/completions";
  modelInput.value = saved.model || "";
  apiKeyInput.placeholder = saved.apiKey
    ? "已保存 API Key（留空则保持不变）"
    : "输入 API Key";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const endpoint = endpointInput.value.trim();
  const model = modelInput.value.trim();
  if (!endpoint || !model) {
    setStatus("请填写 API 地址和模型名称。", true);
    return;
  }
  try {
    validateEndpoint(endpoint);
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  const values = { endpoint, model };
  if (apiKeyInput.value.trim()) {
    values.apiKey = apiKeyInput.value.trim();
  }

  try {
    await chrome.storage.local.set(values);
    apiKeyInput.value = "";
    if (values.apiKey) {
      apiKeyInput.placeholder = "已保存 API Key（留空则保持不变）";
    }
    setStatus("设置已保存。");
  } catch {
    setStatus("保存失败，请检查浏览器扩展存储是否可用。", true);
  }
});

document.getElementById("clear-key").addEventListener("click", async () => {
  try {
    await chrome.storage.local.remove("apiKey");
    apiKeyInput.value = "";
    apiKeyInput.placeholder = "输入 API Key";
    setStatus("已清除保存的 API Key。");
  } catch {
    setStatus("清除失败，请稍后重试。", true);
  }
});

initialize().catch(() => setStatus("读取设置失败，请重新加载此页面。", true));
