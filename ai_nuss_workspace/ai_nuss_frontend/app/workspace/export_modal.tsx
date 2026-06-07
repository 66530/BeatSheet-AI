"use client";

import { useState, useEffect } from "react";
import type { SceneUIModel } from "../api_client";
import { exportTXT, exportYAML, exportPDF, exportWord } from "./export_utils";

type ExportContent = "script_only" | "script_with_director";
type ExportFormat = "yaml" | "docx" | "pdf";

interface Props {
  open: boolean;
  onClose: () => void;
  scenes: SceneUIModel[];
  singleScene?: boolean;  // 单场导出模式
}

export default function ExportModal({ open, onClose, scenes, singleScene }: Props) {
  const [content, setContent] = useState<ExportContent>("script_only");
  const [format, setFormat] = useState<ExportFormat>("yaml");
  const [exporting, setExporting] = useState(false);

  // 重置状态
  useEffect(() => { if (open) { setContent("script_only"); setFormat("yaml"); setExporting(false); } }, [open]);

  if (!open) return null;

  const yamlDisabled = content === "script_with_director";

  const handleExport = async () => {
    setExporting(true);
    try {
      const isSingle = !!singleScene;
      if (content === "script_only") {
        if (format === "yaml") exportYAML(scenes);
        else if (format === "pdf") await exportPDF(scenes, false, isSingle);
        else if (format === "docx") await exportWord(scenes, false, isSingle);
      } else {
        if (format === "pdf") await exportPDF(scenes, true, isSingle);
        else if (format === "docx") await exportWord(scenes, true, isSingle);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in" onClick={onClose}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      {/* Modal */}
      <div
        className="relative w-full max-w-sm mx-4 console-panel p-6 space-y-5 animate-slide-up z-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{singleScene ? `导出第${scenes[0]?.scene_number || "?"}场` : "导出剧本"}</h3>
          <button onClick={onClose} className="text-[--nuss-muted] hover:text-[--nuss-text] text-lg leading-none">&times;</button>
        </div>

        {/* 导出内容 */}
        <div>
          <label className="text-[10px] text-[--nuss-muted] uppercase tracking-wider mb-2 block">导出内容</label>
          <div className="space-y-1.5">
            <label className={`flex items-center gap-2 p-2.5 rounded border cursor-pointer transition-all ${content === "script_only" ? "border-[--nuss-accent] bg-[--nuss-accent]/5" : "border-[--nuss-border] hover:border-[--nuss-border]/70"}`}>
              <input type="radio" name="content" checked={content === "script_only"} onChange={() => { setContent("script_only"); if (format === "docx" || format === "pdf") setFormat("yaml"); }} className="accent-[--nuss-accent]" />
              <div>
                <div className="text-xs font-medium">仅剧本</div>
                <div className="text-[10px] text-[--nuss-muted]">纯剧本正文，不含导演批注</div>
              </div>
            </label>
            <label className={`flex items-center gap-2 p-2.5 rounded border cursor-pointer transition-all ${content === "script_with_director" ? "border-[--nuss-accent] bg-[--nuss-accent]/5" : "border-[--nuss-border] hover:border-[--nuss-border]/70"}`}>
              <input type="radio" name="content" checked={content === "script_with_director"} onChange={() => { setContent("script_with_director"); if (format === "yaml") setFormat("pdf"); }} className="accent-[--nuss-accent]" />
              <div>
                <div className="text-xs font-medium">剧本 + AI导演批注</div>
                <div className="text-[10px] text-[--nuss-muted]">包含导演建议的双栏文档</div>
              </div>
            </label>
          </div>
        </div>

        {/* 导出格式 */}
        <div>
          <label className="text-[10px] text-[--nuss-muted] uppercase tracking-wider mb-2 block">导出格式</label>
          <div className="flex gap-2">
            <FormatBtn
              label="YAML" icon=""
              selected={format === "yaml"} disabled={yamlDisabled}
              disabledTip="导演批注导出仅支持 Word 和 PDF 格式"
              onClick={() => setFormat("yaml")}
            />
            <FormatBtn
              label="Word" icon=""
              selected={format === "docx"} disabled={false}
              onClick={() => setFormat("docx")}
            />
            <FormatBtn
              label="PDF" icon=""
              selected={format === "pdf"} disabled={false}
              onClick={() => setFormat("pdf")}
            />
          </div>
          {yamlDisabled && (
            <p className="text-[9px] text-yellow-400/70 mt-1.5">⚠️ 导演批注导出仅支持 Word 和 PDF 格式</p>
          )}
        </div>

        {/* 确认 */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="console-btn-primary w-full py-2.5 text-sm"
        >
          {exporting ? "导出中..." : "确认导出"}
        </button>
      </div>
    </div>
  );
}

function FormatBtn({ label, icon, selected, disabled, disabledTip, onClick }: {
  label: string; icon: string; selected: boolean; disabled: boolean;
  disabledTip?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={disabled ? (disabledTip || "") : undefined}
      className={`flex-1 flex flex-col items-center gap-1 p-3 rounded border text-xs transition-all ${
        disabled
          ? "border-[--nuss-border]/20 bg-[--nuss-surface]/30 text-[--nuss-muted]/30 cursor-not-allowed"
          : selected
            ? "border-[--nuss-accent] bg-[--nuss-accent]/10 text-[--nuss-accent]"
            : "border-[--nuss-border] hover:border-[--nuss-accent]/50 text-[--nuss-muted] hover:text-[--nuss-text]"
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
