# PhotoHistory Demo 产品设计计划

## 上下文

为手机跨 App 修图场景设计一个照片版本管理工具。用户在手机上用多个修图 App（Snapseed → 美图秀秀 → Lightroom）依次处理同一张照片，每次保存产生一个新版本，相册中散落多条「看起来差不多但分不清关系」的图片。Demo 采用**项目制 + 微信传输 + 网页上传**的方式，后续会迭代引入版本树可视化和 AI Agent 辅助。

## 约束条件

1. **拒绝压缩图**：上传时检测图片是否为微信压缩版本（EXIF 丢失 / 分辨率异常下降 / 文件名 `mmexport`），若检测到则拒绝上传并提示用户发送原图。修图场景下压缩步骤不可接受。
2. **需要后端**：不能纯前端，需要有服务端处理 EXIF 解析、感知哈希计算、版本分组。
3. **UI 上传图片**：不读取用户本地文件夹，通过网页上传入口提交图片。
4. **项目制**：用户创建项目，手动选择需管理的照片加入项目。
5. **面向迭代**：架构需预留版本树可视化、AI Agent 集成的扩展空间。Demo 阶段不实现 AI 功能，但设计上确保后续可无缝接入。

## 架构设计原则（面向 AI 扩展）

从[可行性分析报告](./feasibility_analysis.md)中提炼的核心洞察，指导当前 Demo 的架构设计：

1. **AI 流水线路径**：「结构化差异数据 → LLM 自然语言描述」的两步流水线，而非直接把两张图丢给多模态模型。当前 Demo 需要产出结构化的差异数据（像素变化区域、颜色/亮度/对比度差值、结构相似度），作为后续喂给 LLM 的输入。
2. **置信度贯穿所有自动判断**：版本分组、质量检测、后续 AI 建议——每一个自动决策都要标注置信度（高/中/低），让用户建立正确的预期管理。
3. **差异计算引擎独立于 AI 层**：差异对比是确定性算法（OpenCV/pixelmatch），AI 描述是生成能力。两者解耦，差异数据可以独立使用（不花钱），也可以可选地喂给 AI 做增强描述。

## 推荐技术栈

```
前端:     React 18 + TypeScript + Vite + Tailwind CSS
后端:     Python FastAPI
          ├─ exifr 的 Python 对应: Pillow + piexif
          ├─ 感知哈希: imagehash 库 (pHash/dHash)
          └─ 图片验证: Pillow
存储:     SQLite (MVP) → PostgreSQL (迭代)
          ├─ 图片文件: 后端本地文件系统 (upload/{project_id}/)
          └─ 元数据: SQLite/PostgreSQL
文件上传:  multipart/form-data (标准 HTTP 上传)
API 风格:  RESTful, 为后续 Agent 预留 WebSocket/SSE 端点
```

## 项目结构

```
photohistory/
├── frontend/                  # React SPA
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ProjectList.tsx        # 首页：项目列表
│   │   │   ├── CreateProject.tsx      # 新建项目
│   │   │   └── ProjectDetail.tsx      # 项目详情（版本链）
│   │   ├── components/
│   │   │   ├── PhotoUpload.tsx        # 图片上传组件（拖拽+点击）
│   │   │   ├── VersionChain.tsx       # 版本链展示（当前线性，预留树接口）
│   │   │   ├── PhotoCompare.tsx       # 并排对比视图
│   │   │   └── QualityWarning.tsx     # 压缩图警告提示
│   │   ├── hooks/
│   │   │   └── useUpload.ts           # 上传逻辑封装
│   │   ├── api/
│   │   │   └── client.ts             # API 调用封装
│   │   ├── types/
│   │   │   └── index.ts              # 类型定义
│   │   └── App.tsx
│   └── ...
│
├── backend/                   # Python FastAPI
│   ├── main.py                # 应用入口
│   ├── config.py              # 配置
│   ├── models/
│   │   ├── project.py         # Project ORM 模型
│   │   └── photo.py           # Photo ORM 模型
│   ├── schemas/
│   │   ├── project.py         # Pydantic 请求/响应模型
│   │   └── photo.py
│   ├── routers/
│   │   ├── projects.py        # /api/projects
│   │   ├── photos.py          # /api/projects/{id}/photos
│   │   └── analysis.py        # /api/projects/{id}/analysis (触发分析)
│   ├── services/
│   │   ├── photo_ingest.py    # 图片接收、验证、存储
│   │   ├── exif_service.py    # EXIF 提取
│   │   ├── hash_service.py    # 感知哈希计算
│   │   ├── grouping.py        # 版本分组算法
│   │   └── quality_check.py   # 图片质量检测（拒绝压缩图）
│   ├── db.py                  # 数据库连接
│   └── uploads/               # 上传文件存储
│       └── {project_id}/
│           └── {photo_id}.jpg
│
└── README.md
```

