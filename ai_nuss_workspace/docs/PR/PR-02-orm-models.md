# PR-02: 数据库 ORM 物理表模型（全表多版本控制）

## 标题
新增 PostgreSQL 异步 ORM 模型：Novel / Character / EntityMap / Scene / Beat。

## 功能描述
- `Novel` — 小说元数据 + 原始文本 + 解析章节 JSON
- `Character` — 角色档案：规范名、别名、约束（信念/目标/情绪/冲突/禁忌）、置信度
- `EntityMap` — 别名→规范角色 ID 映射表
- `Scene` — 场次：地点、时间、叙事模式、冲突等级、情绪基调、切分原因追踪
- `Beat` — 节拍：类型（setup~resolution）、因果链、剧本元素 JSON
- **全表 `version` 字段**，支持多版本审计

## 实现思路
- SQLAlchemy 2.0 异步引擎 (`create_async_engine` + `async_sessionmaker`)
- 懒初始化引擎：模块导入时不创建数据库连接（保证冷启动 `/health` 可用）
- `DeclarativeBase` 抽象基类统一管理元数据
- `EntityMap` 独立建表，支持别名→ID 的快速 O(1) 查询
- Scene / Beat 的元数据字段使用 JSON 列类型，灵活存储嵌套结构

## 测试方式
```python
from app.models import Novel, Character, Scene, Beat
# 确认所有 ORM 类可正常导入，表结构符合 Schema 定义
# 验证每个表包含 version 字段
```

## 依赖
PR-01（FastAPI 骨架 + database.py 懒引擎）

---
**Status: Submitted** | Branch: `pr/PR-02-orm-models`
