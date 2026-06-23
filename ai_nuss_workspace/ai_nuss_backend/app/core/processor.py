"""
AI-NUSS 3.0 — Async Job Processor (升级版)
完整流水线:
  Novel → Narrative Analyzer → Bible → Character Resolver
        → Scene Segmentation → Beat Extraction → Screenplay → YAML Export
"""
import asyncio
import os
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
    mc = job.state.get("model_config", {})  # User's LLM config

    # ── 兜底：如果用户未在前端配置模型，回退到 .env 中的 API Key ──
    if not mc.get("base_url") or not mc.get("api_key"):
        env_key = os.getenv("DEEPSEEK_API_KEY", "")
        env_base = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        if env_key:
            mc = {
                "provider": "deepseek",
                "base_url": env_base,
                "model": "deepseek-chat",
                "api_key": env_key,
            }
            await store.update_state(job_id, {"model_config": mc})
            await store.add_event(job_id, "model_fallback", {
                "message": "使用环境变量中的 API Key 兜底",
                "provider": "deepseek",
            })

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
        na_result = await na.run({"chapters": chapters, "master_cast_list": job.state.get("master_cast_list", []), "model_config": mc})
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
        ba_result = await ba.run({"chapters": chapters[:2], "story_bible": job.state.get("story_bible", {}), "model_config": mc})
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
            "model_config": mc,
        })
        cast = []
        entity_map = {}
        if ca_result.success and ca_result.data:
            cast = ca_result.data.get("master_cast_list", [])
            entity_map = ca_result.data.get("entity_map", {})
            await store.update_state(job_id, {"entity_map": entity_map, "master_cast_list": cast})
        await _progress(job_id, "analyzing", 40, f"角色识别完成: {len(cast)}人", "characters")
        await store.add_event(job_id, "character_summary", {
            "total_characters": len(cast),
            "protagonist": next((c.get("canonical_name", "") for c in cast if c.get("role") == "protagonist"), ""),
            "roles": list(set(c.get("role", "") for c in cast)),
        })

        # ═══════════════════════════════════════════
        # Stage 4: 场景切分 (40% → 65%)
        #   分两步: ① 确定引擎切分(40-45%) ② 逐场AI润色(45-63%)
        # ═══════════════════════════════════════════
        from app.graph.agents.scene_agent import SceneAgent
        sa = SceneAgent()
        # Inject model_config for AI enrichment
        sa.set_model_config({"model_config": job.state.get("model_config", {})})

        # — 4a: 确定性切分 (40% → 45%, <0.1s) —
        await _progress(job_id, "analyzing", 42, "确定性引擎切分中...", "scenes")
        scenes = sa.segment_all(chapters, entity_map, story_analysis)
        total_scenes = len(scenes)
        await store.update_state(job_id, {"scenes": scenes, "scene_version": 1})
        await _progress(job_id, "analyzing", 45, f"切分完成: {total_scenes}场", "scenes")

        # 场景结构已就绪 → 立即推送前端，让用户马上看到
        await store.add_event(job_id, "scenes_segmented", {
            "message": f"场景切分完成: {total_scenes}场",
            "total_scenes": total_scenes,
        })

        # — 4b: 逐场AI润色 (45% → 63%) 全部场景并行批处理 —
        enrich_count = total_scenes
        if enrich_count > 0 and not settings.STUB_MODE:
            print(f"[ENRICH-BATCH] Starting: {total_scenes} scenes in batches of 4")
            # 并行批处理：每批 4 场
            BATCH_SIZE = 4
            batches = [scenes[i:i+BATCH_SIZE] for i in range(0, total_scenes, BATCH_SIZE)]
            pct_per_batch = 18.0 / max(len(batches), 1)

            await _progress(job_id, "analyzing", 46, f"AI润色场景 0/{total_scenes}", "scenes")

            done = 0
            for bi, batch in enumerate(batches):
                tasks = [sa.enrich_single_scene(s) for s in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                for s, ok in zip(batch, results):
                    if isinstance(ok, Exception):
                        continue  # enrich failed → keep rule-based defaults
                    if ok:
                        done += 1

                new_pct = min(63, 46 + int((bi + 1) * pct_per_batch))
                await _progress(job_id, "analyzing", new_pct,
                    f"AI润色场景 {done}/{total_scenes}",
                    "scenes")
                await store.add_event(job_id, "scene_refining_batch", {
                    "current_batch": bi + 1, "total_batches": len(batches),
                    "enriched": done, "total": total_scenes,
                })

            await store.update_state(job_id, {"scenes": scenes})
            print(f"[ENRICH-BATCH] Done: {done}/{total_scenes} enriched successfully")
            await store.add_event(job_id, "scenes_enriched", {
                "enriched": done, "total": total_scenes,
            })
        elif enrich_count > 0 and settings.STUB_MODE:
            print(f"[ENRICH-BATCH] SKIPPED — STUB_MODE is ON")

        await _progress(job_id, "analyzing", 63, f"场景切分完成: {total_scenes}场", "scenes")
        # 摘要事件，不再逐场推送
        await store.add_event(job_id, "scenes_summary", {
            "total_scenes": total_scenes,
            "sample_locations": [s.get("location", "") for s in scenes[:5] if s.get("location")],
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
            "model_config": mc,
        })

        all_beats = []
        screenplay = {}
        stats = None
        completion_status = "COMPLETED"

        # Try real result first. If it FAILED, use fallback mock data.
        screenplay_data = None
        if spa_result.success and spa_result.data:
            real_status = spa_result.data.get("_completion_status", "COMPLETED")
            if real_status == "FAILED" and spa_result.fallback_data and spa_result.fallback_data.get("data"):
                # Real LLM failed entirely — use deterministic mock
                screenplay_data = spa_result.fallback_data["data"]
                await store.add_event(job_id, "beat_fallback", {
                    "message": "LLM调用失败，使用确定性回退数据",
                })
            else:
                screenplay_data = spa_result.data
        elif spa_result.fallback_data and spa_result.fallback_data.get("data"):
            screenplay_data = spa_result.fallback_data["data"]

        if screenplay_data:
            all_beats = screenplay_data.get("beats", [])
            screenplay = screenplay_data.get("screenplay", {})
            stats = screenplay_data.get("stats")
            completion_status = screenplay_data.get("_completion_status", "COMPLETED")

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

        await _progress(job_id, "generating", 93,
            f"剧本生成完成: {len(all_beats)}节拍 {len(screenplay.get('episodes',[]))}集",
            "beats")

        # 摘要事件：仅发送统计，不逐条推送
        await store.add_event(job_id, "beat_summary", {
            "total_beats": len(all_beats),
            "beat_types": list(set(b.get("beat_type", "") for b in all_beats)),
            "avg_intensity": sum(b.get("intensity", 0) for b in all_beats) / max(len(all_beats), 1),
        })

        # ═══════════════════════════════════════════
        # Stage 5.5: AI导演分析 (93% → 98%)
        # ═══════════════════════════════════════════
        await _progress(job_id, "generating", 93, "AI导演助手分析中...", "director")
        await store.add_event(job_id, "director_start", {
            "message": f"开始导演分析: {len(scenes)}场",
            "total_scenes": len(scenes),
        })

        from app.graph.agents.director_agent import DirectorAgent
        da = DirectorAgent()
        da_result = await da.run({"scenes": scenes, "model_config": mc})

        director_stats = {"total": len(scenes), "generated": 0, "failed": 0}
        if da_result.success and da_result.data:
            updated_scenes = da_result.data.get("scenes", [])
            # 将 director_note 写回原始 scenes（保持其他字段不变）
            for us in updated_scenes:
                for s in scenes:
                    if s.get("scene_id") == us.get("scene_id"):
                        s["director_note"] = us.get("director_note")
                        break
            director_stats = da_result.data.get("_director_stats", director_stats)
        elif da_result.fallback_data and da_result.fallback_data.get("data"):
            fd = da_result.fallback_data["data"]
            updated_scenes = fd.get("scenes", [])
            for us in updated_scenes:
                for s in scenes:
                    if s.get("scene_id") == us.get("scene_id"):
                        s["director_note"] = us.get("director_note")
                        break

        await store.update_state(job_id, {"scenes": scenes, "director_version": 1})
        await _progress(job_id, "generating", 98,
            f"AI导演分析完成: {director_stats.get('generated',0)}/{director_stats.get('total',0)}场",
            "director")
        await store.add_event(job_id, "director_complete", {
            "message": f"导演分析完成: {director_stats.get('generated',0)}/{director_stats.get('total',0)}场",
            "generated": director_stats.get("generated", 0),
            "failed": director_stats.get("failed", 0),
        })

        # ═══════════════════════════════════════════
        # Stage 6: 完成 (98% → 100%)
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
