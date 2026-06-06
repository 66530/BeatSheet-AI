# PR-03: Pydantic v2 进出站数据校验与三层输出契约

## 标题
新增 Pydantic v2 Schema 层：BaseOutputSchema 三层契约 + REST DTO + WebSocket 帧 + 领域实体 Schema。

## 功能描述
- `BaseOutputSchema<T>` — 统一三层出站契约：Success(T) / Fallback(Dict) / Error(code, msg)
- REST 端点的 Request/Response DTO：`NovelSubmitRequest/Response`, `JobStatusResponse`, `ReviewBibleCharacterRequest`, `ReviewScenesRequest`
- `WebSocketFrame` — WebSocket 报文帧结构 `{event, timestamp, payload}`
- 领域实体 Schema：`CharacterSchema`, `SceneSchema`, `BeatSchema`, `ScreenplayElementSchema`

## 实现思路
- `BaseOutputSchema` 使用 Pydantic v2 的 `Generic[T]` 泛型，每个 Agent 节点必须返回此结构
- `BaseModel` 的 `Field(...)` 强制必填字段校验
- REST DTO 使用 `Optional` + `Field(default_factory=...)` 提供合理默认值
- WebSocket 帧的 `timestamp` 自动填入 UTC ISO 格式

## 测试方式
```python
from app.schemas.workflow import BaseOutputSchema, NovelSubmitResponse
# 验证 BaseOutputSchema 三层字段均可正确序列化
# 验证 REST DTO 的必填/可选字段行为
```

## 依赖
无强依赖，可独立合并。