## 数据库设计（面向迭代）

```sql
-- 项目表
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,        -- UUID
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 照片表（核心）
CREATE TABLE photos (
    id              TEXT PRIMARY KEY,        -- UUID
    project_id      TEXT NOT NULL REFERENCES projects(id),
    
    -- 文件信息
    original_name   TEXT NOT NULL,           -- 用户上传时的文件名
    stored_path     TEXT NOT NULL,           -- 后端存储路径
    file_size       INTEGER NOT NULL,        -- 字节
    mime_type       TEXT NOT NULL,
    resolution_w    INTEGER,
    resolution_h    INTEGER,
    
    -- EXIF 信息
    exif_datetime_original  TEXT,            -- DateTimeOriginal, ISO格式
    exif_make               TEXT,            -- 设备厂商
    exif_model              TEXT,            -- 设备型号
    exif_has_all            BOOLEAN DEFAULT TRUE,  -- EXIF是否完整
    
    -- 质量标记
    quality_status  TEXT DEFAULT 'ok',       -- ok | warning | rejected
    quality_reason  TEXT,                    -- 拒绝原因
    
    -- 感知哈希
    phash           TEXT,                    -- 十六进制感知哈希值
    dhash           TEXT,                    -- 差异哈希（主用）
    
    -- 上传信息
    uploaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 微信相关标记（迭代用）
    source_type     TEXT DEFAULT 'manual',   -- manual | wechat_original | wechat_compressed
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 版本关系表（为版本树预留）
CREATE TABLE version_relations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      TEXT NOT NULL REFERENCES projects(id),
    parent_photo_id TEXT REFERENCES photos(id),   -- NULL = 根版本
    child_photo_id  TEXT NOT NULL REFERENCES photos(id),
    relation_type   TEXT DEFAULT 'edit',          -- edit | branch | merge (为以后预留)
    confidence      REAL DEFAULT 1.0,             -- 置信度 0-1
    auto_detected   BOOLEAN DEFAULT TRUE,         -- 自动分组还是手动指定
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(parent_photo_id, child_photo_id)
);

-- 差异分析结果表（为 AI 描述预留）
CREATE TABLE diff_results (
    id              TEXT PRIMARY KEY,        -- UUID
    photo_a_id      TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    photo_b_id      TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    
    -- 整体指标
    ssim            REAL,                    -- 结构相似度
    pixel_diff_ratio REAL,                   -- 变化像素占比
    hamming_distance INTEGER,                -- 汉明距离
    
    -- 颜色变化
    brightness_delta REAL,
    contrast_delta   REAL,
    saturation_delta REAL,
    
    -- 变化区域（JSON 存储，格式见 DiffResult schema）
    diff_regions_json TEXT,                  -- JSON 数组，每项含 bbox/area/change_type
    
    -- 热力图文件
    heatmap_path    TEXT,                    -- 热力图存储路径
    
    -- Phase 3 补充字段
    ai_summary      TEXT,                    -- AI 自然语言描述（Phase 3 写入）
    ai_summary_model TEXT,                   -- 生成该描述的模型（Phase 3 写入）
    
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(photo_a_id, photo_b_id)
);
```

