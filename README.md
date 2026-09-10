# 📷 PhotoHistory

> 智能相似照片清理工具：上传照片、找出视觉上相近的版本，并在确认后清理不需要的副本。

<p align="center">
  <img src="assets/photohistory-overview.png" alt="PhotoHistory 智能照片清理界面示意图" width="900">
</p>

PhotoHistory 面向照片库中常见的“连拍、转存、修图前后、聊天软件压缩版”等场景。它通过感知哈希（dHash）、EXIF 元数据和照片质量信息进行分组，帮助你更快决定每组照片中该保留哪一张。

## 功能一览

| 功能 | 说明 |
| --- | --- |
| 相似照片扫描 | 以 dHash 感知哈希识别内容近似、但文件并不完全相同的照片。 |
| 智能分组与建议 | 将同源照片归组，结合 EXIF 与质量信息给出保留/删除建议。 |
| 批量清理 | 可逐张调整建议，再一次性执行清理；删除照片会先进入回收站。 |
| 图片对比与预览 | 在清理前并排比较两张照片，避免误删。 |
| 自然语言检索 | 可按设备、拍摄时间、尺寸、方向、来源等条件检索，例如“2026年6月的横图”“大于 10MB 的照片”。 |
| AI 助手 | 支持以对话方式分析和操作照片库；涉及删除等操作时要求用户确认。 |
| 清理记录 | 查询历史清理任务，并导出清理报告。 |

## 工作流程

```text
创建项目 → 上传照片 → 扫描相似组 → 查看/调整保留建议 → 确认清理 → 回收站与历史记录
```

## 技术架构

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite、Tailwind CSS |
| 后端 | FastAPI、SQLAlchemy、SQLite |
| 图像处理 | Pillow、ImageHash、piexif、NumPy |
| AI 对话 | Anthropic 或 OpenAI 兼容 API；SSE 流式响应 |
| 部署 | Docker Compose |

## 快速开始

### 方式一：Docker Compose（推荐）

1. 在项目根目录创建 `.env`，按需配置模型服务：

   ```env
   ANTHROPIC_API_KEY=你的密钥
   # 或使用 OpenAI 兼容服务
   # OPENAI_API_KEY=你的密钥
   # OPENAI_BASE_URL=https://api.openai.com/v1
   # PHOTOHISTORY_LLM_PROVIDER=openai_compat
   # PHOTOHISTORY_LLM_MODEL=你的模型名
   ```

   不使用 AI 助手时，密钥可以留空；照片上传、扫描和清理功能仍可使用。

2. 启动服务：

   ```bash
   docker compose up --build
   ```

3. 浏览器打开 [http://localhost:5173](http://localhost:5173)。后端健康检查地址为 [http://localhost:18000/api/health](http://localhost:18000/api/health)。

### 方式二：本地开发

需要 Python 3.12+ 与 Node.js 22+。

```bash
# 终端 1：后端
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

```bash
# 终端 2：前端
cd frontend
npm install
npm run dev
```

默认情况下，前端将 `/api` 请求代理到 `http://localhost:18000`。若以本地后端的 `8000` 端口运行，请在 `frontend/.env.local` 中设置：

```env
VITE_API_TARGET=http://localhost:8000
```

## 使用提示

- 支持 JPEG、PNG、HEIF/HEIC 与 TIFF；单个文件上限为 50 MB。
- 相似度分组是辅助判断，不会在扫描后自动删除文件；请在执行前检查每组建议。
- 删除后会先软删除，并由后台任务在约 30 分钟后清理过期文件；如需恢复，请尽快在回收站中操作。
- Agent 默认使用 Anthropic。若使用 OpenAI 或其他兼容接口，设置 `PHOTOHISTORY_LLM_PROVIDER=openai_compat`，并同时配置对应的模型与服务地址。

## 项目结构

```text
PhotoHistory/
├── assets/               # README 等文档使用的静态资源
├── backend/
│   ├── agent/            # 对话 Agent 与模型提供商适配
│   ├── mcp_server/       # MCP 工具服务
│   ├── routers/          # REST API 路由
│   └── services/         # 导入、EXIF、哈希、分组与清理逻辑
├── frontend/             # React 前端
├── docs/                 # 产品与技术文档
└── docker-compose.yml
```

## API 概览

后端启动后可访问 [OpenAPI 文档](http://localhost:18000/docs)。主要接口包括：

- `POST /api/projects/{project_id}/photos`：上传照片
- `POST /api/projects/{project_id}/cleanup/scan`：扫描相似照片
- `POST /api/projects/{project_id}/cleanup/execute`：执行确认后的清理
- `GET /api/projects/{project_id}/search?q=...`：自然语言条件检索
- `POST /api/agent/chat`：AI 助手 SSE 对话

## 文档

- [产品需求文档](docs/PRD.md)
- [可行性分析](docs/feasibility_analysis.md)
- [dHash 技术评估](docs/dhash_tech_evaluation.md)
- [Agent 体验增强方案](docs/agent_experience_enhancement.md)

---

这是一个仍在持续迭代中的 Web MVP。欢迎提交 Issue 或 PR，帮助它更可靠地整理每一张值得留下的照片。
