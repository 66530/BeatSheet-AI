# PR-07: 五类分场检测器 + 确定性场景切分引擎

## 标题
新增五类标准分场检测器 + 确定性场景切分引擎：location_shift / time_shift / flashback / montage / simultaneous。

## 功能描述
- **五类分场**：`location_shift`（地点变换）/ `time_shift`（时间跳跃）/ `flashback`（意识流闪回）/ `montage`（空间蒙太奇）/ `simultaneous`（多线同时）
- 每类分场有独立正则检测器，按优先级匹配
- `MIN_BEATABLE_CHARS=120`：低于此字数不允许切分（除闪回/蒙太奇等强信号）
- `ACCUMULATE_THRESHOLD=30`：低于此字数段落无条件累积
- `TARGET_SCENE_MIN=150` / `TARGET_SCENE_MAX=800`：目标场景字数区间
- `FORCE_SPLIT_CHARS=3000`：硬上限强制切分
- 每场输出 `segmentation_reason`：切分原因 + 标记词 + 得分

## 实现思路
- `SceneSegmentationDetector.detect(text)` 返回 (timeline_mode, location_hint, markers)
- `_segment(chapters)` 滑动窗口累积段落，达到目标字数且有信号时切分
- 短段落（<30 字）无条件合并到前一场景
- DeepSeek 仅用于前 3 场元数据润色（可选、失败不影响）
- `source_paragraphs` 追踪每场合并了哪些原始段落

## 测试方式
```python
# 提交碎段落小说 → 场次数 << 段落数
# 验证每场 raw_scene_text_block >= 80 字
# 验证 timeline_mode 正确检测
# 验证 source_paragraphs 记录合并来源
```

## 依赖
PR-05（Cognitive Kernel）, PR-06（BaseAgent）

---
**Status: Submitted** | Branch: `pr/PR-07-scene-segmentation`