## API 设计

```
# ===== 项目管理 =====
GET    /api/projects                        # 列出所有项目
POST   /api/projects                        # 创建项目
GET    /api/projects/{id}                   # 获取项目详情（含版本链）
PUT    /api/projects/{id}                   # 更新项目
DELETE /api/projects/{id}                   # 删除项目

# ===== 照片管理 =====
POST   /api/projects/{id}/photos            # 上传照片（multipart）
       → 返回: photo对象 或 错误（压缩图拒绝）
GET    /api/projects/{id}/photos            # 列出项目内照片
GET    /api/projects/{id}/photos/{pid}      # 获取单张照片信息
DELETE /api/projects/{id}/photos/{pid}      # 删除照片

# ===== 分析 =====
POST   /api/projects/{id}/analyze           # 触发版本分析
GET    /api/projects/{id}/version-chain     # 获取版本链数据

# ===== 差异对比 =====
GET    /api/photos/{id}/diff/{other_id}     # 两张图的结构化差异数据（为 AI 描述准备）
       → 返回: DiffResult { pixel_diff, ssim, hsv_changes, diff_regions, ... }

# ===== 照片文件 =====
GET    /api/photos/{id}/file                # 获取原始文件（缩略图用 ?thumb=true&size=400）

# ===== AI 扩展预留（Phase 3 启用）=====
POST   /api/projects/{id}/ai/describe-diff  # AI 自然语言描述两张图的差异
POST   /api/projects/{id}/ai/suggest        # AI 分析建议（最佳版本/清理建议等）
WS     /api/projects/{id}/ws                # 实时分析进度推送
```

## 核心业务逻辑

### 1. 上传时的质量检测（quality_check.py）

```
检查流程:
  步骤1: 检查文件名
         → mmexport\d{13} 模式 → 标记来源为微信
         → 对微信来源的图片进入步骤2
  
  步骤2: 检查 EXIF 完整性
         → DateTimeOriginal 缺失 → REJECT
         → Make/Model 缺失 → WARN（部分App会保留时间但清除设备信息）
         → 全部正常 → 继续步骤3
  
  步骤3: 检查分辨率
         → 与同项目已有照片对比，若分辨率显著偏低（<80%）
           且为微信来源 → REJECT
  
  步骤4: 检查文件大小
         → 同尺寸下文件过小（JPEG 压缩率过高） → WARN

拒绝时返回:
  400 Bad Request
  {
    "error": "compressed_image",
    "message": "检测到该图片经过微信压缩，EXIF信息丢失/分辨率下降。请通过微信「原图」重新发送。",
    "details": {
      "reason": "exif_missing",       // exif_missing | resolution_drop | both
      "original_resolution": null,    // 如果能从文件名推断原分辨率
      "current_resolution": "1280x960"
    }
  }
```

### 2. 版本分组算法（grouping.py）

```
输入: 项目内所有 photos 的 {id, exif_datetime_original, dhash, resolution}
      ↓
步骤1: 按 DateTimeOriginal 分组
       → 完全相同的归为同一候选组
       → 每组内按上传时间排序
      ↓
步骤2: 候选组内用 dHash 验证
       → 组内两两计算汉明距离
       → 距离 ≤ 10（高阈值）→ 确认同源，置信度 HIGH
       → 距离 11-20（中等）    → 可能同源，置信度 MEDIUM
       → 距离 > 20              → 拆分到不同版本链
      ↓
步骤3: 未被分组到任何照片 → 单独成链，置信度 LOW
      ↓
步骤4: 组内排序
       → 按 DateTimeOriginal → uploaded_at 排序
       → 第一条 = 根版本（原图候选）
      ↓
步骤5: 写入 version_relations 表
       → 线性版本链: parent → child → child
       → 关系类型暂为 "edit"，为分支预留 "branch"
       → confidence 字段写入对应置信度（1.0 / 0.7 / 0.4）
      ↓
步骤6: 置信度汇总
       → 整条版本链的总体置信度 = min(所有边的 confidence)
       → 若总体置信度 ≤ 0.5，前端展示 ⚠️「低置信度，建议手动确认」

输出: 版本链列表 [{root_photo, versions: [...], overall_confidence: 0.7}]
```

