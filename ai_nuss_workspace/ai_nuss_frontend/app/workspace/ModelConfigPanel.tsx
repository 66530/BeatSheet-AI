"use client";

import { useState, useEffect, useCallback } from "react";

interface ModelConfig {
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
}

const STORAGE_KEY = "ai_nuss_model_config";

const PROVIDERS: { label: string; value: string; placeholder_url: string; placeholder_model: string }[] = [
  { label: "DeepSeek", value: "deepseek", placeholder_url: "https://api.deepseek.com", placeholder_model: "deepseek-chat" },
  { label: "OpenAI", value: "openai", placeholder_url: "https://api.openai.com/v1", placeholder_model: "gpt-4o-mini" },
  { label: "OpenRouter", value: "openrouter", placeholder_url: "https://openrouter.ai/api/v1", placeholder_model: "openai/gpt-4o" },
  { label: "SiliconFlow", value: "siliconflow", placeholder_url: "https://api.siliconflow.cn/v1", placeholder_model: "Qwen/Qwen2.5-7B-Instruct" },
  { label: "Moonshot", value: "moonshot", placeholder_url: "https://api.moonshot.cn/v1", placeholder_model: "moonshot-v1-8k" },
  { label: "智谱 (Zhipu)", value: "zhipu", placeholder_url: "https://open.bigmodel.cn/api/paas/v4", placeholder_model: "glm-4-flash" },
  { label: "阿里百炼", value: "bailian", placeholder_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", placeholder_model: "qwen-max" },
  { label: "自定义", value: "custom", placeholder_url: "https://your-api.example.com/v1", placeholder_model: "your-model-name" },
];

function loadConfig(): ModelConfig {
  if (typeof window === "undefined") return { provider: "", base_url: "", model: "", api_key: "" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { provider: "", base_url: "", model: "", api_key: "" };
}

function saveConfig(config: ModelConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function hasModelConfig(): boolean {
  const c = loadConfig();
  return !!(c.provider && c.base_url && c.model && c.api_key);
}

export function getModelConfig(): ModelConfig {
  return loadConfig();
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ModelConfigPanel({ open, onClose }: Props) {
  const [config, setConfig] = useState<ModelConfig>(loadConfig);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (open) { setConfig(loadConfig()); setTestResult(null); setSaved(false); } }, [open]);

  const provider = PROVIDERS.find(p => p.value === config.provider);

  const update = useCallback((field: keyof ModelConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setTestResult(null);
    setSaved(false);
  }, []);

  const selectProvider = useCallback((value: string) => {
    const p = PROVIDERS.find(pr => pr.value === value);
    setConfig(prev => ({
      ...prev,
      provider: value,
      base_url: p ? p.placeholder_url : "",
      model: p ? p.placeholder_model : "",
    }));
    setTestResult(null);
    setSaved(false);
  }, []);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/model/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, error: "网络错误，请确认后端已启动" });
    } finally { setTesting(false); }
  }, [config]);

  const handleSave = useCallback(() => {
    saveConfig(config);
    setSaved(true);
    setTimeout(onClose, 600);
  }, [config, onClose]);

  const isComplete = config.provider && config.base_url && config.model && config.api_key;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg mx-4 console-panel p-6 space-y-4 animate-slide-up z-10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">模型配置</h3>
          <div className="flex items-center gap-2">
            {saved && <span className="text-[10px] text-green-400">已保存 ✓</span>}
            <button onClick={onClose} className="text-[--nuss-muted] hover:text-[--nuss-text] text-lg leading-none">&times;</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-[10px] text-[--nuss-muted] mb-1 block">模型平台</label>
            <select value={config.provider} onChange={e => selectProvider(e.target.value)}
              className="w-full bg-[--nuss-surface] border border-[--nuss-border] rounded px-2 py-1.5 text-[--nuss-text] text-[11px]">
              <option value="">选择平台...</option>
              {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[--nuss-muted] mb-1 block">Model Name</label>
            <input type="text" value={config.model} onChange={e => update("model", e.target.value)}
              placeholder={provider?.placeholder_model || "gpt-4o-mini"}
              className="w-full bg-[--nuss-surface] border border-[--nuss-border] rounded px-2 py-1.5 text-[--nuss-text] text-[11px] font-mono" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-[--nuss-muted] mb-1 block">Base URL</label>
            <input type="text" value={config.base_url} onChange={e => update("base_url", e.target.value)}
              placeholder={provider?.placeholder_url || "https://api.openai.com/v1"}
              className="w-full bg-[--nuss-surface] border border-[--nuss-border] rounded px-2 py-1.5 text-[--nuss-text] text-[11px] font-mono" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-[--nuss-muted] mb-1 block">API Key</label>
            <div className="flex gap-1">
              <input type={showKey ? "text" : "password"} value={config.api_key} onChange={e => update("api_key", e.target.value)}
                placeholder="sk-..." className="flex-1 bg-[--nuss-surface] border border-[--nuss-border] rounded px-2 py-1.5 text-[--nuss-text] text-[11px] font-mono" />
              <button onClick={() => setShowKey(!showKey)} className="px-2 py-1.5 rounded border border-[--nuss-border] text-[10px] text-[--nuss-muted] hover:text-[--nuss-text]">
                {showKey ? "🙈" : "👁"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-[--nuss-border]/30">
          <button onClick={testConnection} disabled={!isComplete || testing}
            className="px-3 py-1.5 rounded text-[11px] font-medium border border-[--nuss-accent]/30 bg-[--nuss-accent]/10 text-[--nuss-accent] hover:bg-[--nuss-accent]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {testing ? "测试中..." : "🔗 测试连接"}
          </button>
          <button onClick={handleSave} disabled={!isComplete}
            className="px-4 py-1.5 rounded text-[11px] font-medium bg-[--nuss-accent] text-white hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            确定配置
          </button>
          {testResult && (
            <span className={`text-[10px] font-medium ${testResult.success ? "text-green-400" : "text-red-400"}`}>
              {testResult.success ? "✅ 连接成功" : `❌ ${testResult.error || "连接失败"}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
