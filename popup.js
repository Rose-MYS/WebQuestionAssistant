const instructionInput = document.getElementById("instruction");
const instructionGroup = document.getElementById("instruction-group");
const statusElement = document.getElementById("status");
const settingsButton = document.getElementById("open-settings");
const captureButton = document.getElementById("capture-page");
const cancelButton = document.getElementById("cancel-capture");
const submitButton = document.getElementById("submit");
const screenshotFigure = document.getElementById("screenshot-figure");
const screenshotPreview = document.getElementById("screenshot-preview");
const updateBanner = document.getElementById("update-banner");
const updateText = document.getElementById("update-text");
const updateDownloadButton = document.getElementById("update-download");
const updateDismissButton = document.getElementById("update-dismiss");
const activeProfileHint = document.getElementById("active-profile-hint");
const modeRadios = [...document.querySelectorAll('input[name="popup-mode"]')];
const UPDATE_REPO = "wrhllll/WebQuestionAssistant";
const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
let activeProfile = null;
let workflowMode = "local";
let pendingUpdate = null;
let screenshotDataUrl = "";
let screenshotId = "";
let captureInProgress = false;
let requestInProgress = false;
let cancelPending = false;

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function updateModeUi() {
  for (const radio of modeRadios) {
    radio.checked = radio.value === workflowMode;
    radio.disabled = captureInProgress || requestInProgress;
  }
  const isAi = workflowMode === "ai";
  instructionGroup.hidden = !isAi;
  submitButton.textContent = isAi
    ? "AI 视觉识别并切分"
    : "本地自动框选并导出（无需 API）";
  if (isAi) {
    activeProfileHint.hidden = false;
    activeProfileHint.textContent = activeProfile
      ? `当前 API：${activeProfile.name}（${activeProfile.model || "未填模型"}）`
      : "尚未配置 API，请先点击右上角“设置”。";
  } else {
    activeProfileHint.hidden = true;
  }
}

function updateButtons() {
  captureButton.disabled = captureInProgress || requestInProgress;
  settingsButton.disabled = captureInProgress || requestInProgress;
  cancelButton.hidden = !captureInProgress;
  cancelButton.disabled = !captureInProgress || cancelPending;
  submitButton.disabled = captureInProgress || requestInProgress || !screenshotDataUrl;
  updateModeUi();
}

