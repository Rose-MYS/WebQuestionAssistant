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
const previewBeforeOpenCheckbox = document.getElementById("preview-before-open");
const exportFormatGroup = document.getElementById("export-format-group");
const formatPngCheckbox = document.getElementById("format-png");
const formatPdfCheckbox = document.getElementById("format-pdf");
const modeRadios = [...document.querySelectorAll('input[name="popup-mode"]')];
const UPDATE_REPO = "wrhllll/WebQuestionAssistant";
const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
let activeProfile = null;
let workflowMode = "local";
let previewBeforeOpen = false;
let exportFormats = ["png"];
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

function getSelectedFormats() {
  const formats = [];
  if (formatPngCheckbox?.checked) {
    formats.push("png");
  }
  if (formatPdfCheckbox?.checked) {
    formats.push("pdf");
  }
  return formats;
}

function updateModeUi() {
  for (const radio of modeRadios) {
    radio.checked = radio.value === workflowMode;
    radio.disabled = captureInProgress || requestInProgress;
  }
  const isAi = workflowMode === "ai";
  if (exportFormatGroup) {
    exportFormatGroup.hidden = isAi;
  }
  if (formatPngCheckbox) {
    formatPngCheckbox.checked = exportFormats.includes("png");
    formatPngCheckbox.disabled = captureInProgress || requestInProgress;
  }
  if (formatPdfCheckbox) {
    formatPdfCheckbox.checked = exportFormats.includes("pdf");
    formatPdfCheckbox.disabled = captureInProgress || requestInProgress;
  }
  if (previewBeforeOpenCheckbox) {
    previewBeforeOpenCheckbox.checked = previewBeforeOpen;
    previewBeforeOpenCheckbox.disabled = captureInProgress || requestInProgress;
    const span = previewBeforeOpenCheckbox.nextElementSibling;
    if (span) {
      span.textContent = isAi
        ? "截完先在弹窗预览（不勾则直接打开 AI 识别页）"
        : "截完后进入预览与微调页（不勾则直接自动下载）";
    }
  }
  instructionGroup.hidden = !isAi;
  if (isAi) {
    captureButton.className = "primary-button";
    captureButton.textContent = previewBeforeOpen
      ? (screenshotDataUrl ? "重新截取整页" : "截取整页长图")
      : "一键截取并 AI 识别";
    submitButton.hidden = !(previewBeforeOpen && screenshotDataUrl);
    submitButton.className = "primary-button";
    submitButton.textContent = "开始 AI 视觉识别并切分";
  } else if (previewBeforeOpen) {
    captureButton.className = "primary-button";
    captureButton.textContent = "一键截取并进入微调页";
    submitButton.hidden = !screenshotDataUrl;
    submitButton.className = "secondary-button";
    submitButton.textContent = "打开微调与编辑页";
  } else {
    captureButton.className = "primary-button";
    const fmtLabel = exportFormats.length === 2
      ? "PNG + PDF"
      : (exportFormats[0] === "pdf" ? "PDF" : "PNG");
    captureButton.textContent = `一键截取并自动下载（${fmtLabel}）`;
    submitButton.hidden = !screenshotDataUrl;
    submitButton.className = "secondary-button";
    submitButton.textContent = "打开微调与编辑页";
  }
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
  const [state, extra] = await Promise.all([
    ApiProfiles.loadState(),
    chrome.storage.local.get(["previewBeforeOpen", "exportFormats"])
  ]);
  activeProfile = state.activeProfile;
  workflowMode = state.defaultWorkflowMode;
  previewBeforeOpen = Boolean(extra.previewBeforeOpen);
  if (Array.isArray(extra.exportFormats) && extra.exportFormats.length > 0) {
    exportFormats = extra.exportFormats.filter((f) => f === "png" || f === "pdf");
    if (exportFormats.length === 0) {
      exportFormats = ["png"];
    }
  }
  updateModeUi();
}

async function cropDetectionsLocally(dataUrl, width, height, detections) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const crops = [];
  const usedNumbers = new Set();
  for (let index = 0; index < detections.length; index += 1) {
    const region = detections[index];
    const targetRect = region.stemRect || region;
    const pad = 8;
    const x = Math.max(0, Math.min(width - 24, Math.round(targetRect.x - pad)));
    const y = Math.max(0, Math.min(height - 24, Math.round(targetRect.y - pad)));
    const right = Math.max(x + 24, Math.min(width, Math.round(targetRect.x + targetRect.width + pad)));
    const bottom = Math.max(y + 24, Math.min(height, Math.round(targetRect.y + targetRect.height + pad)));
    const cropWidth = right - x;
    const cropHeight = bottom - y;
    if (cropWidth < 24 || cropHeight < 24) {
      continue;
    }

    const canvas = document.createElement("canvas");
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      continue;
    }
    ctx.drawImage(image, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    let number = String(region.number || index + 1).trim().slice(0, 80);
    if (!number || usedNumbers.has(number.toLocaleLowerCase())) {
      number = String(crops.length + 1);
      while (usedNumbers.has(number.toLocaleLowerCase())) {
        number = String(Number(number) + 1);
      }
    }
    usedNumbers.add(number.toLocaleLowerCase());
    crops.push({
      id: `local-${index + 1}`,
      number,
      imageData: canvas.toDataURL("image/jpeg", 0.92),
      crop: { x, y, width: cropWidth, height: cropHeight },
      selected: true,
      status: "awaiting_confirmation",
      answer: "",
      error: ""
    });
  }
  return crops;
}

