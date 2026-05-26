# ResumeAI — 智能简历分析与优化平台

[English README](README_EN.md)

> 基于 LLM 的简历评估系统，支持**求职者模式**（1 份简历 vs N 个 JD）和**招聘者模式**（1 个 JD vs N 份简历）。内置用户认证，数据隔离，支持 BYOK 自定义 LLM。

## 核心特性

- 🔐 **用户认证**：JWT + bcrypt，支持注册/登录，数据完全隔离
- 🤖 **AI 深度分析**：LLM 评估简历与岗位的匹配度，给出可操作的改进建议
- 📝 **结构化编辑器**：基于 JSON Resume schema 的分节卡片式编辑，AI 建议一键应用到对应字段
- 📈 **批量评分**：招聘者模式支持并发分析多份简历，实时 SSE 进度推送
- 💾 **模板导出**：6 套 JSON Resume 主题 + Playwright PDF 导出（A4 / 智能一页）
- 🔧 **自定义 LLM 配置（BYOK）**：支持 OpenAI / Claude / Ollama 及任意兼容 OpenAI 的 API，每个用户独立配置

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS + Vite |
| 后端 | FastAPI + SQLAlchemy 2.0 (async) + Alembic |
| AI 引擎 | OpenAI / Claude / Ollama（统一 LLM Provider 接口） |
| 数据 | SQLite（开发）/ PostgreSQL（生产就绪） |
| 导出 | Playwright headless Chrome → PDF |

## 快速开始

> **只想快速 demo？** 直接看下面的 [🐳 Docker 部署](#-docker-部署一键启动) 一节，跳过 Python / Node 环境配置。

### 环境要求

- Python 3.11+
- Node.js 20+
- Conda（推荐）或 venv

### 1. 克隆并启动后端

```bash
cd backend
conda create -n resume_ai python=3.11
conda activate resume_ai
pip install -r requirements.txt          # 生产依赖
pip install -r requirements-dev.txt      # 开发依赖（pytest 等，可选）

# 初始化数据库
alembic upgrade head

# 启动服务
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 `http://localhost:5173/`。

### 3. 配置 LLM（首次使用必需）

进入设置页 `/settings`：
- **OpenAI**：填 API Key，选模型（gpt-4o / gpt-4o-mini）
- **Ollama**：填本地地址 `http://localhost:11434`，选已下载的模型
- **自定义**：支持任意 OpenAI-compatible API

## 🐳 Docker 部署（一键启动）

> **适合**：演示 / 评委 / 招聘方 / 想快速看 demo 的人。不需配 Python / Node 环境，只要本机装了 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（含 docker compose v2.24+）。

### 快速启动

```bash
git clone <repo>
cd resume_assistance
docker compose up -d --build
```

首次 build 约 **3-5 分钟**（拉镜像 + 装依赖），后续启动 **~30 秒**。完成后打开 `http://localhost`，进**设置页**填 LLM API key 即可使用（BYOK 模式，详见 [配置 LLM](#3-配置-llm首次使用必需)）。

镜像规模：
- `resumeai-backend` ~3GB（含 Playwright + Chromium，用于 PDF 导出）
- `resumeai-frontend` ~63MB（nginx:alpine + Vite 打包后的 SPA）

### 预配置（可选 — 自动化部署）

如果想跳过"进 UI 配 key"那一步，提前把配置写在文件里：

```bash
cp .env.prod.example .env.prod
# 编辑 .env.prod，至少配 LLM_API_KEY，按需配 SECRET_KEY
docker compose up -d --build
```

`.env.prod.example` 里每个字段都有注释和示例（Moonshot / OpenAI / DeepSeek / Ollama 都有）。Web UI 里配的 key 优先级**高于** env（存 SQLite 加密），所以你既可以用 env 预注入，也可以用 UI 覆盖。

### 常用操作

```bash
docker compose ps                       # 查看容器状态
docker compose logs -f backend          # 实时看后端日志（Ctrl-C 退出）
docker compose logs -f frontend         # 实时看前端 nginx 日志
docker compose down                     # 停止（保留数据）
docker compose down -v                  # ⚠️ 停止 + 删数据卷（重置）
docker compose up -d --build            # 重启 / 应用配置更新
git pull && docker compose up -d --build   # 拉代码 + 重 build + 重启
```

### 端口冲突

如果本机 80 端口已被占用，改 `docker-compose.yml` 里 `frontend.ports`：

```yaml
frontend:
  ports:
    - "8080:80"   # 改左侧（宿主端口），右侧 80 是容器内 nginx 端口，别动
```

然后访问 `http://localhost:8080`。

### 国内 Docker Hub 拉镜像慢/失败

国内访问 Docker Hub 常被拦。Docker Desktop → **Settings → Docker Engine**，加 registry 镜像源：

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://dockerproxy.com",
    "https://docker.nju.edu.cn"
  ]
}
```

保存后 Docker Desktop 会重启 daemon，再 `docker compose up -d --build`。

### 架构说明

```
┌─────────────────────────────────────────────────┐
│                  你的浏览器                       │
│              http://localhost                    │
└────────────────────┬────────────────────────────┘
                     │
                     ▼  port 80
