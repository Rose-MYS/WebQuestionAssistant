var QuestionExporter = (() => {
  const A4_WIDTH_PT = 595.28;
  const A4_HEIGHT_PT = 841.89;
  const PDF_MARGIN_PT = 36;
  const PDF_GAP_PT = 14;
  const MAX_PNG_WIDTH = 2400;
  const MAX_PNG_HEIGHT = 28000;
  const MAX_PNG_PIXELS = 36000000;

  function timestampSuffix() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function loadImage(dataUrl) {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    return image;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("浏览器无法生成导出图像。"));
        }
      }, type, quality);
    });
  }

  function renderLabeledQuestionCanvas(image, labelText) {
    const paddingX = 16;
    const headerHeight = 34;
    const paddingBottom = 14;
    const width = Math.max(320, image.naturalWidth + paddingX * 2);
    const height = headerHeight + image.naturalHeight + paddingBottom;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("无法创建导出画布。");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#f6f8fa";
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = "#d8dee4";
    ctx.fillRect(0, headerHeight - 1, width, 1);

    ctx.fillStyle = "#24292f";
    ctx.font = '600 16px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, paddingX, Math.floor(headerHeight / 2));

    ctx.drawImage(image, paddingX, headerHeight + 4, image.naturalWidth, image.naturalHeight);
    return canvas;
  }

  function layoutPdfPages(items) {
    const printableWidth = A4_WIDTH_PT - PDF_MARGIN_PT * 2;
    const printableHeight = A4_HEIGHT_PT - PDF_MARGIN_PT * 2;
    const pages = [];
    let currentPage = { widthPt: A4_WIDTH_PT, heightPt: A4_HEIGHT_PT, items: [] };
    let cursorY = 0;

    for (const item of items) {
      // Scale naturally at ~96 DPI (0.75 pt/px) without upscaling small images,
      // while shrinking wide or overly tall blocks to fit within A4 printable bounds.
      let scale = Math.min(0.75, printableWidth / Math.max(1, item.imgWidth));
      let drawWidth = item.imgWidth * scale;
      let drawHeight = item.imgHeight * scale;
      if (drawHeight > printableHeight) {
        const heightScale = printableHeight / drawHeight;
        drawWidth *= heightScale;
        drawHeight *= heightScale;
      }

      if (currentPage.items.length > 0 && cursorY + drawHeight > printableHeight) {
        pages.push(currentPage);
        currentPage = { widthPt: A4_WIDTH_PT, heightPt: A4_HEIGHT_PT, items: [] };
        cursorY = 0;
      }

      const xPt = PDF_MARGIN_PT + Math.max(0, (printableWidth - drawWidth) / 2);
      const yPt = A4_HEIGHT_PT - PDF_MARGIN_PT - cursorY - drawHeight;
      currentPage.items.push({
        ...item,
        xPt,
        yPt,
        wPt: drawWidth,
        hPt: drawHeight
      });
      cursorY += drawHeight + PDF_GAP_PT;
    }

    if (currentPage.items.length > 0) {
      pages.push(currentPage);
    }
    return pages;
  }

  function buildPdfFromJpegPages(pages) {
    const encoder = new TextEncoder();
    const chunks = [];
    let byteOffset = 0;
    const offsets = [0]; // Object 0 is always free

    function pushBytes(bytes) {
      chunks.push(bytes);
      byteOffset += bytes.length;
    }

    function pushText(text) {
      pushBytes(encoder.encode(text));
    }

    pushText("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    // Pre-assign object numbers:
    // 1: Catalog, 2: Pages
    // For each page: [image objects...], content stream object, page object
    let nextObjNum = 3;
    const pageMeta = pages.map((page) => {
      const imageEntries = page.items.map((item, idx) => ({
        item,
        name: `Im${idx + 1}`,
        objNum: nextObjNum++
      }));
      const contentObjNum = nextObjNum++;
      const pageObjNum = nextObjNum++;
      return { page, imageEntries, contentObjNum, pageObjNum };
    });

    function writeObject(objNum, bodyWriter) {
      offsets[objNum] = byteOffset;
      pushText(`${objNum} 0 obj\n`);
      bodyWriter();
      pushText("\nendobj\n");
    }

    writeObject(1, () => {
      pushText("<< /Type /Catalog /Pages 2 0 R >>");
    });

    const kidsList = pageMeta.map((meta) => `${meta.pageObjNum} 0 R`).join(" ");
    writeObject(2, () => {
      pushText(`<< /Type /Pages /Count ${pageMeta.length} /Kids [ ${kidsList} ] >>`);
    });

    for (const meta of pageMeta) {
      for (const entry of meta.imageEntries) {
        const { item, objNum } = entry;
        writeObject(objNum, () => {
          pushText(
            `<< /Type /XObject /Subtype /Image /Width ${item.imgWidth} /Height ${item.imgHeight} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${item.jpegBytes.length} >>\nstream\n`
          );
          pushBytes(item.jpegBytes);
          pushText("\nendstream");
        });
      }

      const contentLines = meta.imageEntries.map(({ item, name }) =>
        `q ${item.wPt.toFixed(2)} 0 0 ${item.hPt.toFixed(2)} ${item.xPt.toFixed(2)} ${item.yPt.toFixed(2)} cm /${name} Do Q`
      );
      const contentBytes = encoder.encode(contentLines.join("\n"));
      writeObject(meta.contentObjNum, () => {
        pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
        pushBytes(contentBytes);
        pushText("\nendstream");
      });

      const xObjectDict = meta.imageEntries
        .map(({ name, objNum }) => `/${name} ${objNum} 0 R`)
        .join(" ");
      writeObject(meta.pageObjNum, () => {
        pushText(
          `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${meta.page.widthPt.toFixed(2)} ${meta.page.heightPt.toFixed(2)} ] ` +
          `/Resources << /XObject << ${xObjectDict} >> >> /Contents ${meta.contentObjNum} 0 R >>`
        );
      });
    }

    const xrefOffset = byteOffset;
    pushText(`xref\n0 ${nextObjNum}\n0000000000 65535 f \n`);
    for (let objNum = 1; objNum < nextObjNum; objNum += 1) {
      pushText(`${String(offsets[objNum]).padStart(10, "0")} 00000 n \n`);
    }
    pushText(
      `trailer\n<< /Size ${nextObjNum} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    );

    const total = new Uint8Array(byteOffset);
    let offset = 0;
    for (const chunk of chunks) {
      total.set(chunk, offset);
      offset += chunk.length;
    }
    return total;
  }

  async function exportMergedPng(questions, filenamePrefix = "questions") {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("请至少勾选一道题目后再导出。");
    }

    const loaded = [];
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const image = await loadImage(question.imageData);
      loaded.push({
        label: `第 ${question.number || index + 1} 题`,
        canvas: renderLabeledQuestionCanvas(image, `第 ${question.number || index + 1} 题`)
      });
    }

    const padding = 24;
    const gap = 20;
    const contentWidth = Math.min(
      MAX_PNG_WIDTH,
      Math.max(...loaded.map((item) => item.canvas.width))
    );
    const scaledHeights = loaded.map((item) => {
      const scale = Math.min(1, contentWidth / item.canvas.width);
      return {
        canvas: item.canvas,
        width: Math.round(item.canvas.width * scale),
        height: Math.round(item.canvas.height * scale)
      };
    });

    let totalWidth = contentWidth + padding * 2;
    let totalHeight = padding * 2 +
      scaledHeights.reduce((sum, item) => sum + item.height, 0) +
      gap * Math.max(0, scaledHeights.length - 1);

    let globalScale = 1;
    if (totalHeight > MAX_PNG_HEIGHT) {
      globalScale = Math.min(globalScale, MAX_PNG_HEIGHT / totalHeight);
    }
    if (totalWidth * totalHeight * globalScale * globalScale > MAX_PNG_PIXELS) {
      globalScale = Math.min(
        globalScale,
        Math.sqrt(MAX_PNG_PIXELS / (totalWidth * totalHeight))
      );
    }

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = Math.max(1, Math.round(totalWidth * globalScale));
    outputCanvas.height = Math.max(1, Math.round(totalHeight * globalScale));
    const ctx = outputCanvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("浏览器无法创建合并导出画布。");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

    let y = Math.round(padding * globalScale);
    for (const item of scaledHeights) {
      const drawW = Math.round(item.width * globalScale);
      const drawH = Math.round(item.height * globalScale);
      const x = Math.round((outputCanvas.width - drawW) / 2);
      ctx.drawImage(item.canvas, 0, 0, item.canvas.width, item.canvas.height, x, y, drawW, drawH);
      ctx.strokeStyle = "#d8dee4";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, drawW - 1), Math.max(1, drawH - 1));
      y += drawH + Math.round(gap * globalScale);
    }

    const blob = await canvasToBlob(outputCanvas, "image/png");
    const filename = `${filenamePrefix}-${timestampSuffix()}.png`;
    triggerDownload(blob, filename);
    return { filename, count: questions.length, bytes: blob.size };
  }

  async function exportA4Pdf(questions, filenamePrefix = "questions") {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("请至少勾选一道题目后再导出。");
    }

    const items = [];
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const image = await loadImage(question.imageData);
      const cardCanvas = renderLabeledQuestionCanvas(image, `第 ${question.number || index + 1} 题`);
      const jpegBlob = await canvasToBlob(cardCanvas, "image/jpeg", 0.92);
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
      items.push({
        jpegBytes,
        imgWidth: cardCanvas.width,
        imgHeight: cardCanvas.height
      });
    }

    const pages = layoutPdfPages(items);
    const pdfBytes = buildPdfFromJpegPages(pages);
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const filename = `${filenamePrefix}-${timestampSuffix()}.pdf`;
    triggerDownload(blob, filename);
    return { filename, count: questions.length, pages: pages.length, bytes: blob.size };
  }

  return {
    layoutPdfPages,
    buildPdfFromJpegPages,
    exportMergedPng,
    exportA4Pdf
  };
})();