### 3. 感知哈希实现（hash_service.py）

```python
import imagehash
from PIL import Image

def compute_dhash(image_path: str) -> str:
    """计算 64 位差异哈希"""
    img = Image.open(image_path).convert('L')  # 转灰度
    img = img.resize((9, 8), Image.LANCZOS)     # 缩放
    hash_val = imagehash.dhash(img, hash_size=8)
    return str(hash_val)

def hamming_distance(h1: str, h2: str) -> int:
    """计算两个哈希值的汉明距离"""
    a = int(h1, 16)
    b = int(h2, 16)
    return bin(a ^ b).count('1')
```

### 4. 结构化差异数据输出（diff 接口，为 AI 描述预留）

两张图片对比时，后端不仅生成可视化热力图，还输出一套结构化数据。这套数据在 Phase 1 直接展示给用户，在 Phase 3 将作为 LLM 描述的输入：

```python
# schemas/diff.py — DiffResult 数据结构
{
    "photo_a_id": "uuid",
    "photo_b_id": "uuid",
    
    # 整体指标
    "ssim": 0.92,                    # 结构相似度 (0-1, 1=完全相同)
    "pixel_diff_ratio": 0.087,       # 变化的像素占比
    "hamming_distance": 8,           # 汉明距离
    
    # 颜色变化（整体统计）
    "brightness_delta": +0.12,       # 亮度变化 (归一化, -1到+1)
    "contrast_delta": -0.05,         # 对比度变化
    "saturation_delta": +0.08,       # 饱和度变化
    
    # 变化区域（关键：这是喂给 LLM 的核心数据）
    "diff_regions": [
        {
            "bounding_box": {"x": 120, "y": 80, "w": 200, "h": 300},
            "area_ratio": 0.35,               # 区域占比
            "avg_pixel_change": 0.15,          # 区域内平均像素变化强度
            "change_type": "smoothing",        # smoothing | color_shift |
                                              # exposure_change | texture_change
            "semantic_hint": "面部区域"  # Phase 3 由 AI 补充语义标签
        },
        # ... 更多区域
    ],
    
    # 分辨率变化（检测是否被缩放）
    "resolution_change": {
        "from": "4000x3000",
        "to": "4000x3000",
        "same": True
    }
}
```

Demo 阶段的差异对比 API 返回这个结构，前端目前只消费 `pixel_diff_ratio` 和 `diff_regions` 来渲染热力图。Phase 3 时，整个结构直接喂给 LLM，无需重新计算。这就是**「差异性计算引擎」与「AI 描述层」解耦**的架构落地。

## 前端页面流程

```
首页                   新建项目                项目详情
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ 项目列表      │     │ 表单：        │     │ 上传区域          │
│              │     │ · 项目名称    │     │ [拖拽或点击上传]   │
│ [新建项目] ──┼──→  │ · 描述(可选)  │ ──→ │                  │
│              │     │              │     │ 已上传照片列表     │
│ 项目卡片 × N │     │ [创建]       │     │ · 缩略图          │
│ · 版本数     │     └──────────────┘     │ · EXIF状态        │
│ · 最近更新   │                          │ · 是不是原图      │
│ [打开] ──────┼─────────────────────────→│                  │
└──────────────┘                          │ [开始分析]        │
                                          │        ↓         │
                                          │ 版本链展示         │
                                          │ 原图→v1→v2→最终   │
                                          │                  │
                                          │ 并排对比(选中两个)  │
                                          └──────────────────┘
```

## 上传组件交互细节

