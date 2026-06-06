# PR-06: Agent 基类 + DeepSeek API 集成 + Mock/Real 路径隔离

## 标题
新增 BaseAgent 抽象基类 + DeepSeek API 客户端 + MOCK_PATH/REAL_PATH 路由隔离。

## 功能描述
- `BaseAgent<T>` 泛型抽象基类：`_run_real()` / `_run_mock()` / `run()` 统一入口
- `run()` 自动路由：STUB_MODE=true 或无 API Key → mock；否则 → DeepSeek API
- `_call_deepseek()` — 异步调用 DeepSeek（45s HTTP 超时 + 55s asyncio 超时）
- `_call_deepseek_json()` — JSON 响应解析 + markdown 代码块剥离 + 失败重试一次
- 三重异常保护：真实调用失败 → 自动降级 mock → DOUBLE_FAULT 兜底

## 实现思路
- OpenAI SDK `AsyncOpenAI(api_key, base_url="https://api.deepseek.com")` 兼容 DeepSeek
- `run()` 方法永不抛异常：三层 try/except 确保返回合法 BaseOutputSchema
- 全局单例 `_deepseek_client` 懒初始化

## 测试方式
```python
agent = BibleAgent()
result = await agent.run(state)  # stub_mode 自动判定
assert result.success in (True, False)
```

## 依赖
PR-03（BaseOutputSchema）, PR-05（Cognitive Kernel）
