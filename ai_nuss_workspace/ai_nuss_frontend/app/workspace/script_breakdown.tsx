"use client";

import { useState, useMemo } from "react";
import type { SceneUIModel, CharacterUIModel, ScriptBreakdownModel } from "../api_client";

// ── 场景扩展字段 ──
type RichScene = SceneUIModel & {
  time?: string;
  cast?: string[];
  breakdown?: ScriptBreakdownModel;
  estimated_pages?: number;
  director_note?: { lighting?: string; music?: string; director_comment?: string };
  purpose?: string;
};

interface Props {
  scenes: SceneUIModel[];
  characters: CharacterUIModel[];
}

// ═══════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════

/** 规范场景头：[内/外] · 主场景 · 次场景 · 时段 */
function formatSceneHeader(s: RichScene): { ioLabel: string; mainLoc: string; subLoc: string; tod: string; full: string } {
  const ioLabel = s.location_type === "indoor" ? "内" : s.location_type === "outdoor" ? "外" : "内/外";
  const rawLoc = s.location || "未指定";
  const subMarkers = ["书房", "卧室", "客厅", "厨房", "浴室", "阳台", "走廊", "后院", "前厅", "主卧", "次卧", "密室", "暗室", "地窖", "花园", "大门", "门口", "审讯室", "办公室", "病房", "包厢"];
  let mainLoc = rawLoc;
  let subLoc = "";
  for (const m of subMarkers) {
    if (rawLoc.endsWith(m) && rawLoc.length > m.length) {
      mainLoc = rawLoc.slice(0, -m.length);
      subLoc = m;
      break;
    }
    if (rawLoc.includes(m) && rawLoc.indexOf(m) > 0) {
      mainLoc = rawLoc.slice(0, rawLoc.indexOf(m));
      subLoc = rawLoc.slice(rawLoc.indexOf(m));
      break;
    }
  }
  const tod = (s as RichScene).time || s.time_of_day || "日";
  return {
    ioLabel,
    mainLoc: mainLoc || rawLoc,
    subLoc,
    tod,
    full: `${ioLabel} · ${mainLoc}${subLoc ? ` · ${subLoc}` : ""} · ${tod}`,
  };
}

/** 页数格式化：1/8 页法，无数据默认 1/8 */
function formatPageFraction(pages?: number): string {
  const p = pages ?? 0.125;
  const eighths = Math.max(1, Math.round(p * 8));
  if (eighths >= 8) {
    const whole = Math.floor(eighths / 8);
    const rem = eighths % 8;
    if (rem === 0) return `${whole}`;
    return `${whole} ${rem}/8`;
  }
  return `${eighths}/8`;
}

