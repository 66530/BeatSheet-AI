"use client";

import { useState } from "react";
import type { CharacterUIModel, ReviewStatus } from "../api_client";

export default function CharacterGraph({ characters, reviewStatus }: { characters: CharacterUIModel[]; reviewStatus: ReviewStatus }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isEmpty = characters.length === 0;
  const selected = characters.find(c => c.character_id === selectedId);
  const roleLabel: Record<string, string> = { protagonist: "主角", antagonist: "对手", supporting: "配角", cameo: "客串" };
  const roleCls: Record<string, string> = { protagonist: "bg-blue-500/20 text-blue-400", antagonist: "bg-red-500/20 text-red-400", supporting: "bg-gray-500/20 text-gray-400", cameo: "bg-purple-500/20 text-purple-400" };

  return (
    <div className="grid grid-cols-3 gap-6 animate-fade-in">
      <div className="col-span-1 space-y-3">
        <h3 className="text-lg font-semibold">
          角色列表
          {!isEmpty && <span className="ml-2 text-sm font-normal text-[--nuss-muted]">{characters.length} 人</span>}
        </h3>
        {isEmpty ? (
          <div className="blank-safe-card p-8 text-center">
            <span className="text-4xl"></span>
            <p className="text-[--nuss-muted] text-sm mt-3">暂无角色数据</p>
            <p className="text-[10px] text-[--nuss-muted] mt-1">上传小说后自动提取</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {characters.map(c => (
              <div key={c.character_id} onClick={() => setSelectedId(selectedId === c.character_id ? null : c.character_id)}
                className={"blank-safe-card p-3 cursor-pointer transition-all " + (selectedId === c.character_id ? "border-[--nuss-accent] bg-[--nuss-accent]/10" : "")}>
                <div className="flex items-center gap-2.5">
                  <div className={"w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 " + (selectedId === c.character_id ? "bg-[--nuss-accent] text-white" : "bg-[--nuss-border]/50 text-[--nuss-muted]")}>
                    {c.canonical_name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{c.canonical_name}</span>
                      <span className={"text-[10px] px-1.5 py-0.5 rounded " + (roleCls[c.role] || "")}>{roleLabel[c.role] || c.role}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[--nuss-muted]">
                      <span>{(c.aliases || []).length} 别名</span>
                      <span className={(c.confidence_score ?? 1) < 0.75 ? "text-orange-400" : "text-green-400"}>
                        {((c.confidence_score ?? 1) * 100).toFixed(0)}% 置信度
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="col-span-2">
        {selected ? <DetailPanel character={selected} /> : (
          <div className="blank-safe-card p-10 text-center h-full flex items-center justify-center">
            <div><span className="text-4xl"></span><p className="text-[--nuss-muted] mt-3 text-sm">{isEmpty ? "暂无角色数据" : "选择角色查看详情"}</p></div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailPanel({ character }: { character: CharacterUIModel }) {
  const c = character.constraints;
  const belief = c?.current_belief || "";
  const goal = c?.current_goal || "";
  const emotion = c?.emotional_state || "";
  const conflict = c?.internal_conflict || "";
  const taboos = c?.taboos || [];

  return (
    <div className="blank-safe-card p-6 animate-slide-up space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-[--nuss-accent]/20 flex items-center justify-center text-lg font-bold text-[--nuss-accent-glow]">
          {character.canonical_name?.charAt(0) || "?"}
        </div>
        <div>
          <h3 className="text-lg font-semibold">{character.canonical_name}</h3>
          <p className="text-xs text-[--nuss-muted]">
            {character.character_id} · {((character.confidence_score ?? 1) * 100).toFixed(0)}% 置信度
          </p>
        </div>
      </div>

      <Section title="已知别名">
        <div className="flex flex-wrap gap-1.5">
          {(character.aliases || []).length > 0
            ? character.aliases.map(a => <span key={a} className="px-2 py-0.5 rounded text-[10px] bg-[--nuss-border]/50">{a}</span>)
            : <span className="text-xs text-[--nuss-muted] italic">无别名</span>}
        </div>
      </Section>

      <Section title="戏剧约束">
        <Row label="当前信念" value={belief} />
        <Row label="当前目标" value={goal} />
        <Row label="情绪状态" value={emotion} />
        <Row label="内心冲突" value={conflict} />
      </Section>

      <Section title="禁忌（硬约束）">
        {taboos.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {taboos.map((t: string) => <span key={t} className="px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/20"> {t}</span>)}
          </div>
        ) : <span className="text-xs text-[--nuss-muted] italic">无特殊禁忌</span>}
      </Section>

      <Section title="描述">
        <p className="text-xs leading-relaxed">{character.description || "暂无描述"}</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-[--nuss-muted] uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[--nuss-border]/30 last:border-0">
      <span className="text-[10px] text-[--nuss-muted]">{label}</span>
      <span className="text-xs text-right max-w-[60%]">
        {value || <span className="text-[--nuss-muted] italic">未指定</span>}
      </span>
    </div>
  );
}
