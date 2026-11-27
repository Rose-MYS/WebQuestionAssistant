const statusElement = document.getElementById("status");
const settingsButton = document.getElementById("open-settings");
const captureButton = document.getElementById("capture-page");
let captureInProgress = false;

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function updateButtons() {
  captureButton.disabled = captureInProgress;
  settingsButton.disabled = captureInProgress;
}

captureButton.addEventListener("click", async () => {
  if (captureInProgress) {
    return;
  }
  captureInProgress = true;
  updateButtons();
  setStatus("正在滚动采集并拼接整页截图…");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number" || typeof tab.windowId !== "number") {
      throw new Error("无法取得当前标签页。");
    }

    const result = await chrome.runtime.sendMessage({
      type: "CAPTURE_FULL_PAGE",
      tabId: tab.id,
      windowId: tab.windowId
    });
    if (!result?.ok) {
      throw new Error(result?.error || "长截图失败。");
    }
    if (typeof result.resultId !== "string") {
      throw new Error("长截图结果无效，请重新截取。");
    }

    const resultUrl = chrome.runtime.getURL("results.html") +
      `?id=${encodeURIComponent(result.resultId)}`;
    await chrome.tabs.create({ url: resultUrl, active: true });
  } catch (error) {
    setStatus(error?.message || "长截图失败。受限页面可能不支持滚动或截图。", true);
  } finally {
    captureInProgress = false;
    updateButtons();
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

settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

updateButtons();
