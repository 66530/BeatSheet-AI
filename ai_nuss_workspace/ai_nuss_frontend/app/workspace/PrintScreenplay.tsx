/**
 * AI-NUSS 3.0 — PrintScreenplay
 * 可复用剧本排版组件，用于导出 PDF / 打印预览 / 场景级导出。
 * 与 ScreenplayViewer 剧本部分视觉完全一致。
 */
import type { SceneUIModel, BeatUIModel } from "../api_client";

interface RichBeat {
  beat_id: string; beat_type: string;
  summary?: string; emotion?: string; intensity?: number;
  cast?: string[];
  actions?: Array<{ character_id?: string; description: string }>;
  dialogues?: Array<{ speaker_id?: string; target_id?: string; line?: string; emotion?: string; subtext?: string }>;
  voice_overs?: Array<{ character_id?: string; content: string }>;
  inner_monologues?: Array<{ character_id?: string; content: string }>;
  captions?: Array<{ content: string }>;
  flashbacks?: Array<{ trigger?: string; content?: string }>;
}

type Props = {
  scenes: SceneUIModel[];
  singleScene?: boolean;        // 仅渲染第一个场景（场景级导出）
  includeDirector?: boolean;    // 是否渲染导演批注
  forExport?: boolean;          // 导出模式：嵌入独立样式，白色背景
};

// ═══════════════════════════════════════════════════════════
// 嵌入样式（导出时独立于主 CSS）
// ═══════════════════════════════════════════════════════════

const PRINT_CSS = `
  .ps-page { font-family: 'Noto Serif SC', 'SimSun', Georgia, serif; line-height: 1.9; color: #1a1a1a; background: #fff; padding: 40px 48px; max-width: 800px; margin: 0 auto; }
  .ps-page * { box-sizing: border-box; }
  .ps-scene-heading { font-size: 16px; font-weight: 700; color: #b91c1c; margin: 32px 0 4px 0; padding-bottom: 6px; border-bottom: 1px solid #e5e5e5; }
  .ps-scene-heading .ps-scene-num { color: #b91c1c; }
  .ps-scene-heading .ps-scene-mode { font-size: 12px; color: #888; margin-left: 8px; font-weight: 400; }
  .ps-scene-summary { font-size: 13px; color: #666; font-style: italic; margin: 4px 0 12px 0; padding-left: 8px; border-left: 3px solid #e5e5e5; }
  .ps-action { font-size: 14px; line-height: 2; text-align: justify; margin: 6px 0; }
  .ps-action .ps-char-ref { color: #b91c1c; font-weight: 600; }
  .ps-transition { text-align: right; font-weight: 700; font-size: 13px; color: #888; margin: 16px 0 8px 0; }
  .ps-dialogue-block { margin: 10px 0; text-align: center; }
  .ps-character-name { font-weight: 700; font-size: 14px; color: #1a1a1a; text-align: center; margin-bottom: 2px; }
  .ps-parenthetical { font-size: 12px; color: #888; font-style: italic; margin-left: 4px; }
  .ps-dialogue-line { font-size: 14px; text-align: center; margin: 0 60px; line-height: 1.8; }
  .ps-subtext { font-size: 11px; color: #aaa; text-align: center; margin-top: 2px; }
  .ps-caption { text-align: center; font-weight: 700; font-size: 13px; margin: 8px 0; }
  .ps-separator { text-align: center; color: #ccc; margin: 24px 0; font-size: 16px; letter-spacing: 8px; user-select: none; }
  .ps-voice { color: #666; font-style: italic; }
  .ps-flashback { font-style: italic; color: #888; padding-left: 16px; border-left: 2px solid #ddd; margin: 8px 0; }

  /* Director note in export */
  .ps-director { margin: 12px 0; padding: 10px 14px; border-left: 3px solid #b91c1c; background: #fafafa; font-size: 12px; }
  .ps-director-title { font-weight: 700; color: #b91c1c; margin-bottom: 4px; }
  .ps-dir-tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
  .ps-dir-tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #ddd; background: #f5f5f5; }
  .ps-dir-shots { display: flex; gap: 4px; flex-wrap: wrap; margin: 2px 0; }
  .ps-dir-shot { padding: 1px 6px; border-radius: 3px; font-size: 11px; background: #fee2e2; color: #b91c1c; }
  .ps-dir-note { font-style: italic; color: #666; margin-top: 4px; }

  @media print {
    .ps-page { padding: 20px 36px; }
    @page { margin: 20mm; size: A4; }
  }
`;

