# PR-08: 节拍提取 + 六类剧本元素生成（Show Don't Tell）

## 标题
新增 ScreenplayAgent：并发生成全部场景节拍 + Action/Dialogue/VoiceOver/InnerMonologue/Caption/Flashback 六类元素。

## 功能描述
- 每场景分解为 3-5 个戏剧节拍（setup/reveal/conflict/decision/twist/climax/resolution）
- 六类剧本元素：Action（可拍摄动作）/ Dialogue（对白+潜台词）/ Voice Over（画外音）/ Inner Monologue（内心独白）/ Caption（字幕）/ Flashback（闪回）
- Show Don't Tell：禁止心理描述，转为可观察行为
- 每个元素强制标注 `character_id`
- 并发生成：`asyncio.gather` + `Semaphore(5)`，加速比 3-5x
- Voice Over 从叙事性旁白提取，Inner Monologue 从"心想/暗想/思忖"提取

## 实现思路
- DeepSeek prompt 引导节拍分解 + 六类元素生成
- 对白必须有 subtext（潜台词），动作必须可拍摄
- `MAX_CONCURRENCY=5` Semaphore 控制并发

## 测试方式
```python
result = await agent.run({"scenes": scenes, "master_cast_list": cast})
assert len(result["beats"]) > 0
assert any(len(b.get("voice_overs",[])) > 0 for b in result["beats"])
assert any(len(b.get("inner_monologues",[])) > 0 for b in result["beats"])
```

## 依赖
PR-06（BaseAgent）, PR-07（SceneSegmentation）

---
**Status: Submitted** | Branch: `pr/PR-08-screenplay-agent`
