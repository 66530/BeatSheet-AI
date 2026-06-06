# PR-10: Script Quality Score 剧本导向质量评分体系

## 标题
新增五维剧本质量评分：structure 25% + character 20% + conflict 20% + action 15% + dialogue 20%。

## 功能描述
- **structure**：setup/turn/end 三元结构检测
- **character_interaction**：角色互动密度（出场人数/3）
- **conflict**：冲突等级 + 对抗性事件检测
- **visual_action**：可拍摄动词密度
- **dialogue**：对白密度 + 潜台词检测
- 输出 grade(A/B/C/D) + breakdown 子维度明细
- **关键事件抽取**：正则扫描动作动词 + 引号对白（每场最多 8 个事件）
- 前端场景卡片显示质量评分徽章

## 实现思路
- `_extract_key_events(text)` 正则扫描动词+对白
- `_compute_script_quality(text, char_count, char_num, dialogue_hints, mode, events)` 加权汇总
- `has_structure`: {setup, turn, end} 布尔值

## 测试方式
```python
q = scene["quality"]
assert "structure" in q["breakdown"]
assert q["grade"] in ("A","B","C","D")
assert q["breakdown"]["visual_action"] > 0
```

## 依赖
PR-07（Scene Segmentation）