```
┌────────────────────────────────────────────┐
│                                            │
│      ┌──────────────────────────┐          │
│      │                          │          │
│      │   拖拽照片到此处          │          │
│      │   或点击选择文件           │          │
│      │                          │          │
│      │   支持批量上传            │          │
│      │   单文件最大 50MB         │          │
│      │                          │          │
│      └──────────────────────────┘          │
│                                            │
│  📸 上传队列:                               │
│  ┌────────────────────────────────────┐    │
│  │ IMG_0001.jpg        4.2MB  ✅ 成功  │    │
│  │ IMG_0001_edit.jpg   4.5MB  ✅ 成功  │    │
│  │ IMG_beauty.jpg      1.2MB  ❌ 拒绝   │    │
│  │   ↳ 检测到压缩，请发送原图           │    │
│  └────────────────────────────────────┘    │
│                                            │
│  💡 提示：微信传输时请勾选「原图」           │
└────────────────────────────────────────────┘
```

## 迭代路线图

```
Phase 1 (本次 Demo) — 跑通版本管理闭环
├── 项目 CRUD
├── 图片上传 + 质量检测 + 拒绝压缩图
├── EXIF 提取 + 感知哈希计算
├── 版本分组 + 置信度标注 + 线性版本链展示
├── 并排对比 + 滑杆 Diff + 像素差异热力图
├── 结构化差异数据输出（为 AI 描述预留接口）
└── SQLite 存储

Phase 2 — 版本树 + 差异计算增强
├── 分支检测（同一版本分叉出两条编辑路径）
├── 版本关系可视化（React Flow 力导向图）
├── 手动调整版本关系（拖拽重连、拆分合并）
├── 版本标注（「最终版」「废稿」「待定」等标签）
├── BlazeDiff 替代 pixelmatch（WebAssembly，快 8 倍）
├── SSIM / MS-SSIM 感知质量指标
└── 差异数据持久化（diff_results 表，为 AI 积累结构化素材）

Phase 3 — AI 智能层
├── 关键技术路径：「结构化差异数据 → LLM 自然语言描述」
│   ├── 差异计算引擎（Phase 2 产出）→ 提取变化区域、颜色/亮度/
│   │   对比度差值、SSIM 等结构化指标
│   └── LLM 层（本 Phase 新增）→ 将结构化差异数据翻译为自然语言
│
├── 模型选型（按推荐顺序）：
│   1. GPT-5.x / Gemini 3.1 Pro — 云端主力，视觉理解强，成本高
│   2. Claude Opus 4.6 — 详细视觉描述，1M 上下文，备选
│   3. Qwen3.5-9B（Ollama 本地部署）— 免费、离线可用，做成本兜底
│   4. OmniDiff（ICCV 2025）— 专做图像差异描述，评估后决定是否替代两步流程
│
├── AI 功能项：
│   ├── 版本间差异自然语言描述（核心功能，接在差异对比页面上）
│   ├── 自动识别「最佳版本」（多维打分：清晰度/构图/曝光/个人偏好）
│   ├── 智能清理建议（判断中间版本是否可删 + 给出理由）
│   └── 自动归类未分组照片（低置信度版本的 AI 辅助判断）
│
├── 置信度系统升级：
│   ├── 所有 AI 输出均标注置信度 + 推理依据
│   └── 低置信度建议折叠展示，避免过度干扰用户
│
└── 可选增强（后续评估）：
    ├── AI 自然语言搜索（「找那张磨过皮但还没加滤镜的版本」）
    ├── 修图步骤反向推断（从两张图的差异推断用了什么滤镜/操作）
    └── 批量项目分析报告
```

## 验证方式

1. **上传原图**：准备 4 张同源不同版本的 JPG（均有完整 EXIF），逐一上传 → 确认全部通过质量检测
2. **上传压缩图**：用微信不勾原图发送一张 → 上传该压缩图 → 确认被拒绝并显示提示
3. **版本分组**：上传 4 张原图后触发分析 → 确认正确识别为同一版本链 → 排序正确
4. **并排对比**：选中任意两个版本 → 确认能并排展示
5. **删除照片**：删除其中一个版本 → 确认版本链自动更新
