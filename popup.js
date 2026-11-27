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

captureButton.addEventListener("click", async () => {
  if (captureInProgress) {
    return;
  }
  captureInProgress = true;
  updateButtons();
  setStatus("正在滚动采集并拼接整页截图…");

  try {
    const saved = await chrome.storage.local.get([
      "defaultWorkflowMode",
      "autoDownloadInLocal",
      "exportFormats"
    ]);
    const workflowMode = saved.defaultWorkflowMode === "local" ? "local" : "ai";
    const autoDownloadInLocal = Boolean(saved.autoDownloadInLocal);
    const rawFormats = Array.isArray(saved.exportFormats) ? saved.exportFormats : ["png"];
    const exportFormats = rawFormats.filter((f) => f === "png" || f === "pdf");
    if (exportFormats.length === 0) {
      exportFormats.push("png");
    }

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

    if (workflowMode === "local" &&
        autoDownloadInLocal &&
        typeof QuestionExporter !== "undefined" &&
        typeof result.dataUrl === "string" &&
        Array.isArray(result.localDetections) &&
        result.localDetections.length > 0) {
      setStatus(`已自动框选 ${result.localDetections.length} 道题，正在打包下载…`);
      const crops = await cropDetectionsLocally(
        result.dataUrl,
        result.width,
        result.height,
        result.localDetections
      );
      if (crops.length > 0) {
        const exported = [];
        if (exportFormats.includes("png")) {
          await QuestionExporter.exportMergedPng(crops);
          exported.push("PNG");
        }
        if (exportFormats.includes("pdf")) {
          const pdfInfo = await QuestionExporter.exportA4Pdf(crops);
          exported.push(`PDF(${pdfInfo.pages}页)`);
        }
        setStatus(`已自动裁切 ${crops.length} 道题并下载：${exported.join(" + ")}。`);
        return;
      }
    }

    const resultUrl = chrome.runtime.getURL("results.html") +
      `?id=${encodeURIComponent(result.resultId)}` +
      (workflowMode === "local" ? "&mode=local" : "");
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