async function ensureAiReadyAndPermission() {
  if (!activeProfile?.model?.trim()) {
    throw new Error("请先在“设置”中配置并启用视觉 API 档案。");
  }
  if (!activeProfile?.apiKey) {
    throw new Error("当前启用的 API 档案尚未填写 API Key，请先在“设置”中补充。");
  }
  const endpoint = ApiProfiles.normalizeAndValidateEndpoint(activeProfile.endpoint);
  const granted = await chrome.permissions.request({
    origins: [endpoint.originPattern]
  });
  if (!granted) {
    throw new Error("未授予 API 域名访问权限，无法发送请求。");
  }
}

async function openResultsPage(id) {
  const mode = workflowMode === "ai" ? "ai" : "local";
  await ResultStore.update(id, {
    status: "captured",
    mode,
    instruction: mode === "ai" ? instructionInput.value.trim() : "",
    error: "",
    answer: ""
  });
  const resultUrl = chrome.runtime.getURL("results.html") +
    `?id=${encodeURIComponent(id)}&mode=${encodeURIComponent(mode)}`;
  await chrome.tabs.create({ url: resultUrl, active: true });
}

captureButton.addEventListener("click", async () => {
  if (workflowMode === "local" && !previewBeforeOpen) {
    const selectedFormats = getSelectedFormats();
    if (selectedFormats.length === 0) {
      setStatus("请至少勾选一种默认下载格式（合并 PNG 或 A4 PDF）。", true);
      return;
    }
  }
  if (!previewBeforeOpen && workflowMode === "ai") {
    try {
      await ensureAiReadyAndPermission();
    } catch (error) {
      setStatus(error?.message || "API 配置未就绪。", true);
      return;
    }
  }

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

    if (workflowMode === "local") {
      if (previewBeforeOpen) {
        setStatus("长截图完成，正在打开微调与编辑页…");
        await openResultsPage(screenshotId);
        setStatus("已打开本地框选与微调页（未调用任何 API）。");
        return;
      }

      const detections = Array.isArray(result.localDetections) ? result.localDetections : [];
      if (detections.length === 0) {
        setStatus("未自动检测到题目块，正在打开手动框选页…");
        await openResultsPage(screenshotId);
        return;
      }

      setStatus(`已自动框选 ${detections.length} 道题，正在打包下载…`);
      const crops = await cropDetectionsLocally(result.dataUrl, result.width, result.height, detections);
      if (crops.length === 0) {
        await openResultsPage(screenshotId);
        return;
      }

      const selectedFormats = getSelectedFormats();
      const exported = [];
      if (selectedFormats.includes("png")) {
        await QuestionExporter.exportMergedPng(crops);
        exported.push("PNG");
      }
      if (selectedFormats.includes("pdf")) {
        const pdfInfo = await QuestionExporter.exportA4Pdf(crops);
        exported.push(`PDF(${pdfInfo.pages}页)`);
      }
      setStatus(`已自动裁切 ${crops.length} 道题并下载：${exported.join(" + ")}。如需微调可点下方按钮。`);
      return;
    }

    if (!previewBeforeOpen) {
      setStatus("长截图完成，正在打开 AI 识别页…");
      await openResultsPage(screenshotId);
      setStatus("已打开结果页并开始 AI 识别切分。");
      return;
    }

    screenshotPreview.src = result.dataUrl;
    screenshotFigure.hidden = false;
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

for (const checkbox of [formatPngCheckbox, formatPdfCheckbox]) {
  if (!checkbox) {
    continue;
  }
  checkbox.addEventListener("change", async () => {
    const next = getSelectedFormats();
    if (next.length === 0) {
      checkbox.checked = true;
      setStatus("至少需要保留一种默认下载格式。", true);
      return;
    }
    exportFormats = next;
    updateModeUi();
    await chrome.storage.local.set({ exportFormats }).catch(() => {});
  });
}

if (previewBeforeOpenCheckbox) {
  previewBeforeOpenCheckbox.addEventListener("change", async () => {
    previewBeforeOpen = previewBeforeOpenCheckbox.checked;
    if (!previewBeforeOpen || workflowMode === "local") {
      screenshotFigure.hidden = true;
    } else if (screenshotDataUrl) {
      screenshotFigure.hidden = false;
    }
    updateModeUi();
    await chrome.storage.local.set({ previewBeforeOpen }).catch(() => {});
  });
}

submitButton.addEventListener("click", async () => {
  if (!screenshotDataUrl || !screenshotId) {
    setStatus("请先截取当前网页的整页长图。", true);
    return;
  }

  requestInProgress = true;
  updateButtons();
  setStatus(workflowMode === "ai" ? "正在打开结果页并准备识别…" : "正在打开本地裁切与导出页面…");

  try {
    if (workflowMode === "ai") {
      await ensureAiReadyAndPermission();
    }
    await openResultsPage(screenshotId);
    setStatus(workflowMode === "ai"
      ? "已打开结果标签页并开始识别切分；确认题目截图前不会发送解答请求。"
      : "已打开本地框选与导出页面（未发送任何外部请求）。");
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
