"""
AI-NUSS 3.0 — Async Job Processor (升级版)
完整流水线:
  Novel → Narrative Analyzer → Bible → Character Resolver
        → Scene Segmentation → Beat Extraction → Screenplay → YAML Export
"""
import asyncio
import traceback
from typing import Dict, Any
from app.core.job_store import store
from app.core.config import settings


async def process_job(job_id: str) -> None:
    job = await store.get_job(job_id)
    if not job:
        return

    text = job.file_text or ""
    title = job.novel_title or (job.file_name or "未命名")

    try:
        # ═══════════════════════════════════════════
        # Stage 0: 文档解析 (0% → 10%)
        # ═══════════════════════════════════════════
        await _progress(job_id, "uploading", 3, "正在解析文档结构...", "parsing")
        await asyncio.sleep(0.2)

        chapters = _split_into_chapters(text)
        total_chars = sum(len(ch.get("raw_text", "")) for ch in chapters)
        await store.update_state(job_id, {"chapters": chapters, "current_chapter_index": 0})
        await _progress(job_id, "uploading", 10, f"文档解析完成: {len(chapters)}章 {total_chars}字", "parsing")

        # ═══════════════════════════════════════════
        # Stage 1: 叙事分析 (10% → 20%)
        # ═══════════════════════════════════════════
        await _progress(job_id, "analyzing", 12, "正在分析叙事核心要素...", "narrative")
        from app.graph.agents.narrative_analyzer import NarrativeAnalyzer
        na = NarrativeAnalyzer()
        na_result = await na.run({"chapters": chapters, "master_cast_list": job.state.get("master_cast_list", [])})
        story_analysis = {}
        if na_result.success and na_result.data:
            story_analysis = na_result.data.get("story_analysis", {})
            await store.update_state(job_id, {"story_analysis": story_analysis})
            await _progress(job_id, "analyzing", 20,
                f"叙事分析完成: {story_analysis.get('theme','?')} / {story_analysis.get('genre','?')}",
                "narrative")

        # ═══════════════════════════════════════════
        # Stage 2: 故事圣经 (20% → 28%)
        # ═══════════════════════════════════════════
        await _progress(job_id, "analyzing", 22, "正在构建故事圣经...", "bible")
        from app.graph.agents.bible_agent import BibleAgent
        ba = BibleAgent()
        ba_result = await ba.run({"chapters": chapters[:2], "story_bible": job.state.get("story_bible", {})})
        if ba_result.success and ba_result.data:
            await store.update_state(job_id, {"story_bible": ba_result.data.get("story_bible", {})})
        await _progress(job_id, "analyzing", 28, "故事圣经完成", "bible")

        # ═══════════════════════════════════════════
        # Stage 3: 角色消歧 (28% → 40%)
        # ═══════════════════════════════════════════
        await _progress(job_id, "analyzing", 30, "正在识别角色并消歧别名...", "characters")
        from app.graph.agents.character_agent import CharacterAgent
        ca = CharacterAgent()
        ca_result = await ca.run({
            "chapters": chapters, "story_bible": job.state.get("story_bible", {}),
            "entity_map": job.state.get("entity_map", {}),
            "master_cast_list": job.state.get("master_cast_list", []),
        })
        cast = []
        entity_map = {}
        if ca_result.success and ca_result.data:
            cast = ca_result.data.get("master_cast_list", [])
            entity_map = ca_result.data.get("entity_map", {})
            await store.update_state(job_id, {"entity_map": entity_map, "master_cast_list": cast})
        await _progress(job_id, "analyzing", 40, f"角色识别完成: {len(cast)}人", "characters")
        for c in cast[:8]:
            await store.add_event(job_id, "character_found", {
                "character_id": c.get("character_id"), "canonical_name": c.get("canonical_name"),
                "role": c.get("role"), "confidence": c.get("confidence_score", 1.0),
            })

        # ═══════════════════════════════════════════
        # Stage 4: 场景切分 (40% → 65%)
        #   分两步: ① 确定引擎切分(40-45%) ② 逐场AI润色(45-63%)
        # ═══════════════════════════════════════════
        from app.graph.agents.scene_agent import SceneAgent
        sa = SceneAgent()

        # — 4a: 确定性切分 (40% → 45%, <0.1s) —
        await _progress(job_id, "analyzing", 42, "确定性引擎切分中...", "scenes")
        scenes = sa.segment_all(chapters, entity_map, story_analysis)
        total_scenes = len(scenes)
        await store.update_state(job_id, {"scenes": scenes, "scene_version": 1})
        await _progress(job_id, "analyzing", 45, f"切分完成: {total_scenes}场", "scenes")

        # — 4b: 逐场AI润色 (45% → 63%, 前3场各占6%) —
        enrich_count = min(3, total_scenes)
        if enrich_count > 0 and not settings.STUB_MODE:
            await _progress(job_id, "analyzing", 46, f"AI润色场景 0/{enrich_count}", "scenes")
            for i, s in enumerate(scenes[:enrich_count]):
                await store.add_event(job_id, "scene_refining", {
                    "current_scene": i + 1, "total_scenes": enrich_count,
                    "scene_id": s.get("scene_id"), "scene_number": s.get("scene_number"),
                })
                await _progress(job_id, "analyzing", 46 + i * 6,
                    f"AI润色场景 {i + 1}/{enrich_count} — 第{s.get('scene_number')}场 {s.get('location','')}",
                    "scenes")

                ok = await sa.enrich_single_scene(s)
                new_pct = 46 + (i + 1) * 6  # 46→52→58→64
                if ok:
                    await _progress(job_id, "analyzing", new_pct,
                        f"场景 {i + 1}/{enrich_count} 润色完成 ✓",
                        "scenes")
                    await store.add_event(job_id, "scene_refined", {
                        "current_scene": i + 1, "total_scenes": enrich_count,
                        "scene_id": s.get("scene_id"),
                        "summary": s.get("summary", "")[:100],
                        "purpose": s.get("purpose", ""),
                    })
                else:
                    await _progress(job_id, "analyzing", new_pct,
                        f"场景 {i + 1}/{enrich_count} 润色跳过(使用规则推断)",
                        "scenes")

            await store.update_state(job_id, {"scenes": scenes})

        await _progress(job_id, "analyzing", 63, f"场景切分完成: {total_scenes}场", "scenes")
        for s in scenes[:10]:
            await store.add_event(job_id, "scene_generated", {
                "scene_id": s.get("scene_id"), "scene_number": s.get("scene_number"),
                "location": s.get("location", ""), "time": s.get("time", ""),
                "timeline_mode": s.get("timeline_mode", "sequential"),
                "summary": s.get("summary", "")[:120],
                "purpose": s.get("purpose", ""),
                "conflict_level": s.get("conflict_level", 0),
                "emotional_tone": s.get("emotional_tone", ""),
            })

        # ═══════════════════════════════════════════
        # Stage 5: 剧本生成 (65% → 95%)
        # ═══════════════════════════════════════════
        await _progress(job_id, "generating", 67, "正在提取戏剧节拍...", "beats")
        from app.graph.agents.screenplay_agent import ScreenplayAgent
        spa = ScreenplayAgent()
        spa_result = await spa.run({
            "scenes": scenes, "master_cast_list": cast,
            "story_analysis": story_analysis, "entity_map": entity_map,
        })

        all_beats = []
        screenplay = {}
        stats = None
        completion_status = "COMPLETED"
        if spa_result.success and spa_result.data:
            all_beats = spa_result.data.get("beats", [])
            screenplay = spa_result.data.get("screenplay", {})
            stats = spa_result.data.get("stats")
            completion_status = spa_result.data.get("_completion_status", "COMPLETED")

            # 将节拍挂载到对应场景
            beats_by_sid: dict = {}
            for b in all_beats:
                sid = b.get("scene_id", "")
                beats_by_sid.setdefault(sid, []).append(b)
            for s in scenes:
                sid = s.get("scene_id", "")
                s["beats"] = beats_by_sid.get(sid, [])

            if stats:
                screenplay["generation_stats"] = stats
            await store.update_state(job_id, {
                "beats": all_beats, "screenplay": screenplay, "scenes": scenes,
            })

        # — 覆盖率判定 —
        if completion_status == "FAILED":
            cov = stats.get("coverage", 0) if stats else 0
            gen = stats.get("generated_scenes", 0) if stats else 0
            tot = stats.get("total_scenes", 0) if stats else len(scenes)
            await _progress(job_id, "error", 70,
                f"剧本生成失败 — 仅完成 {gen}/{tot} 场 (覆盖率 {cov*100:.0f}%)", "beats")
            await store.add_event(job_id, "beat_extraction_failed", {
                "message": f"覆盖率不足: {gen}/{tot} ({cov*100:.0f}%)",
                "generated": gen, "total": tot, "coverage": cov,
            })
            await store.update_state(job_id, {"last_error": f"覆盖率 {cov*100:.0f}% < 50% — 仅完成 {gen}/{tot} 场"})
            return  # 提前终止

        if completion_status == "PARTIAL_SUCCESS":
            cov = stats.get("coverage", 0) if stats else 0
            gen = stats.get("generated_scenes", 0) if stats else 0
            tot = stats.get("total_scenes", 0) if stats else len(scenes)
            await _progress(job_id, "generating", 90,
                f"部分成功: {gen}/{tot} 场 ({cov*100:.0f}%)", "beats")
            await store.add_event(job_id, "beat_partial", {
                "message": f"部分场景生成成功: {gen}/{tot} ({cov*100:.0f}%)",
                "generated": gen, "total": tot, "coverage": cov,
            })

        # Per-scene 日志
        if stats:
            for p in stats.get("per_scene", []):
                await store.add_event(job_id, "beat_scene_log", {
                    "scene_id": p.get("scene_id"), "scene_number": p.get("scene_number"),
                    "status": p.get("status"), "beats": p.get("beats", 0),
                    "tokens_in": p.get("tokens_in", 0), "tokens_out": p.get("tokens_out", 0),
                    "latency": p.get("latency", 0),
                    "error": p.get("error", ""), "skip_reason": p.get("skip_reason", ""),
                })

        await _progress(job_id, "generating", 93,
            f"剧本生成完成: {len(all_beats)}节拍 {len(screenplay.get('episodes',[]))}集",
            "beats")

        for b in all_beats[:15]:
            await store.add_event(job_id, "beat_generated", {
                "scene_id": b.get("scene_id"), "beat_id": b.get("beat_id"),
                "beat_type": b.get("beat_type"), "summary": b.get("summary", "")[:100],
                "emotion": b.get("emotion", ""), "intensity": b.get("intensity", 0.5),
                "actions_count": len(b.get("actions", [])),
                "dialogues_count": len(b.get("dialogues", [])),
            })

        # ═══════════════════════════════════════════
        # Stage 6: 完成 (95% → 100%)
        # ═══════════════════════════════════════════
        ep_count = len(screenplay.get("episodes", []))
        sc_count = len(scenes)
        ch_count = len(cast)
        bt_count = len(all_beats)
        cov = stats.get("coverage", 1.0) if stats else 1.0
        final_status = "completed" if completion_status == "COMPLETED" else "completed_partial"
        await _progress(job_id, final_status, 100,
            f"全流程完成! {len(chapters)}章 → {ep_count}集 {sc_count}场 {ch_count}角色 {bt_count}节拍 (覆盖率{cov*100:.0f}%)",
            "done")
        await store.add_event(job_id, "pipeline_complete", {
            "message": f"完成: {len(chapters)}章 {ep_count}集 {sc_count}场戏 {ch_count}角色 {bt_count}节拍 (覆盖率{cov*100:.0f}%)",
            "final_stats": {"chapters": len(chapters), "episodes": ep_count, "scenes": sc_count, "characters": ch_count, "beats": bt_count, "coverage": cov},
        })

    except Exception as e:
        await _progress(job_id, "error", 0, f"处理失败: {str(e)[:80]}", "error")
        await store.add_event(job_id, "pipeline_error", {
            "message": f"处理失败: {str(e)}", "traceback": traceback.format_exc()[:800],
        })


