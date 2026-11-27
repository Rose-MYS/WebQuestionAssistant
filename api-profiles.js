var ApiProfiles = (() => {
  const PROVIDER_PRESETS = [
    // 国内主流
    {
      id: "qwen",
      group: "国内主流",
      label: "通义千问 (阿里云 DashScope)",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      models: ["qwen-vl-max", "qwen-vl-plus", "qwen2.5-vl-72b-instruct", "qvq-max"]
    },
    {
      id: "zhipu",
      group: "国内主流",
      label: "智谱清言 (BigModel / GLM)",
      endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      models: ["glm-4.5v", "glm-4v-plus-0111", "glm-4v-flash"]
    },
    {
      id: "volcengine",
      group: "国内主流",
      label: "豆包 / 火山方舟 (Volcengine Ark)",
      endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      models: ["doubao-1-5-vision-pro-32k-250115", "doubao-seed-1-6-vision-250815"]
    },
    {
      id: "moonshot",
      group: "国内主流",
      label: "月之暗面 (Kimi / Moonshot)",
      endpoint: "https://api.moonshot.cn/v1/chat/completions",
      models: ["moonshot-v1-8k-vision-preview", "moonshot-v1-32k-vision-preview", "kimi-latest"]
    },
    {
      id: "stepfun",
      group: "国内主流",
      label: "阶跃星辰 (StepFun)",
      endpoint: "https://api.stepfun.com/v1/chat/completions",
      models: ["step-1o-turbo-vision", "step-1v-32k", "step-1v-8k"]
    },
    {
      id: "hunyuan",
      group: "国内主流",
      label: "腾讯混元 (Hunyuan)",
      endpoint: "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
      models: ["hunyuan-turbos-vision", "hunyuan-vision"]
    },
    {
      id: "qianfan",
      group: "国内主流",
      label: "百度千帆 (Qianfan)",
      endpoint: "https://qianfan.baidubce.com/v2/chat/completions",
      models: ["ernie-4.5-vl-28b-a3b", "qwen2.5-vl-72b-instruct"]
    },
    {
      id: "minimax",
      group: "国内主流",
      label: "MiniMax",
      endpoint: "https://api.minimax.chat/v1/chat/completions",
      models: ["MiniMax-Text-01"]
    },
    {
      id: "yi",
      group: "国内主流",
      label: "零一万物 (Yi)",
      endpoint: "https://api.lingyiwanwu.com/v1/chat/completions",
      models: ["yi-vision-v2", "yi-vision"]
    },
    {
      id: "internlm",
      group: "国内主流",
      label: "书生浦语 (InternLM)",
      endpoint: "https://internlm-chat.intern-ai.org.cn/puyu/api/v1/chat/completions",
      models: ["internvl2.5-latest"]
    },

    // 国际主流
    {
      id: "gemini",
      group: "国际主流",
      label: "Google Gemini (OpenAI 兼容)",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"]
    },
    {
      id: "openai",
      group: "国际主流",
      label: "OpenAI",
      endpoint: "https://api.openai.com/v1/chat/completions",
      models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"]
    },
    {
      id: "xai",
      group: "国际主流",
      label: "xAI (Grok)",
      endpoint: "https://api.x.ai/v1/chat/completions",
      models: ["grok-2-vision-latest", "grok-4-latest"]
    },
    {
      id: "mistral",
      group: "国际主流",
      label: "Mistral AI",
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      models: ["pixtral-large-latest", "pixtral-12b-2409", "mistral-medium-latest"]
    },
    {
      id: "groq",
      group: "国际主流",
      label: "Groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      models: [
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "meta-llama/llama-4-maverick-17b-128e-instruct"
      ]
    },
    {
      id: "together",
      group: "国际主流",
      label: "Together AI",
      endpoint: "https://api.together.xyz/v1/chat/completions",
      models: [
        "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        "Qwen/Qwen2.5-VL-72B-Instruct"
      ]
    },
    {
      id: "fireworks",
      group: "国际主流",
      label: "Fireworks AI",
      endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
      models: [
        "accounts/fireworks/models/llama4-maverick-instruct-basic",
        "accounts/fireworks/models/qwen2p5-vl-32b-instruct"
      ]
    },

    // 聚合与中转
    {
      id: "openrouter",
      group: "聚合与中转",
      label: "OpenRouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      models: [
        "google/gemini-2.5-flash",
        "google/gemini-2.5-pro",
        "openai/gpt-4o-mini",
        "anthropic/claude-sonnet-4",
        "qwen/qwen2.5-vl-72b-instruct"
      ]
    },
    {
      id: "siliconflow",
      group: "聚合与中转",
      label: "硅基流动 (SiliconFlow)",
      endpoint: "https://api.siliconflow.cn/v1/chat/completions",
      models: [
        "Qwen/Qwen2.5-VL-72B-Instruct",
        "Qwen/Qwen2.5-VL-32B-Instruct",
        "Pro/Qwen/Qwen2.5-VL-7B-Instruct",
        "deepseek-ai/deepseek-vl2"
      ]
    },
    {
      id: "modelscope",
      group: "聚合与中转",
      label: "ModelScope 魔搭社区",
      endpoint: "https://api-inference.modelscope.cn/v1/chat/completions",
      models: ["Qwen/Qwen2.5-VL-72B-Instruct", "Qwen/QVQ-72B-Preview"]
    },
    {
      id: "ppio",
      group: "聚合与中转",
      label: "PPIO 派欧云",
      endpoint: "https://api.ppinfra.com/v3/openai/chat/completions",
      models: ["qwen/qwen2.5-vl-72b-instruct"]
    },
    {
      id: "aihubmix",
      group: "聚合与中转",
      label: "AiHubMix",
      endpoint: "https://aihubmix.com/v1/chat/completions",
      models: ["gemini-2.5-flash", "gpt-4o", "claude-sonnet-4-20250514", "qwen-vl-max"]
    },
    {
      id: "oneapi",
      group: "聚合与中转",
      label: "One API / New API (自建中转)",
      endpoint: "",
      models: ["gpt-4o", "gemini-2.5-flash", "claude-sonnet-4-20250514", "qwen-vl-max"]
    },

    // 本地与自定义
    {
      id: "ollama",
      group: "本地与自定义",
      label: "本地 Ollama",
      endpoint: "http://localhost:11434/v1/chat/completions",
      models: ["qwen2.5vl:7b", "qwen2.5vl:32b", "llama3.2-vision", "gemma3:12b"]
    },
    {
      id: "lmstudio",
      group: "本地与自定义",
      label: "本地 LM Studio",
      endpoint: "http://localhost:1234/v1/chat/completions",
      models: ["qwen2.5-vl-7b-instruct", "llava-v1.6-mistral-7b"]
    },
    {
      id: "vllm",
      group: "本地与自定义",
      label: "本地 vLLM / SGLang",
      endpoint: "http://localhost:8000/v1/chat/completions",
      models: ["Qwen/Qwen2.5-VL-7B-Instruct"]
    },
    {
      id: "custom",
      group: "本地与自定义",
      label: "自定义 OpenAI 兼容服务",
      endpoint: "",
      models: []
    }
  ];

  function getPreset(providerId) {
    return PROVIDER_PRESETS.find((preset) => preset.id === providerId) ||
      PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
  }

  function normalizeAndValidateEndpoint(rawEndpoint) {
    const trimmed = String(rawEndpoint || "").trim();
    if (!trimmed) {
      throw new Error("请填写 API 地址。");
    }
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("API 地址不是有效的 URL。");
    }

    const isLocalHttp = url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
    if ((url.protocol !== "https:" && !isLocalHttp) || url.username || url.password) {
      throw new Error("API 地址必须使用 HTTPS（本机 localhost 可使用 HTTP），且不能包含账号密码。");
    }

    const cleanPath = url.pathname.replace(/\/+$/, "");
    if (!/\/(?:chat\/)?completions$/i.test(cleanPath) && !/\/responses$/i.test(cleanPath)) {
      url.pathname = `${cleanPath}/chat/completions`;
    }

    return {
      url,
      href: url.href,
      originPattern: `${url.origin}/*`
    };
  }

  function createId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `profile-${crypto.randomUUID()}`;
    }
    return `profile-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function sanitizeProfile(raw) {
    return {
      id: typeof raw?.id === "string" && raw.id ? raw.id : createId(),
      name: String(raw?.name || "未命名配置").trim().slice(0, 60) || "未命名配置",
      providerId: PROVIDER_PRESETS.some((p) => p.id === raw?.providerId) ? raw.providerId : "custom",
      endpoint: String(raw?.endpoint || "").trim(),
      model: String(raw?.model || "").trim(),
      apiKey: typeof raw?.apiKey === "string" ? raw.apiKey : ""
    };
  }

  async function loadState() {
    const saved = await chrome.storage.local.get([
      "apiProfiles",
      "activeProfileId",
      "defaultWorkflowMode",
      "endpoint",
      "model",
      "apiKey"
    ]);

    let profiles = Array.isArray(saved.apiProfiles)
      ? saved.apiProfiles.map(sanitizeProfile)
      : null;
    let activeProfileId = typeof saved.activeProfileId === "string" ? saved.activeProfileId : "";

    if (!profiles) {
      profiles = [];
      if (saved.endpoint || saved.model || saved.apiKey) {
        const migrated = sanitizeProfile({
          id: "profile-default",
          name: "默认配置",
          providerId: "custom",
          endpoint: saved.endpoint || "https://api.deepseek.com/chat/completions",
          model: saved.model || "",
          apiKey: saved.apiKey || ""
        });
        profiles.push(migrated);
        activeProfileId = migrated.id;
        await chrome.storage.local.set({
          apiProfiles: profiles,
          activeProfileId
        });
      }
    }

    if (profiles.length > 0 && !profiles.some((item) => item.id === activeProfileId)) {
      activeProfileId = profiles[0].id;
    }

    const activeProfile = profiles.find((item) => item.id === activeProfileId) || null;
    const defaultWorkflowMode = saved.defaultWorkflowMode === "ai" ? "ai" : "local";

    return {
      profiles,
      activeProfileId,
      activeProfile,
      defaultWorkflowMode
    };
  }

  async function getActiveProfile() {
    const state = await loadState();
    return state.activeProfile;
  }

  async function saveProfile(input, { activate = true } = {}) {
    const state = await loadState();
    const normalized = normalizeAndValidateEndpoint(input.endpoint);
    const model = String(input.model || "").trim();
    if (!model) {
      throw new Error("请填写视觉模型名称。");
    }

    const existing = input.id
      ? state.profiles.find((item) => item.id === input.id)
      : null;
    const preset = getPreset(input.providerId);
    const name = String(input.name || "").trim() || `${preset.label.split(" ")[0]} - ${model}`;
    const nextApiKey = typeof input.apiKey === "string" && input.apiKey.trim()
      ? input.apiKey.trim()
      : (existing?.apiKey || "");

    const nextProfile = sanitizeProfile({
      id: existing?.id || createId(),
      name,
      providerId: preset.id,
      endpoint: normalized.href,
      model,
      apiKey: nextApiKey
    });

    const nextProfiles = existing
      ? state.profiles.map((item) => (item.id === existing.id ? nextProfile : item))
      : [...state.profiles, nextProfile];
    const nextActiveId = activate || !state.activeProfileId
      ? nextProfile.id
      : state.activeProfileId;

    await chrome.storage.local.set({
      apiProfiles: nextProfiles,
      activeProfileId: nextActiveId
    });
    return {
      profile: nextProfile,
      profiles: nextProfiles,
      activeProfileId: nextActiveId
    };
  }

  async function setActiveProfile(profileId) {
    const state = await loadState();
    const target = state.profiles.find((item) => item.id === profileId);
    if (!target) {
      throw new Error("目标 API 配置不存在。");
    }
    await chrome.storage.local.set({ activeProfileId: target.id });
    return target;
  }

  async function deleteProfile(profileId) {
    const state = await loadState();
    const nextProfiles = state.profiles.filter((item) => item.id !== profileId);
    const nextActiveId = state.activeProfileId === profileId
      ? (nextProfiles[0]?.id || "")
      : state.activeProfileId;
    await chrome.storage.local.set({
      apiProfiles: nextProfiles,
      activeProfileId: nextActiveId
    });
    return { profiles: nextProfiles, activeProfileId: nextActiveId };
  }

  async function clearProfileKey(profileId) {
    const state = await loadState();
    const nextProfiles = state.profiles.map((item) => (
      item.id === profileId ? { ...item, apiKey: "" } : item
    ));
    await chrome.storage.local.set({ apiProfiles: nextProfiles });
    return nextProfiles;
  }

  async function setDefaultWorkflowMode(mode) {
    const normalized = mode === "ai" ? "ai" : "local";
    await chrome.storage.local.set({ defaultWorkflowMode: normalized });
    return normalized;
  }

  return {
    PROVIDER_PRESETS,
    getPreset,
    normalizeAndValidateEndpoint,
    loadState,
    getActiveProfile,
    saveProfile,
    setActiveProfile,
    deleteProfile,
    clearProfileKey,
    setDefaultWorkflowMode
  };
})();
