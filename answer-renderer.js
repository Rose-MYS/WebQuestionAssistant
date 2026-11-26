var AnswerRenderer = (() => {
  const MATH_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
  const symbols = {
    alpha: ["α", "mi"], beta: ["β", "mi"], gamma: ["γ", "mi"], delta: ["δ", "mi"],
    epsilon: ["ε", "mi"], varepsilon: ["ϵ", "mi"], zeta: ["ζ", "mi"], eta: ["η", "mi"],
    theta: ["θ", "mi"], vartheta: ["ϑ", "mi"], iota: ["ι", "mi"], kappa: ["κ", "mi"],
    lambda: ["λ", "mi"], mu: ["μ", "mi"], nu: ["ν", "mi"], xi: ["ξ", "mi"],
    pi: ["π", "mi"], varpi: ["ϖ", "mi"], rho: ["ρ", "mi"], sigma: ["σ", "mi"],
    tau: ["τ", "mi"], upsilon: ["υ", "mi"], phi: ["φ", "mi"], varphi: ["ϕ", "mi"],
    chi: ["χ", "mi"], psi: ["ψ", "mi"], omega: ["ω", "mi"],
    Gamma: ["Γ", "mi"], Delta: ["Δ", "mi"], Theta: ["Θ", "mi"], Lambda: ["Λ", "mi"],
    Xi: ["Ξ", "mi"], Pi: ["Π", "mi"], Sigma: ["Σ", "mi"], Upsilon: ["Υ", "mi"],
    Phi: ["Φ", "mi"], Psi: ["Ψ", "mi"], Omega: ["Ω", "mi"],
    infty: ["∞", "mo"], partial: ["∂", "mi"], nabla: ["∇", "mi"], ell: ["ℓ", "mi"],
    hbar: ["ℏ", "mi"], Re: ["ℜ", "mi"], Im: ["ℑ", "mi"],
    times: ["×", "mo"], cdot: ["·", "mo"], pm: ["±", "mo"], mp: ["∓", "mo"],
    div: ["÷", "mo"], ast: ["∗", "mo"], star: ["⋆", "mo"], circ: ["∘", "mo"],
    le: ["≤", "mo"], leq: ["≤", "mo"], ge: ["≥", "mo"], geq: ["≥", "mo"],
    neq: ["≠", "mo"], ne: ["≠", "mo"], approx: ["≈", "mo"], equiv: ["≡", "mo"],
    sim: ["∼", "mo"], simeq: ["≃", "mo"], cong: ["≅", "mo"], propto: ["∝", "mo"],
    to: ["→", "mo"], rightarrow: ["→", "mo"], leftarrow: ["←", "mo"],
    leftrightarrow: ["↔", "mo"], Rightarrow: ["⇒", "mo"], Leftarrow: ["⇐", "mo"],
    mapsto: ["↦", "mo"], in: ["∈", "mo"], notin: ["∉", "mo"], ni: ["∋", "mo"],
    subset: ["⊂", "mo"], subseteq: ["⊆", "mo"], supset: ["⊃", "mo"],
    supseteq: ["⊇", "mo"], cup: ["∪", "mo"], cap: ["∩", "mo"],
    land: ["∧", "mo"], lor: ["∨", "mo"], neg: ["¬", "mo"],
    forall: ["∀", "mo"], exists: ["∃", "mo"], emptyset: ["∅", "mi"],
    sum: ["∑", "mo"], prod: ["∏", "mo"], int: ["∫", "mo"], iint: ["∬", "mo"],
    iiint: ["∭", "mo"], oint: ["∮", "mo"], sqrt: ["√", "mo"],
    ldots: ["…", "mo"], cdots: ["⋯", "mo"], vdots: ["⋮", "mo"],
    ddots: ["⋱", "mo"], degree: ["°", "mo"], prime: ["′", "mo"]
  };
  const namedFunctions = new Set([
    "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan",
    "sinh", "cosh", "tanh", "log", "ln", "exp", "lim", "max", "min", "sup",
    "inf", "det", "dim", "mod", "gcd"
  ]);
  const ignoredCommands = new Set([
    "displaystyle", "textstyle", "scriptstyle", "scriptscriptstyle", "limits",
    "nolimits", "left", "right", "big", "Big", "bigg", "Bigg"
  ]);
  const operatorCharacters = new Set([
    "+", "-", "=", "<", ">", "(", ")", "[", "]", "|", ",", ";", ":", "!", "%"
  ]);

  function element(tag, value) {
    const node = document.createElement(tag);
    if (value !== undefined) {
      node.textContent = value;
    }
    return node;
  }

  function mathElement(tag, value) {
    const node = document.createElementNS(MATH_NAMESPACE, tag);
    if (value !== undefined) {
      node.textContent = value;
    }
    return node;
  }

  function tokenize(expression) {
    const tokens = [];
    const pattern = /\s+|\\[a-zA-Z]+|\\.|(?:\d+(?:\.\d+)?)|[A-Za-z]+|[^\s]/gy;
    let match;
    while ((match = pattern.exec(expression)) !== null) {
      tokens.push(match[0]);
    }
    return tokens;
  }

  class LatexParser {
    constructor(expression) {
      this.tokens = tokenize(expression);
      this.index = 0;
    }

    peek() {
      return this.tokens[this.index];
    }

    take() {
      return this.tokens[this.index++];
    }

    parse() {
      return this.sequence(false);
    }

    sequence(stopAtBrace) {
      const row = mathElement("mrow");
      while (this.index < this.tokens.length) {
        if (/^\s+$/.test(this.peek())) {
          this.take();
          continue;
        }
        if (this.peek() === "}") {
          if (stopAtBrace) {
            this.take();
            break;
          }
          this.take();
          row.append(mathElement("mo", "}"));
          continue;
        }
        const token = this.peek();
        if (token === "^" || token === "_") {
          this.take();
          row.append(mathElement("mo", token));
          continue;
        }
        const base = this.atom();
        if (!base) {
          continue;
        }
        let subscript;
        let superscript;
        while (this.peek() === "^" || this.peek() === "_") {
          const marker = this.take();
          const argument = this.argument();
          if (marker === "^") {
            superscript = argument;
          } else {
            subscript = argument;
          }
        }
        if (subscript && superscript) {
          const combined = mathElement("msubsup");
          combined.append(base, subscript, superscript);
          row.append(combined);
        } else if (subscript) {
          const combined = mathElement("msub");
          combined.append(base, subscript);
          row.append(combined);
        } else if (superscript) {
          const combined = mathElement("msup");
          combined.append(base, superscript);
          row.append(combined);
        } else {
          row.append(base);
        }
      }
      return row;
    }

    argument() {
      while (/^\s+$/.test(this.peek() || "")) {
        this.take();
      }
      if (this.index >= this.tokens.length || this.peek() === "}") {
        return mathElement("mrow");
      }
      return this.atom();
    }

    rawGroup() {
      if (this.peek() !== "{") {
        return this.take() || "";
      }
      this.take();
      let depth = 1;
      const content = [];
      while (this.index < this.tokens.length && depth > 0) {
        const token = this.take();
        if (token === "{") {
          depth += 1;
        } else if (token === "}") {
          depth -= 1;
        }
        if (depth > 0) {
          content.push(token);
        }
      }
      return content.join("");
    }

    atom() {
      const token = this.take();
      if (token === undefined) {
        return null;
      }
      if (/^\s+$/.test(token)) {
        return mathElement("mspace", undefined);
      }
      if (token === "{") {
        return this.sequence(true);
      }
      if (/^\d/.test(token)) {
        return mathElement("mn", token);
      }
      if (/^[A-Za-z]+$/.test(token)) {
        return mathElement("mi", token);
      }
      if (token.startsWith("\\")) {
        return this.command(token.slice(1));
      }
      if (operatorCharacters.has(token)) {
        return mathElement("mo", token);
      }
      return mathElement("mtext", token);
    }

    command(name) {
      if (name === "boxed") {
        const boxed = mathElement("menclose");
        boxed.setAttribute("notation", "box");
        boxed.append(this.argument());
        return boxed;
      }
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const fraction = mathElement("mfrac");
        fraction.append(this.argument(), this.argument());
        return fraction;
      }
      if (name === "sqrt") {
        if (this.peek() === "[") {
          this.take();
          const index = this.sequenceUntil("]");
          const root = mathElement("mroot");
          root.append(this.argument(), index);
          return root;
        }
        const root = mathElement("msqrt");
        root.append(this.argument());
        return root;
      }
      if (name === "text" || name === "operatorname") {
        const text = this.rawGroup();
        const node = mathElement(name === "text" ? "mtext" : "mi", text);
        if (name === "operatorname") {
          node.setAttribute("mathvariant", "normal");
        }
        return node;
      }
      if (name === "mathrm" || name === "mathbf" || name === "mathit" ||
          name === "mathbb" || name === "mathcal" || name === "mathfrak") {
        const variants = {
          mathrm: "normal", mathbf: "bold", mathit: "italic",
          mathbb: "double-struck", mathcal: "script", mathfrak: "fraktur"
        };
        const node = this.argument();
        node.setAttribute("mathvariant", variants[name]);
        return node;
      }
      if (name === "overline" || name === "bar" || name === "hat" ||
          name === "widehat" || name === "vec" || name === "overrightarrow") {
        const accent = mathElement("mover");
        accent.setAttribute("accent", "true");
        const marks = {
          overline: "¯", bar: "¯", hat: "^", widehat: "^",
          vec: "→", overrightarrow: "→"
        };
        accent.append(this.argument(), mathElement("mo", marks[name]));
        return accent;
      }
      if (name === "underline") {
        const accent = mathElement("munder");
        accent.setAttribute("accentunder", "true");
        accent.append(this.argument(), mathElement("mo", "_"));
        return accent;
      }
      if (name === "quad" || name === "qquad" || name === "," ||
          name === ";" || name === ":" || name === "!") {
        const space = mathElement("mspace");
        const widths = { quad: "1em", qquad: "2em", ",": "0.167em", ";": "0.278em", ":": "0.222em", "!": "-0.167em" };
        space.setAttribute("width", widths[name]);
        return space;
      }
      if (name === "{" || name === "}" || name === "|" || name === "%" ||
          name === "#" || name === "&" || name === "$" || name === "_") {
        return mathElement("mo", name);
      }
      if (name === " ") {
        return mathElement("mspace", undefined);
      }
      if (ignoredCommands.has(name)) {
        return null;
      }
      if (Object.prototype.hasOwnProperty.call(symbols, name)) {
        return mathElement(symbols[name][1], symbols[name][0]);
      }
      if (namedFunctions.has(name)) {
        const functionName = mathElement("mi", name);
        functionName.setAttribute("mathvariant", "normal");
        return functionName;
      }
      return mathElement("mtext", `\\${name}`);
    }

    sequenceUntil(endToken) {
      const row = mathElement("mrow");
      while (this.index < this.tokens.length && this.peek() !== endToken) {
        const current = this.atom();
        if (current) {
          row.append(current);
        }
      }
      if (this.peek() === endToken) {
        this.take();
      }
      return row;
    }
  }

  function renderMath(container, expression, display) {
    const math = mathElement("math");
    math.setAttribute("display", display ? "block" : "inline");
    math.classList.add(display ? "math-block" : "math-inline");
    math.append(new LatexParser(expression).parse());
    container.append(math);
  }

  function findClosing(text, delimiter, start) {
    let index = start;
    while ((index = text.indexOf(delimiter, index)) !== -1) {
      let slashes = 0;
      for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
        slashes += 1;
      }
      if (slashes % 2 === 0) {
        return index;
      }
      index += delimiter.length;
    }
    return -1;
  }

  function renderInline(container, text) {
    const markerPattern = /\\\(|\\\[|\$\$|\$(?!\s)|`|\*\*|__|\*|_/g;
    let position = 0;
    let match;
    while ((match = markerPattern.exec(text)) !== null) {
      const marker = match[0];
      const start = match.index;
      if (start > position) {
        container.append(document.createTextNode(text.slice(position, start)));
      }

      const closing = marker === "\\(" ? "\\)" :
        marker === "\\[" ? "\\]" :
          marker === "$$" ? "$$" :
            marker === "$" ? "$" :
              marker === "`" ? "`" : marker;
      const contentStart = start + marker.length;
      const end = findClosing(text, closing, contentStart);
      if (end < 0 || end === contentStart) {
        container.append(document.createTextNode(marker));
        position = contentStart;
        markerPattern.lastIndex = position;
        continue;
      }

      const content = text.slice(contentStart, end);
      if (marker === "\\(" || marker === "\\[" || marker === "$$" || marker === "$") {
        renderMath(container, content, marker === "\\[" || marker === "$$");
      } else if (marker === "`") {
        container.append(element("code", content));
      } else {
        const emphasis = element(marker === "**" || marker === "__" ? "strong" : "em");
        renderInline(emphasis, content);
        container.append(emphasis);
      }
      position = end + closing.length;
      markerPattern.lastIndex = position;
    }
    if (position < text.length) {
      container.append(document.createTextNode(text.slice(position)));
    }
  }

  function isBlockStart(line) {
    return /^\s*(?:```|#{1,6}\s|>\s?|[-*+]\s|\d+\.\s|(?:\$\$|\\\[))/.test(line) ||
      /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line);
  }

  function renderMarkdown(target, markdown) {
    target.replaceChildren();
    const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fence = /^\s*```/.exec(line);
      if (fence) {
        index += 1;
        const code = [];
        while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
          code.push(lines[index++]);
        }
        if (index < lines.length) {
          index += 1;
        }
        const pre = element("pre");
        pre.append(element("code", code.join("\n")));
        target.append(pre);
        continue;
      }

      if (/^\s*\$\$\s*$/.test(line) || /^\s*\\\[\s*$/.test(line)) {
        const closingPattern = /^\s*\$\$\s*$/.test(line)
          ? /^\s*\$\$\s*$/
          : /^\s*\\\]\s*$/;
        index += 1;
        const formula = [];
        while (index < lines.length && !closingPattern.test(lines[index])) {
          formula.push(lines[index++]);
        }
        if (index < lines.length) {
          index += 1;
        }
        const block = element("div", undefined);
        block.className = "math-display";
        renderMath(block, formula.join("\n"), true);
        target.append(block);
        continue;
      }

      const singleLineMath = /^\s*\$\$(.+)\$\$\s*$/.exec(line);
      const singleLineBracketMath = /^\s*\\\[(.+)\\\]\s*$/.exec(line);
      if (singleLineMath || singleLineBracketMath) {
        const block = element("div", undefined);
        block.className = "math-display";
        renderMath(block, (singleLineMath || singleLineBracketMath)[1], true);
        target.append(block);
        index += 1;
        continue;
      }

      const heading = /^\s*(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        const headingNode = element(`h${heading[1].length}`);
        renderInline(headingNode, heading[2]);
        target.append(headingNode);
        index += 1;
        continue;
      }

      if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
        target.append(element("hr"));
        index += 1;
        continue;
      }

      const listItem = /^\s*([-*+]|\d+\.)\s+(.+)$/.exec(line);
      if (listItem) {
        const ordered = /^\d/.test(listItem[1]);
        const list = element(ordered ? "ol" : "ul");
        while (index < lines.length) {
          const item = /^\s*([-*+]|\d+\.)\s+(.+)$/.exec(lines[index]);
          if (!item || /^\d/.test(item[1]) !== ordered) {
            break;
          }
          const listNode = element("li");
          renderInline(listNode, item[2]);
          list.append(listNode);
          index += 1;
        }
        target.append(list);
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        const quote = element("blockquote");
        while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
          const paragraph = element("p");
          renderInline(paragraph, lines[index++].replace(/^\s*>\s?/, ""));
          quote.append(paragraph);
        }
        target.append(quote);
        continue;
      }

      const paragraphLines = [line.trim()];
      index += 1;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
        paragraphLines.push(lines[index++].trim());
      }
      const paragraph = element("p");
      renderInline(paragraph, paragraphLines.join(" "));
      target.append(paragraph);
    }
  }

  return { render: renderMarkdown };
})();
