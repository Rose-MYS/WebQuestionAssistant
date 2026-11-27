const instructionInput = document.getElementById("instruction");
const statusElement = document.getElementById("status");
const settingsButton = document.getElementById("open-settings");
const captureButton = document.getElementById("capture-page");
const cancelButton = document.getElementById("cancel-capture");
const submitButton = document.getElementById("submit");
const screenshotFigure = document.getElementById("screenshot-figure");
const screenshotPreview = document.getElementById("screenshot-preview");
let settings;
let screenshotDataUrl = "";
let screenshotId = "";
let captureInProgress = false;
let requestInProgress = false;
let cancelPending = false;

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function updateButtons() {
  captureButton.disabled = captureInProgress || requestInProgress;
  settingsButton.disabled = captureInProgress || requestInProgress;
  cancelButton.hidden = !captureInProgress;
  cancelButton.disabled = !captureInProgress || cancelPending;
  submitButton.disabled = captureInProgress || requestInProgress || !screenshotDataUrl;
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(["endpoint", "model", "apiKey"]);
  settings = {
    endpoint: saved.endpoint || "https://api.deepseek.com/chat/completions",
    model: saved.model || "",
    apiKey: saved.apiKey || ""
  };
}

captureButton.addEventListener("click", async () => {
  captureInProgress = true;
  cancelPending = false;
  screenshotDataUrl = "";
  screenshotId = "";
  screenshotPreview.removeAttribute("src");
  screenshotFigure.hidden = true;
  updateButtons();
  setStatus("正在滚动采集并拼接整页截图…");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number" || typeof tab.windowId !== "number") {
      throw new Error("无法取得当前标签页。");
    }
    if (cancelPending) {
      setStatus("长截图已取消。");
      return;
    }

    const result = await chrome.runtime.sendMessage({
      type: "CAPTURE_FULL_PAGE",
      tabId: tab.id,
      windowId: tab.windowId
    });
    if (!result?.ok) {
      if (result?.cancelled) {
        setStatus(result.error || "长截图已取消。", !result.restored);
      } else {
        setStatus(result?.error || "长截图失败。", true);
      }
      return;
    }
    if (cancelPending) {
      setStatus("长截图已取消，页面滚动位置已恢复。");
      return;
    }
    if (typeof result.resultId !== "string" ||
        typeof result.dataUrl !== "string" ||
        !result.dataUrl.startsWith("data:image/")) {
      throw new Error("长截图结果无效，请重新截取。");
    }

    screenshotDataUrl = result.dataUrl;
    screenshotId = result.resultId;
    screenshotPreview.src = result.dataUrl;
    screenshotFigure.hidden = false;
    captureButton.textContent = "重新截取整页";
    setStatus(`长截图完成（${result.width} × ${result.height}），页面滚动位置已恢复。`);
  } catch (error) {
    setStatus(error.message || "长截图失败。受限页面可能不支持滚动或截图。", true);
  } finally {
    captureInProgress = false;
    cancelPending = false;
    updateButtons();
  }
});

cancelButton.addEventListener("click", async () => {
  if (!captureInProgress || cancelPending) {
    return;
  }
  cancelPending = true;
  updateButtons();
  setStatus("正在取消并恢复页面滚动位置…");
  try {
    await chrome.runtime.sendMessage({ type: "CANCEL_FULL_PAGE_CAPTURE" });
  } catch {
    setStatus("无法连接截图任务；请等待任务结束后检查页面滚动位置。", true);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "FULL_PAGE_CAPTURE_PROGRESS" && captureInProgress) {
    setStatus(`正在采集整页：${message.done}/${message.total} 个视口…`);
  }
});

window.addEventListener("pagehide", () => {
  if (captureInProgress) {
    chrome.runtime.sendMessage({ type: "CANCEL_FULL_PAGE_CAPTURE" }).catch(() => {});
  }
});

function getEndpointPermission(endpoint) {
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
  return { url, originPattern: `${url.origin}/*` };
}

submitButton.addEventListener("click", async () => {
  if (!screenshotDataUrl || !screenshotId) {
    setStatus("请先截取当前网页的整页长图。", true);
    return;
  }
  if (!settings?.model.trim()) {
    setStatus("请先在“设置”中填写明确支持视觉输入的模型名称。", true);
    return;
  }
  if (!settings?.apiKey) {
    setStatus("请先在“设置”中填写 API Key。", true);
    return;
  }

  let endpoint;
  try {
    endpoint = getEndpointPermission(settings.endpoint);
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  requestInProgress = true;
  updateButtons();
  setStatus("正在打开结果页并准备解答…");

  try {
    const granted = await chrome.permissions.request({
      origins: [endpoint.originPattern]
    });
    if (!granted) {
      throw new Error("未授予 API 域名访问权限，无法发送请求。");
    }

    await ResultStore.update(screenshotId, {
      status: "captured",
      instruction: instructionInput.value.trim(),
      error: "",
      answer: ""
    });
    const resultUrl = chrome.runtime.getURL("results.html") +
      `?id=${encodeURIComponent(screenshotId)}`;
    await chrome.tabs.create({ url: resultUrl, active: true });
    setStatus("已打开结果标签页并开始识别切分；确认题目截图前不会发送解答请求。");
  } catch (error) {
    setStatus(error?.message || "无法打开结果页，请重试。", true);
  } finally {
    requestInProgress = false;
    updateButtons();
  }
});

document.getElementById("open-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "local") {
    loadSettings().catch(() => {});
  }
});

loadSettings().catch(() => setStatus("读取设置失败，请重新打开扩展。", true));
updateButtons();