┌─────────────────────────────────────────────────┐
│  frontend (nginx:alpine)                        │
│  - 静态 serve /usr/share/nginx/html (Vite dist) │
│  - 反代 /api/* → http://backend:8000            │
│  - SSE 长连接支持 (proxy_buffering off)         │
└────────────────────┬────────────────────────────┘
                     │  docker network: resumeai_net
                     ▼  service-name DNS: backend
┌─────────────────────────────────────────────────┐
│  backend (FastAPI + Playwright)                 │
│  - uvicorn :8000 (not exposed to host)          │
│  - 启动时跑 alembic upgrade head                 │
│  - 读写 /app/data (named volume)                │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │ resumeai_data   │  ← named volume (持久化)
            │  /app/data/     │
            │   ├── *.db      │  SQLite 数据库
            │   └── uploads/  │  用户上传的简历
            └─────────────────┘
```

**关键设计**：
- backend `:8000` **不对外暴露**，只在 docker network 内可达 → 所有外部请求必经 nginx 反代，自带一层 sandbox
- DB + 上传文件存在 named volume `resumeai_data` → `docker compose down` 不会丢数据；`docker compose down -v` 才会清空
- `depends_on: condition: service_healthy` → frontend 等 backend healthcheck 通过（alembic 跑完）才启动，避免 502 窗口

## 双模式架构

```
┌─────────────┐     ┌─────────────┐
│  求职者模式  │     │  招聘者模式  │
│  /seeker/*  │     │ /recruiter/*│
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │
         ┌───────┴───────┐
         │  Analysis 表  │  ← 多对多关联
         │  (简历 vs 岗位) │
         └───────┬───────┘
                 │
       ┌─────────┴─────────┐
       │   LLM Provider    │
       │  (可切换/自定义)   │
       └───────────────────┘
```

### 求职者流程

1. 上传简历（PDF / DOCX / TXT）
2. 编辑器自动解析为 JSON Resume 结构化数据
3. 选择目标岗位 JD（手动录入或链接抓取）
4. AI 分析 → 查看评分、优势、不足、改进建议
5. 带着建议回到编辑器 → 一键应用 AI 改写
6. 预览模板 → 导出 PDF

### 招聘者流程

1. 录入岗位 JD
2. 批量上传简历（最多 50 份）
3. 后台并发评分，SSE 实时看进度
4. 排行榜查看排名、导出 CSV

## 项目结构

```
backend/
  app/
    routers/          # API 路由（auth, jobs, resumes, analyze, config, seeker）
    models/           # SQLAlchemy ORM（7 表：users, resumes, jobs, analyses, batches, system_config...）
    schemas/          # Pydantic 校验
    services/         # 核心业务（analyzer, parser, patch_validator, pdf_renderer）
  alembic/versions/   # 数据库迁移

frontend/
  src/
    modes/
      seeker/         # 求职者模式页面
      recruiter/      # 招聘者模式页面
    templates/        # JSON Resume 主题库（6 套）
    shared/           # 通用组件（AssessmentCard, Skeleton, EmptyState）
    context/          # 全局状态（ConfigContext, ModeContext）
```

## 开发指南

### 代码规范

- 单文件 < 500 行；超过必须拆分
- 前端 ESLint 0 problems（`npm run lint`）
- 后端 160/160 tests pass（`pytest`）
- TypeScript `noEmit` 干净

### 添加新的 JSON Resume 主题

1. 在 `frontend/src/templates/` 新建目录
2. 实现 `renderJsonResume(resume: JsonResume) => string`（返回 HTML）
3. 在 `frontend/src/templates/index.ts` 注册主题

### 后端测试

```bash
cd backend
pytest -x -q
```

### 数据库迁移

```bash
cd backend
alembic revision --autogenerate -m "describe_change"
alembic upgrade head
```

## 用户认证

系统内置基于 JWT 的用户认证。首次访问需要注册账号：

1. 访问 `http://localhost/register` 创建账号
2. 登录后所有数据（简历、岗位、分析记录）自动隔离
3. 支持 BYOK（Bring Your Own Key）——每个用户可独立配置自己的 LLM API Key

## 许可

MIT License
