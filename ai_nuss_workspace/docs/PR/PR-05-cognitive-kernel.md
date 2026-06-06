# PR-05: Cognitive Kernel 纯函数统一执行内核

## 标题
新增 `execute_narrative_kernel_loop` 统一纯函数执行内核 + `compute_deterministic_scene_score` 五维加权分场运算。

## 功能描述
- `execute_narrative_kernel_loop(state, config_profile) → state` — 无 IO 纯函数管道
- 内联 Module 1-7：文档解析→故事圣经→角色消歧→场景切分→节拍提取→剧本生成→YAML 导出
- `compute_deterministic_scene_score(text, prev, weights)` — 五维加权评分：ΔL(地点) + ΔT(时间) + ΔN(叙事模式) + ΔO(目标) + ΔC(冲突)
- 评分 ≥ 阈值 0.60 → 切分新场次
- `MOCK_PATH` / `REAL_PATH` 物理隔离路由

## 实现思路
- 纯 Python 正则特征提取：`re.search` 扫描地点/时间/叙事/目标/冲突关键词
- 加权求和 + clamp [0, 1] → 输出 `{score, trace, verdict}`
- 管道步骤间通过 `_log_event` 原子追加审计日志
- 无数据库连接、无网络调用、无 LLM 依赖

## 测试方式
```python
from app.core.kernel import execute_narrative_kernel_loop
state = {"novel_id": "test", "review_status": "uploading", ...}
result = execute_narrative_kernel_loop(state, {"MOCK_MODE": True})
assert result["review_status"] == "completed"
assert len(result["scenes"]) > 0
```

## 依赖
PR-03（Schemas 层），独立于数据库
