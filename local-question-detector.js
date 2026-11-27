function detectLocalQuestionRegions() {
  const MAX_LOCAL_QUESTIONS = 50;
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) {
    return { pageUrl: location.href, regions: [] };
  }
  const pageWidth = Math.max(root.scrollWidth, body.scrollWidth || 0, root.clientWidth);
  const pageHeight = Math.max(root.scrollHeight, body.scrollHeight || 0, root.clientHeight);
  const boilerplateSelector = 'header, nav, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]';
  const questionNumberPattern = /^(?:第\s*(\d+)\s*题|Question\s*(\d+)|Q\s*(\d+)|(\d+)\s*[.、)）]|（(\d+)）|\((\d+)\))/i;

  function isVisible(element) {
    if (!element || element.closest(boilerplateSelector)) {
      return false;
    }
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width >= 140 && rect.height >= 36;
  }

  function toDocRect(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(rect.left + window.scrollX)),
      y: Math.max(0, Math.round(rect.top + window.scrollY)),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  const answerAreaSelector = [
    ".edui-editor",
    ".edui-default",
    "[class*='ueditor']",
    "[class*='tinymce']",
    ".tox-tinymce",
    ".ql-container",
    ".ql-toolbar",
    ".w-e-text-container",
    ".w-e-toolbar",
    "[class*='answer-box']",
    "[class*='answerBox']",
    "[class*='answer_box']",
    "[class*='answer-area']",
    "[class*='answerArea']",
    "[class*='myAnswer']",
    "[class*='stuAnswer']",
    "[class*='reply-box']",
    "[class*='editor-box']",
    "[class*='rich-editor']",
    "[class*='upload']",
    "textarea",
    "iframe",
    "[contenteditable='true']"
  ].join(",");
  const answerLabelPattern = /^(?:我的答案|作答区|答题区|请输入答案|输入答案|答案)[:：]?$/;

  function computeStemRect(element, fullRect) {
    let cutoffY = fullRect.y + fullRect.height;
    const answerNodes = [...element.querySelectorAll(answerAreaSelector)];
    for (const node of answerNodes) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 20) {
        continue;
      }
      const topY = Math.round(rect.top + window.scrollY);
      if (topY > fullRect.y + 18 && topY < cutoffY) {
        cutoffY = topY;
      }
    }

    if (cutoffY < fullRect.y + fullRect.height) {
      // Also trim short "我的答案：" label immediately above the editor if present
      for (const node of element.querySelectorAll("div, p, span, label, h4, h5")) {
        const text = (node.innerText || "").trim();
        if (!text || text.length > 16 || !answerLabelPattern.test(text)) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        const topY = Math.round(rect.top + window.scrollY);
        if (topY > fullRect.y + 18 && topY < cutoffY && cutoffY - topY < 60) {
          cutoffY = topY;
        }
      }
      const trimmedHeight = Math.max(28, cutoffY - fullRect.y - 6);
      if (trimmedHeight < fullRect.height - 12) {
        return {
          x: fullRect.x,
          y: fullRect.y,
          width: fullRect.width,
          height: trimmedHeight
        };
      }
    }
    return { ...fullRect };
  }

  function extractNumber(element, fallback) {
    const text = (element.innerText || "").trim().slice(0, 40);
    const match = questionNumberPattern.exec(text);
    if (match) {
      const num = match.slice(1).find(Boolean);
      if (num) {
        return num;
      }
    }
    return String(fallback);
  }

  // Tier 1: Explicit semantic question containers
  const semanticSelector = [
    '[data-question-id]',
    '[data-question]',
    '[class*="question-item"]',
    '[class*="question-card"]',
    '[class*="questionItem"]',
    '[class*="question_item"]',
    '[class*="exam-item"]',
    '[class*="timu"]',
    '[class*="problem-item"]',
    '[class*="topic-item"]',
    '[class*="question"]'
  ].join(",");

  let candidates = [...document.querySelectorAll(semanticSelector)].filter((el) => {
    if (!isVisible(el)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.height > pageHeight * 0.85 && rect.width > pageWidth * 0.85) {
      return false;
    }
    return (el.innerText || "").trim().length >= 8;
  });

  // Remove wrapper containers that enclose >= 2 other matched question elements
  const candidateSet = new Set(candidates);
  candidates = candidates.filter((el) => {
    let nestedCount = 0;
    for (const other of candidateSet) {
      if (other !== el && el.contains(other)) {
        nestedCount += 1;
        if (nestedCount >= 2) {
          return false;
        }
      }
    }
    return true;
  });
  // Also drop inner fragments if a direct question container ancestor is already kept
  const keptSet = new Set(candidates);
  candidates = candidates.filter((el) => {
    let parent = el.parentElement;
    while (parent) {
      if (keptSet.has(parent)) {
        return false;
      }
      parent = parent.parentElement;
    }
    return true;
  });

  // Tier 2: Numbered block heuristic fallback
  if (candidates.length < 2) {
    const scope = document.querySelector("main, [role='main'], article") || body;
    const numberedLeaves = [...scope.querySelectorAll("div, section, article, li, p, h2, h3, h4")]
      .filter((el) => {
        if (!isVisible(el)) {
          return false;
        }
        const text = (el.innerText || "").trim();
        if (!text || !questionNumberPattern.test(text)) {
          return false;
        }
        // Prefer lowest block containing the question number
        for (const child of el.children) {
          const childText = (child.innerText || "").trim();
          if (childText && questionNumberPattern.test(childText)) {
            return false;
          }
        }
        return true;
      });

    const expanded = [];
    for (const leaf of numberedLeaves) {
      let box = leaf;
      for (let step = 0; step < 3 && box.parentElement && box.parentElement !== scope; step += 1) {
        const parent = box.parentElement;
        const parentRect = parent.getBoundingClientRect();
        if (parentRect.height > pageHeight * 0.55) {
          break;
        }
        const numberedInside = numberedLeaves.filter((other) => parent.contains(other)).length;
        if (numberedInside > 1) {
          break;
        }
        box = parent;
      }
      if (!expanded.includes(box)) {
        expanded.push(box);
      }
    }
    if (expanded.length > candidates.length) {
      candidates = expanded;
    }
  }

  const rawRegions = candidates
    .map((el, index) => {
      const fullRect = toDocRect(el);
      const stemRect = computeStemRect(el, fullRect);
      return {
        number: extractNumber(el, index + 1),
        ...stemRect,
        stemRect,
        fullRect
      };
    })
    .filter((r) => r.width >= 140 && r.height >= 28)
    .sort((a, b) => (Math.abs(a.y - b.y) > 20 ? a.y - b.y : a.x - b.x));

  // Deduplicate heavily overlapping rectangles
  const deduped = [];
  for (const region of rawRegions) {
    const overlapped = deduped.some((existing) => {
      const ix = Math.max(0, Math.min(existing.x + existing.width, region.x + region.width) - Math.max(existing.x, region.x));
      const iy = Math.max(0, Math.min(existing.y + existing.height, region.y + region.height) - Math.max(existing.y, region.y));
      const inter = ix * iy;
      const minArea = Math.min(existing.width * existing.height, region.width * region.height);
      return minArea > 0 && inter / minArea > 0.75;
    });
    if (!overlapped) {
      deduped.push(region);
    }
    if (deduped.length >= MAX_LOCAL_QUESTIONS) {
      break;
    }
  }

  return { pageUrl: location.href, regions: deduped };
}