async function loadSettings() {
  const state = await ApiProfiles.loadState();
  activeProfile = state.activeProfile;
  workflowMode = state.defaultWorkflowMode;
  updateModeUi();
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

for (const radio of modeRadios) {
  radio.addEventListener("change", async () => {
    if (!radio.checked) {
      return;
    }
    workflowMode = radio.value === "ai" ? "ai" : "local";
    updateModeUi();
    await ApiProfiles.setDefaultWorkflowMode(workflowMode).catch(() => {});
  });
}

submitButton.addEventListener("click", async () => {
  if (!screenshotDataUrl || !screenshotId) {
    setStatus("请先截取当前网页的整页长图。", true);
    return;
  }

  if (workflowMode === "local") {
    requestInProgress = true;
    updateButtons();
    setStatus("正在打开本地裁切与导出页面…");
    try {
      await ResultStore.update(screenshotId, {
        status: "captured",
        mode: "local",
        instruction: "",
        error: "",
        answer: ""
      });
      const resultUrl = chrome.runtime.getURL("results.html") +
        `?id=${encodeURIComponent(screenshotId)}&mode=local`;
      await chrome.tabs.create({ url: resultUrl, active: true });
      setStatus("已打开本地框选与导出页面（未发送任何外部请求）。");
    } catch (error) {
      setStatus(error?.message || "无法打开结果页，请重试。", true);
    } finally {
      requestInProgress = false;
      updateButtons();
    }
    return;
  }

  if (!activeProfile?.model?.trim()) {
    setStatus("请先在“设置”中配置并启用视觉 API 档案。", true);
    return;
  }
  if (!activeProfile?.apiKey) {
    setStatus("当前启用的 API 档案尚未填写 API Key，请先在“设置”中补充。", true);
    return;
  }

  let endpoint;
  try {
    endpoint = ApiProfiles.normalizeAndValidateEndpoint(activeProfile.endpoint);
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  requestInProgress = true;
  updateButtons();
  setStatus("正在打开结果页并准备识别…");

  try {
    const granted = await chrome.permissions.request({
      origins: [endpoint.originPattern]
    });
    if (!granted) {
      throw new Error("未授予 API 域名访问权限，无法发送请求。");
    }

    await ResultStore.update(screenshotId, {
      status: "captured",
      mode: "ai",
      instruction: instructionInput.value.trim(),
      error: "",
      answer: ""
    });
    const resultUrl = chrome.runtime.getURL("results.html") +
      `?id=${encodeURIComponent(screenshotId)}&mode=ai`;
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

function parseVersionParts(version) {
  return String(version || "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => {
      const match = /^\d+/.exec(part);
      return match ? Number(match[0]) : 0;
    });
}

function compareVersions(left, right) {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function isSafeGithubUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "github.com" || parsed.hostname.endsWith(".githubusercontent.com"));
  } catch {
    return false;
  }
}

function showUpdateBanner(info, currentVersion) {
  if (!info || !info.latestVersion || !isSafeGithubUrl(info.downloadUrl)) {
    updateBanner.hidden = true;
    return;
  }
  if (info.dismissedVersion === info.latestVersion ||
      compareVersions(info.latestVersion, currentVersion) <= 0) {
    updateBanner.hidden = true;
    return;
  }
  pendingUpdate = info;
  updateText.textContent = `发现新版本 v${info.latestVersion}（当前 v${currentVersion}）`;
  updateBanner.hidden = false;
}

async function checkForUpdates() {
  const currentVersion = chrome.runtime.getManifest()?.version || "0.0.0";
  const saved = await chrome.storage.local.get(["updateCheck"]);
  const cached = saved.updateCheck || {};
  showUpdateBanner(cached, currentVersion);

  if (cached.checkedAt && Date.now() - cached.checkedAt < UPDATE_CHECK_INTERVAL_MS) {
    return;
  }

  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { "Accept": "application/vnd.github+json" },
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
  } catch {
    return;
  }

  const nextCache = {
    ...cached,
    checkedAt: Date.now()
  };

  if (response.ok) {
    const release = await response.json().catch(() => null);
    const latestVersion = String(release?.tag_name || "").replace(/^v/i, "").trim();
    const zipAsset = Array.isArray(release?.assets)
      ? release.assets.find((asset) =>
          typeof asset?.name === "string" &&
          asset.name.toLowerCase().endsWith(".zip") &&
          isSafeGithubUrl(asset.browser_download_url)
        )
      : null;
    const downloadUrl = zipAsset?.browser_download_url ||
      (isSafeGithubUrl(release?.html_url) ? release.html_url : "");
    if (latestVersion && downloadUrl) {
      nextCache.latestVersion = latestVersion;
      nextCache.downloadUrl = downloadUrl;
    }
  }

  await chrome.storage.local.set({ updateCheck: nextCache }).catch(() => {});
  showUpdateBanner(nextCache, currentVersion);
}

updateDownloadButton.addEventListener("click", () => {
  if (pendingUpdate && isSafeGithubUrl(pendingUpdate.downloadUrl)) {
    chrome.tabs.create({ url: pendingUpdate.downloadUrl, active: true });
  }
});

updateDismissButton.addEventListener("click", async () => {
  updateBanner.hidden = true;
  if (!pendingUpdate?.latestVersion) {
    return;
  }
  const saved = await chrome.storage.local.get(["updateCheck"]);
  await chrome.storage.local.set({
    updateCheck: {
      ...(saved.updateCheck || {}),
      dismissedVersion: pendingUpdate.latestVersion
    }
  }).catch(() => {});
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "local") {
    loadSettings().catch(() => {});
  }
});

loadSettings().catch(() => setStatus("读取设置失败，请重新打开扩展。", true));
checkForUpdates().catch(() => {});
updateButtons();