/** 气氛/场景类型 标签（结合 location_type + timeline_mode + emotional_tone） */
function atmosphereTag(s: RichScene): { text: string; color: string } {
  const lt = s.location_type;
  const mode = s.timeline_mode;
  const tone = (s as any).emotional_tone;

  // 特殊叙事模式优先
  if (mode === "flashback") return { text: "闪回", color: "bg-purple-500/15 text-purple-400 border-purple-500/20" };
  if (mode === "montage") return { text: "蒙太奇", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" };
  if ((mode as string) === "simultaneous") return { text: "平行时空", color: "bg-rose-500/15 text-rose-400 border-rose-500/20" };

  // 情绪标签
  if (tone) {
    const toneMap: Record<string, string> = {
      "紧张": "紧张", "悬疑": "悬疑", "悲伤": "悲伤", "愤怒": "愤怒",
      "温暖": "温暖", "浪漫": "浪漫", "恐惧": "恐惧", "喜悦": "喜悦",
      "压抑": "压抑",
    };
    if (toneMap[tone]) return { text: toneMap[tone], color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" };
  }

  // 室内/室外兜底
  if (lt === "indoor") return { text: "内景", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" };
  if (lt === "outdoor") return { text: "外景", color: "bg-green-500/15 text-green-400 border-green-500/20" };
  return { text: "未指定", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" };
}

/** 规则兜底：从场景文本提取常见道具关键词 */
const PROP_KEYWORDS = [
  "手机", "电话", "茶杯", "酒杯", "账本", "记事本", "笔记本", "书信", "信", "纸条",
  "刀", "剑", "枪", "匕首", "棍", "弹", "炸药",
  "钥匙", "锁", "门禁", "卡", "证件", "护照", "身份证",
  "药", "针", "绷带", "手术刀", "处方",
  "烟", "打火机", "雪茄", "烟斗",
  "笔", "墨", "纸", "砚", "毛笔", "钢笔", "合同", "文件", "档案",
  "照片", "相片", "胶卷", "录像", "录音", "U盘", "硬盘",
  "镜子", "梳子", "口红", "粉底", "香水",
  "手帕", "丝巾", "围巾", "手套", "帽子", "面具",
  "戒指", "项链", "手镯", "耳环", "手表", "怀表",
  "灯", "蜡烛", "手电", "灯笼",
  "花", "花瓶", "盆栽", "玫瑰", "百合",
  "钱", "钞票", "支票", "金条", "银元",
  "酒", "茶", "咖啡", "水", "杯子", "碗", "筷", "盘",
  "车", "钥匙扣", "雨伞", "包", "袋", "箱子", "行李箱",
];
const PROP_KEYWORD_SET = new Set(PROP_KEYWORDS);

function guessProps(scene: RichScene): string[] {
  const bd = scene.breakdown;
  if (bd?.props?.length) return bd.props;

  // 从摘要中提取
  const text = (scene.summary || "") + ((scene as any).raw_scene_text_block || "").slice(0, 500);
  const found: string[] = [];
  for (const kw of PROP_KEYWORDS) {
    if (found.length >= 4) break;
    if (text.includes(kw) && !found.includes(kw)) found.push(kw);
  }
  return found;
}

/** 摘要精简 */
function briefSummary(summary?: string): string {
  if (!summary) return "暂无摘要";
  const cleaned = summary.replace(/^[^。！？.!?]{0,10}(?:场景|本场|该场|画面|镜头)[^。！？.!?]{0,5}[，,]\s*/, "");
  if (cleaned.length <= 40) return cleaned;
  return cleaned.slice(0, 40) + "…";
}

// ═══════════════════════════════════════════════════
// 行内展开卡片
// ═══════════════════════════════════════════════════

function ExpandedBreakdown({ scene }: { scene: RichScene }) {
  const bd = scene.breakdown;
  const dn = scene.director_note as { lighting?: string; music?: string; director_comment?: string } | undefined;
  const header = formatSceneHeader(scene);
  const hasBreakdown = bd && (
    (bd.props?.length || 0) > 0 ||
    (bd.wardrobe?.length || 0) > 0 ||
    (bd.extras?.length || 0) > 0 ||
    (bd.stunts?.length || 0) > 0 ||
    (bd.vfx?.length || 0) > 0 ||
    (bd.special_equipment?.length || 0) > 0
  );

  return (
    <div className="p-4 animate-slide-up space-y-3">
      {/* ── 标题行 ── */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-[--nuss-accent]">
          第 {scene.scene_number} 场 · {header.full}
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[--nuss-muted]">
            {formatPageFraction(scene.estimated_pages)} 页
          </span>
        </div>
      </div>

      {/* ── 剧情摘要 + 戏剧目的 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
        <div>
          <span className="text-[--nuss-muted] uppercase tracking-wider block mb-0.5">剧情摘要</span>
          <p className="leading-relaxed">{scene.summary || "暂无摘要"}</p>
        </div>
        <div>
          <span className="text-[--nuss-muted] uppercase tracking-wider block mb-0.5">戏剧目的</span>
          <p className="text-[--nuss-accent] leading-relaxed">
            {(scene as RichScene).purpose || "推进叙事"}
          </p>
        </div>
      </div>

      {/* ── 详细拆解 ── */}
      {!hasBreakdown ? (
        <p className="text-[10px] text-[--nuss-muted] italic border-l-2 border-yellow-500/30 pl-3">
          ⚠️ 暂无 AI 拆解数据 — 重新上传小说后将由 DeepSeek 自动生成
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {bd?.props?.length ? <Chip label="🎬 道具" items={bd.props} color="bg-amber-500/10 text-amber-400 border-amber-500/20" /> : null}
          {bd?.wardrobe?.length ? <Chip label="👗 服装/化妆" items={bd.wardrobe} color="bg-pink-500/10 text-pink-400 border-pink-500/20" /> : null}
          {bd?.extras?.length ? <Chip label="👥 群演/特约" items={bd.extras} color="bg-sky-500/10 text-sky-400 border-sky-500/20" /> : null}
          {bd?.stunts?.length ? <Chip label="⚡ 动作/特技" items={bd.stunts} color="bg-orange-500/10 text-orange-400 border-orange-500/20" /> : null}
          {bd?.vfx?.length ? <Chip label="✨ 视觉特效" items={bd.vfx} color="bg-purple-500/10 text-purple-400 border-purple-500/20" /> : null}
          {bd?.special_equipment?.length ? <Chip label="🎥 特殊设备" items={bd.special_equipment} color="bg-cyan-500/10 text-cyan-400 border-cyan-500/20" /> : null}
        </div>
      )}

      {/* ── 导演备注 ── */}
      {dn && (dn.lighting || dn.music || dn.director_comment) && (
        <div className="flex items-start gap-3 text-[10px] pt-2 border-t border-[--nuss-border]/20">
          {dn.lighting && <span className="text-[--nuss-muted]">💡 {dn.lighting}</span>}
          {dn.music && <span className="text-[--nuss-muted]">🎵 {dn.music}</span>}
          {dn.director_comment && <span className="text-[--nuss-muted] italic">📝 {dn.director_comment}</span>}
        </div>
      )}
    </div>
  );
}

function Chip({ label, items, color }: { label: string; items: string[]; color: string }) {
  return (
    <div className={`p-2 rounded border ${color} text-[10px] space-y-0.5`}>
      <div className="font-semibold uppercase tracking-wider opacity-70">{label}</div>
      {items.map((item, i) => (
        <div key={i} className="opacity-85">· {item}</div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════

export default function ScriptBreakdown({ scenes, characters }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterLoc, setFilterLoc] = useState("");
  const [filterChar, setFilterChar] = useState("");
  const [filterTime, setFilterTime] = useState("");

  const idToName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const ch of characters) m[ch.character_id] = ch.canonical_name;
    return m;
  }, [characters]);

  const locOptions = useMemo(
    () => [...new Set(scenes.map(s => s.location).filter(Boolean))].sort(),
    [scenes],
  );
  const timeOptions = useMemo(
    () => [...new Set(scenes.map(s => (s as RichScene).time || s.time_of_day).filter(Boolean))].sort(),
    [scenes],
  );

  const filtered = useMemo(() => {
    return scenes.filter(s => {
      if (filterLoc && s.location !== filterLoc) return false;
      if (filterTime) {
        const t = (s as RichScene).time || s.time_of_day || "";
        if (t !== filterTime) return false;
      }
      if (filterChar) {
        const charIds: string[] = (s as RichScene).cast || s.character_ids || [];
        if (!charIds.includes(filterChar)) return false;
      }
      return true;
    });
  }, [scenes, filterLoc, filterTime, filterChar]);

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedIds(new Set(filtered.map(s => s.scene_id)));
  const collapseAll = () => setExpandedIds(new Set());

  if (scenes.length === 0) return null;

  const totalPages = filtered.reduce((sum, s) => sum + ((s as RichScene).estimated_pages ?? 0.125), 0);
  const totalEighths = Math.round(totalPages * 8);

  return (
    <div className="mb-4 console-panel animate-slide-up">
      {/* ── 标题栏 ── */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between text-xs font-semibold cursor-pointer select-none"
      >
        <span>🎬 剧本顺场表 · 统筹拆解</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[--nuss-muted]">
            {filtered.length} 场 · 合计 {totalEighths}/8 页
          </span>
          <span className="text-[--nuss-muted] text-[10px] transition-transform duration-200"
            style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
            ▼
          </span>
        </div>
      </button>

      {!collapsed && (
        <div className="mt-3 animate-slide-up space-y-2">
          {/* ── 筛选栏 ── */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)}
              className="text-[10px] px-2 py-1 rounded border border-[--nuss-border] bg-transparent text-[--nuss-text] cursor-pointer">
              <option value="">全部地点</option>
              {locOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={filterTime} onChange={e => setFilterTime(e.target.value)}
              className="text-[10px] px-2 py-1 rounded border border-[--nuss-border] bg-transparent text-[--nuss-text] cursor-pointer">
              <option value="">全部时段</option>
              {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterChar} onChange={e => setFilterChar(e.target.value)}
              className="text-[10px] px-2 py-1 rounded border border-[--nuss-border] bg-transparent text-[--nuss-text] cursor-pointer">
              <option value="">全部角色</option>
              {characters.map(c => (
                <option key={c.character_id} value={c.character_id}>{c.canonical_name}</option>
              ))}
            </select>
            <div className="flex-1" />
            <button onClick={expandAll} className="text-[10px] px-2 py-1 rounded border border-[--nuss-border] text-[--nuss-muted] hover:text-[--nuss-text] transition-colors">展开全部</button>
            <button onClick={collapseAll} className="text-[10px] px-2 py-1 rounded border border-[--nuss-border] text-[--nuss-muted] hover:text-[--nuss-text] transition-colors">收起</button>
          </div>

          {/* ── 专业统筹表 ── */}
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-[--nuss-border]/40 text-[--nuss-muted] text-[9px] uppercase tracking-widest sticky top-0 bg-[--nuss-bg]">
                  <th className="text-left py-2 pr-2 w-7">场</th>
                  <th className="text-left py-2 pr-3 min-w-[140px]">场景头</th>
                  <th className="text-right py-2 pr-2 w-12">页数</th>
                  <th className="text-left py-2 pr-3 min-w-[120px]">剧情摘要</th>
                  <th className="text-left py-2 pr-3 min-w-[90px]">主要角色</th>
                  <th className="text-center py-2 pr-2 w-14">气氛/类型</th>
                  <th className="text-left py-2 pr-3 min-w-[100px]">道具</th>
                  <th className="text-left py-2 pr-2 min-w-[70px]">群演</th>
                  <th className="text-left py-2 min-w-[80px]">特殊要求</th>
                </tr>
              </thead>
              {filtered.map(s => {
                  const rs = s as RichScene;
                  const bd = rs.breakdown;
                  const header = formatSceneHeader(rs);
                  const charIds: string[] = rs.cast || rs.character_ids || [];
                  const charNames = charIds.map(id => idToName[id] || id).filter(Boolean);
                  const isExpanded = expandedIds.has(s.scene_id);
                  const stuntsCount = bd?.stunts?.length || 0;
                  const vfxCount = bd?.vfx?.length || 0;
                  const equipCount = bd?.special_equipment?.length || 0;
                  const specTotal = stuntsCount + vfxCount + equipCount;
                  const atmo = atmosphereTag(rs);

                  return (
                    <tbody key={s.scene_id}>
                      <tr
                        onClick={() => toggle(s.scene_id)}
                        className={`border-b border-[--nuss-border]/10 cursor-pointer transition-colors ${
                          isExpanded ? "bg-[--nuss-accent]/5" : "hover:bg-[--nuss-surface]"
                        }`}
                      >
                        <td className="py-1.5 pr-2 font-bold text-[--nuss-accent-glow] text-[11px]">{s.scene_number}</td>
                        <td className="py-1.5 pr-3 font-medium whitespace-nowrap">
                          <span className={s.location_type === "indoor" ? "text-blue-400" : s.location_type === "outdoor" ? "text-green-400" : "text-yellow-400"}>
                            [{header.ioLabel}]
                          </span>{" "}
                          {header.mainLoc}
                          {header.subLoc && <span className="text-[--nuss-muted]"> · {header.subLoc}</span>}
                          {" · "}
                          <span className="text-[--nuss-muted]">{header.tod}</span>
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono text-[--nuss-muted]">{formatPageFraction(rs.estimated_pages)}</td>
                        <td className="py-1.5 pr-3 max-w-[140px] truncate italic">{briefSummary(s.summary)}</td>
                        <td className="py-1.5 pr-3 max-w-[100px] truncate">
                          {charNames.length > 0 ? charNames.map((n, i) => `${i + 1}.${n}`).join(" ") : "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${atmo.color}`}>{atmo.text}</span>
                        </td>
                        <td className="py-1.5 pr-3 max-w-[120px] truncate">{guessProps(rs).join("、") || "—"}</td>
                        <td className="py-1.5 pr-2 max-w-[80px] truncate">{bd?.extras?.length ? bd.extras.join("、") : "—"}</td>
                        <td className="py-1.5">
                          {specTotal > 0 ? <span className="text-[--nuss-accent] font-medium">{specTotal} 项</span> : "—"}
                          <span className="text-[--nuss-muted] ml-1.5">{isExpanded ? "▲" : "▼"}</span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-[--nuss-border]/10">
                          <td colSpan={9} className="bg-[--nuss-accent]/3">
                            <ExpandedBreakdown scene={rs} />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })}
            </table>
          </div>

          {filtered.length === 0 && (
            <p className="text-center text-[--nuss-muted] text-xs py-6">无匹配场景</p>
          )}
        </div>
      )}
    </div>
  );
}
