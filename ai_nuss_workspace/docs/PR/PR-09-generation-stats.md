# PR-09: GenerationStats 统计 + 覆盖率检查 + Scene Health Dashboard

## 标题
新增 GenerationStats / SceneBeatStatus / 覆盖率检查 / Scene Health Dashboard。

## 功能描述
- `SceneBeatStatus`：每场景独立状态（PENDING/RUNNING/SUCCESS/FAILED/SKIPPED）+ token/latency
- `GenerationStats`：total/generated/failed/skipped/tokens/latency/coverage
- **覆盖率判定**：>=90% COMPLETED / >=50% PARTIAL_SUCCESS / <50% FAILED
- per-scene 日志：scene_id / status / tokens / latency / error
- **Scene Health Dashboard**：avg_chars / avg_beats / empty_scene_rate / dialogue_density / quality_avg / grade_distribution
- 前端 7 指标面板 + completed_partial 状态提示

## 实现思路
- `@dataclass` + `field(default_factory=...)` 轻量统计容器
- `_compute_health(scenes)` 聚合全场景质量指标
- processor 读取 `_completion_status` 决定 job 终态

## 测试方式
```python
stats = result["stats"]
assert stats["coverage"] >= 0
assert "scene_health" in stats
assert stats["scene_health"]["avg_chars"] > 0
```

## 依赖
PR-08（ScreenplayAgent）