export default function PrintScreenplay({ scenes, singleScene, includeDirector, forExport }: Props) {
  const displayScenes = singleScene && scenes.length > 0 ? [scenes[0]] : scenes;
  const css = forExport ? <style>{PRINT_CSS}</style> : null;

  return (
    <div className={forExport ? "ps-page" : ""}>
      {css}
      {displayScenes.map((scene, idx) => {
        const beats = (scene.beats || []) as RichBeat[];
        const time = (scene as Record<string, unknown>).time as string || scene.time_of_day || "日";
        const purpose = (scene as Record<string, unknown>).purpose as string | undefined;
        const mode = scene.timeline_mode;
        const modeLabel: Record<string, string> = { location_shift: "转场", time_shift: "时间推移", flashback: "闪回", montage: "蒙太奇", simultaneous: "平行时空" };
        const rawBlock = (scene as Record<string, unknown>).raw_scene_text_block as string | undefined;

        return (
          <div key={scene.scene_id} data-scene-id={scene.scene_id}>
            {/* Scene Heading */}
            <div className={forExport ? "ps-scene-heading" : "script-scene-heading"}>
              <span className={forExport ? "ps-scene-num" : "text-[--nuss-accent] font-bold"}>
                第{scene.scene_number}场
              </span>
              <span>  {scene.location}  —  {time}</span>
              {mode && mode !== "sequential" && (
                <span className={forExport ? "ps-scene-mode" : "text-[10px] text-[--nuss-accent]"}>
                  [{modeLabel[mode] || mode}]
                </span>
              )}
            </div>

            {/* Scene Summary / Purpose */}
            {purpose && (
              <div className={forExport ? "ps-scene-summary" : "script-scene-context"}>
                <span>{purpose}</span>
              </div>
            )}

            {/* Beats or raw text */}
            {beats.length === 0 ? (
              <div className={forExport ? "ps-action" : "script-action text-[--nuss-muted] italic leading-relaxed whitespace-pre-wrap border-l-2 border-yellow-500/30 pl-3 my-2"}>
                {rawBlock || scene.summary || "暂无内容"}
              </div>
            ) : (
              beats.map((beat, bi) => (
                <div key={beat.beat_id || bi}>
                  {beat.captions?.map((c, ci) => (
                    <div key={`c-${ci}`} className={forExport ? "ps-caption" : "script-caption"}>{c.content}</div>
                  ))}
                  {beat.flashbacks && beat.flashbacks.length > 0 && (
                    <div className={forExport ? "ps-transition" : "script-transition"}>FLASHBACK TO:</div>
                  )}
                  {beat.actions?.map((a, ai) => (
                    <div key={`a-${ai}`} className={forExport ? "ps-action" : "script-action"}>
                      {a.character_id && <span className={forExport ? "ps-char-ref" : "script-char-ref"}>[{a.character_id}] </span>}
                      {a.description}
                    </div>
                  ))}
                  {beat.dialogues?.map((d, di) => (
                    <div key={`d-${di}`} className={forExport ? "ps-dialogue-block" : "script-dialogue-block"}>
                      <div className={forExport ? "ps-character-name" : "script-character-name"}>
                        {d.speaker_id || "?"}
                        {d.emotion && <span className={forExport ? "ps-parenthetical" : "script-parenthetical"}>({d.emotion})</span>}
                      </div>
                      <div className={forExport ? "ps-dialogue-line" : "script-dialogue-line"}>{d.line || "..."}</div>
                      {d.subtext && <div className={forExport ? "ps-subtext" : "script-subtext"}>[{d.subtext}]</div>}
                    </div>
                  ))}
                  {beat.voice_overs?.map((v, vi) => (
                    <div key={`v-${vi}`} className={forExport ? "ps-dialogue-block ps-voice" : "script-dialogue-block"}>
                      <div className={forExport ? "ps-character-name" : "script-character-name"}>
                        {v.character_id || "?"} <span className={forExport ? "ps-parenthetical" : "script-parenthetical"}>(画外音)</span>
                      </div>
                      <div className={forExport ? "ps-dialogue-line" : "script-dialogue-line"}>{v.content}</div>
                    </div>
                  ))}
                  {beat.inner_monologues?.map((m, mi) => (
                    <div key={`m-${mi}`} className={forExport ? "ps-dialogue-block ps-voice" : "script-dialogue-block"}>
                      <div className={forExport ? "ps-character-name" : "script-character-name"}>
                        {m.character_id || "?"} <span className={forExport ? "ps-parenthetical" : "script-parenthetical"}>(内心独白)</span>
                      </div>
                      <div className={forExport ? "ps-dialogue-line" : "script-dialogue-line italic"}>{m.content}</div>
                    </div>
                  ))}
                  {beat.flashbacks?.map((f, fi) => (
                    <div key={`f-${fi}`} className={forExport ? "ps-flashback" : "script-action italic text-[--nuss-muted]"}>{f.content}</div>
                  ))}
                </div>
              ))
            )}

            {/* Director Note */}
            {includeDirector && (() => {
              const dn = (scene as Record<string, unknown>).director_note as Record<string, string | string[]> | undefined;
              if (!dn || !dn.emotion) return null;
              return (
                <div className={forExport ? "ps-director" : "console-panel text-[10px] mt-2 p-2 border-l-2 border-[--nuss-accent]/50"}>
                  <div className={forExport ? "ps-director-title" : "font-bold text-[--nuss-accent]"}>🎬 导演建议</div>
                  <div className={forExport ? "ps-dir-tags" : "flex gap-1 flex-wrap mt-1"}>
                    <span className={forExport ? "ps-dir-tag" : "px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[9px]"}>{(dn.emotion as string)}</span>
                    <span className={forExport ? "ps-dir-tag" : "px-1.5 py-0.5 rounded bg-[--nuss-accent]/20 text-[--nuss-accent] text-[9px]"}>{(dn.visual_style as string)}</span>
                  </div>
                  {Array.isArray(dn.camera_plan) && (
                    <div className={forExport ? "ps-dir-shots" : "flex gap-1 flex-wrap mt-1"}>
                      {(dn.camera_plan as string[]).map((s, i) => (
                        <span key={i} className={forExport ? "ps-dir-shot" : "px-1.5 py-0.5 rounded bg-[--nuss-accent]/10 text-[--nuss-accent] text-[9px]"}>{s}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] mt-1" style={{ color: forExport ? "#666" : undefined }}>
                    💡 {dn.lighting as string}  |  🎵 {dn.music as string}
                  </div>
                  {dn.director_comment && <div className={forExport ? "ps-dir-note" : "text-[--nuss-muted] italic mt-1"}>📝 {(dn.director_comment as string)}</div>}
                </div>
              )}
            )()}

            {/* Separator (not after last scene) */}
            {idx < displayScenes.length - 1 && (
              <div className={forExport ? "ps-separator" : "script-scene-separator"}>· · ·</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