async def _progress(job_id: str, status: str, pct: float, step: str, stage: str):
    await store.update_job(job_id, review_status=status, progress_pct=pct, current_step=step)
    await store.add_event(job_id, "progress_update", {
        "review_status": status, "progress_pct": pct, "current_step": step, "stage": stage,
    })


# ═════════════════════════════════════════════════════
# Chapter Splitter
# ═════════════════════════════════════════════════════

def _split_into_chapters(text: str) -> list[dict]:
    import re
    if not text or not text.strip():
        return [{"chapter_index": 1, "title": "全文", "raw_text": "（空文本）"}]
    patterns = [r'(?:第[一二三四五六七八九十百千\d]+章[^\n]*)', r'(?:Chapter\s+\d+[^\n]*)', r'(?:CHAPTER\s+\d+[^\n]*)']
    combined = "|".join(f"({p})" for p in patterns)
    splits = re.split(f"({combined})", text, flags=re.IGNORECASE)
    chapters = []
    idx = 0
    cur_title = "第一章"
    cur_text = ""
    if len(splits) <= 2:
        t = text.strip()
        if t:
            chapters.append({"chapter_index": 1, "title": "全文", "raw_text": t})
        return chapters
    for part in splits:
        if not part: continue
        part = part.strip()
        if not part: continue
        if any(re.match(p, part, re.IGNORECASE) for p in patterns):
            if cur_text.strip():
                idx += 1
                chapters.append({"chapter_index": idx, "title": cur_title.strip(), "raw_text": cur_text.strip()})
            cur_title = part; cur_text = ""
        else:
            cur_text += part + "\n"
    if cur_text.strip():
        idx += 1
        chapters.append({"chapter_index": idx, "title": cur_title.strip(), "raw_text": cur_text.strip()})
    return chapters if chapters else [{"chapter_index": 1, "title": "全文", "raw_text": text.strip()}]
