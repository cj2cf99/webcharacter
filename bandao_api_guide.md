# 半岛 API (BandaoAPI) - DeepSeek Flash 调用说明文档

本文档介绍如何使用用户环境变量中的 `bandao_api_key` 调用半岛中转站提供的 `deepseek-v4.1-flash` 模型，并将其深度思考等级设置为 `low`。

---

## 1. 基础配置信息

| 配置项 | 参数值 / 说明 |
| :--- | :--- |
| **API Base URL** | `https://sub.bandaoapi.com/v1` |
| **API Key** | 存储在系统用户环境变量：`bandao_api_key` |
| **模型名称 (Model)** | `deepseek-v4.1-flash` （备选版本：`deepseek-v4.1-flash-261017`） |
| **协议格式** | 标准 OpenAI 兼容协议 (Chat Completions API) |

---

## 2. 深度思考参数说明

半岛中转站对 `deepseek-v4.1-flash` 模型支持 **OpenAI 规范的 `reasoning_effort` 参数**：

| 参数名 | 取值 | 说明与行为 |
| :--- | :--- | :--- |
| `reasoning_effort` | *(不传或省略)* | **关闭深度思考**，模型直接生成最终回复，不产生思考 tokens。 |
| `reasoning_effort` | `"low"` | **轻度思考 (推荐)**，思考时间极短，token 开销低，快速给出经过简单推理的高质量答案。 |
| `reasoning_effort` | `"medium"` | **中度思考**，平衡思考深度与响应延迟。 |
| `reasoning_effort` | `"high"` | **重度思考**，耗费更多 token 进行复杂推理验证。 |

> [!NOTE]
> 开启深度思考后，返回的响应中会在 `message` 下新增 `reasoning_content` 字段，且 `usage.completion_tokens_details` 中会包含 `reasoning_tokens` 的消耗计数。

---

## 3. 调用示例

### 3.1 Python (使用官方 `openai` 库)

#### 同步调用模式 (非流式)

```python
import os
from openai import OpenAI

# 1. 初始化客户端
client = OpenAI(
    api_key=os.environ.get("bandao_api_key"),
    base_url="https://sub.bandaoapi.com/v1"
)

# 2. 发起对话请求并设置 reasoning_effort 为 low
response = client.chat.completions.create(
    model="deepseek-v4.1-flash",
    messages=[
        {"role": "user", "content": "9.11 和 9.8 哪个大？"}
    ],
    reasoning_effort="low"  # 👈 核心参数：设置深度思考为 low
)

message = response.choices[0].message

# 3. 获取思考过程与最终结果
if hasattr(message, "reasoning_content") and message.reasoning_content:
    print("=== [深度思考过程] ===")
    print(message.reasoning_content)

print("\n=== [模型回答] ===")
print(message.content)

# 4. 查看 Token 消耗
usage = response.usage
print(f"\n[消耗统计] 总消耗: {usage.total_tokens} tokens, 其中思考消耗: {usage.completion_tokens_details.reasoning_tokens} tokens")
```

#### 流式调用模式 (Streaming)

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("bandao_api_key"),
    base_url="https://sub.bandaoapi.com/v1"
)

stream = client.chat.completions.create(
    model="deepseek-v4.1-flash",
    messages=[
        {"role": "user", "content": "写一首五言绝句赞美秋天。"}
    ],
    reasoning_effort="low",
    stream=True
)

print("=== 正在输出 ===")
for chunk in stream:
    delta = chunk.choices[0].delta
    # 思考内容增量
    if hasattr(delta, "reasoning_content") and delta.reasoning_content:
        print(f"[思考] {delta.reasoning_content}", end="", flush=True)
    # 正文内容增量
    if delta.content:
        print(delta.content, end="", flush=True)
print()
```

---

### 3.2 cURL (命令行直接调用)

#### Windows CMD / PowerShell

```bash
curl https://sub.bandaoapi.com/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %bandao_api_key%" ^
  -d "{\"model\":\"deepseek-v4.1-flash\",\"messages\":[{\"role\":\"user\",\"content\":\"9.11和9.8哪个大？\"}],\"reasoning_effort\":\"low\"}"
```

#### Linux / macOS (Bash)

```bash
curl https://sub.bandaoapi.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $bandao_api_key" \
  -d '{
    "model": "deepseek-v4.1-flash",
    "messages": [
      {"role": "user", "content": "9.11和9.8哪个大？"}
    ],
    "reasoning_effort": "low"
  }'
```

---

### 3.3 Node.js / TypeScript

```javascript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.bandao_api_key,
  baseURL: "https://sub.bandaoapi.com/v1",
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "deepseek-v4.1-flash",
    messages: [{ role: "user", content: "请简短分析量子计算的前景。" }],
    reasoning_effort: "low",
  });

  const msg = completion.choices[0].message;
  if (msg.reasoning_content) {
    console.log("=== 思考过程 ===\n", msg.reasoning_content);
  }
  console.log("=== 正文 ===\n", msg.content);
}

main();
```

---

## 4. 常见客户端软件配置指南

如果要在各类 AI 客户端（如 **Cherry Studio**、**Chatbox**、**NextChat**、**LobeChat**、**Cline** 等）中配置该模型：

| 配置栏目 | 填写内容 |
| :--- | :--- |
| **API 服务提供商** | 选择 `OpenAI` 或 `自定义 OpenAI 兼容接口` |
| **接口基础地址 (API Host / Base URL)** | `https://sub.bandaoapi.com/v1` |
| **API 密钥 (API Key)** | 粘贴你的 `bandao_api_key` 值（以 `sk-` 开头） |
| **模型名称 (Model ID)** | 输入 `deepseek-v4.1-flash` 并添加 |
| **推理强度 / 思考级别 (Reasoning Effort)** | 设为 `low`（部分客户端在高级设置或模型配置中） |

> [!TIP]
> 若客户端界面没有显式的 `reasoning_effort` 下拉选框，通常在高级设置的**“自定义请求参数 (Custom Body Parameters)”**中填入 JSON：
> ```json
> {
>   "reasoning_effort": "low"
> }
> ```

---

## 5. 常见问题排查

1. **401 Unauthorized**：
   * 检查环境变量 `bandao_api_key` 是否正确加载。在命令行可执行 `echo %bandao_api_key%` (CMD) 或 `$env:bandao_api_key` (PowerShell) 验证。
2. **响应中没有思考过程**：
   * 确保模型名称为 `deepseek-v4.1-flash`。
   * 确保传参字段名为 `reasoning_effort`，值为字符串 `"low"`，而非布尔值或数字。
