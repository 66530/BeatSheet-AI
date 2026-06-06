# PR-14: 自动化评测框架 + 金标准数据集

## 标题
新增 pytest 自动化评测框架 + 2 篇精标小说金标准数据集。

## 功能描述
- **F1 场景切分评测**：`calculate_f1(predicted, gold, tolerance=2)` — 断言 F1 >= 0.88
- **角色消歧准确率**：`check_entity_map_accuracy(predicted, gold)` -> {accuracy, errors}
- **角色一致性泄漏检测**：`calculate_character_leakage(constraints, elements)` — 断言 leakage = 0
- **节拍因果链完整性**：`validate_beat_causality(beats)` -> {completeness, invalid_beats}
- **ROUGE-L 文本相似度**：`calculate_rouge_l(predicted, reference)` LCS-based F1
- novel_001（真假千金）+ novel_002（星际迷航）精标实体/场景/节拍 JSON
- 19 个 pytest 自动化断言

## 实现思路
- `app/core/metrics.py` 纯函数实现所有指标（无 IO / 无 DB / 无 LLM）
- 金标准数据存储为 JSON：`entities.json` / `scenes.json` / `beats.json`
- pytest 参数化测试覆盖：F1/消歧/泄漏/因果链/ROUGE-L/Kernel 集成/Agent Stub

## 测试方式
```bash
cd ai_nuss_backend
pytest tests/test_evaluation_framework.py -v
# 预期: 19 passed
```

## 依赖
PR-05~PR-10（核心引擎 + Agent 层）
