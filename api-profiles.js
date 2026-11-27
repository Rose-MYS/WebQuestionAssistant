var ApiProfiles = (() => {
  const PROVIDER_PRESETS = [
    {
      id: "gemini",
      label: "Google Gemini (OpenAI 兼容)",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"]
    },
    {
      id: "qwen",
      label: "通义千问 (阿里云 DashScope)",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      models: ["qwen-vl-max", "qwen-vl-plus", "qwen2.5-vl-72b-instruct"]
    },
    {
      id: "openai",
      label: "OpenAI",
      endpoint: "https://api.openai.com/v1/chat/completions",
      models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1-mini"]
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      models: [
        "google/gemini-2.5-flash",
        "openai/gpt-4o-mini",
        "qwen/qwen2.5-vl-72b-instruct"
      ]
    },
    {
      id: "siliconflow",
      label: "硅基流动 (SiliconFlow)",
      endpoint: "https://api.siliconflow.cn/v1/chat/completions",
      models: ["Qwen/Qwen2.5-VL-72B-Instruct", "Qwen/Qwen2.5-VL-32B-Instruct"]
    },
    {
      id: "ollama",
      label: "本地 Ollama",
      endpoint: "http://localhost:11434/v1/chat/completions",
      models: ["qwen2.5vl:7b", "llama3.2-vision"]
    },
    {
      id: "custom",
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
