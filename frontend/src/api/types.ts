/**
 * 与后端 Pydantic schema 对齐的 TypeScript 接口
 * 同步源:
 *   backend/app/schemas/{job,resume,analysis,config}.py
 *
 * 命名约定:
 *   - 后端 *Create / *Response / *Update 直接映射为同名 TS interface
 *   - 时间字段统一为 ISO 8601 string（FastAPI 默认序列化）
 */

// ─── Job ───────────────────────────────────────────
export interface JobCreate {
  source_url?: string | null
  company?: string | null
  position?: string | null
  salary_min?: number | null
  salary_max?: number | null
  location?: string | null
  raw_text: string
  structured_json?: Record<string, unknown> | null
}

export interface JobResponse {
  id: number
  source_url: string | null
  company: string | null
  position: string | null
  salary_min: number | null
  salary_max: number | null
  location: string | null
  raw_text: string | null
  structured_json: Record<string, unknown> | null
  created_at: string
}

/** GET /api/jobs/preview — 仅抓取，不写库（Phase 4 新增） */
export interface JobPreviewResponse {
  source_url: string
  raw_text: string
}

/** POST /api/jobs/extract — LLM 从粘贴的 JD 文本抽取关键字段（§8.17） */
export interface JobExtractRequest {
  raw_text: string
}

export interface JobExtractResponse {
  ok: boolean
  position: string | null
  company: string | null
  salary_min: number | null
  salary_max: number | null
  location: string | null
  /** ok=false 时的失败原因截断字符串 */
  error: string | null
  /** 本次抽取使用的模型名（前端调试展示用，可能为 null 当 build_provider 失败时） */
  model: string | null
}

// ─── Resume ────────────────────────────────────────
export interface ResumeResponse {
  id: number
  filename: string
  storage_path: string
  structured_json: Record<string, unknown> | null
  /** Phase 5 §8.36: marks structured_json schema. Null for legacy rows
   *  (pre-Phase-5 ad-hoc dict); 'json-resume-1.0.0+resumeai' for new uploads. */
  schema_version: string | null
  raw_text: string | null
  /** Phase 5 §8.36 A11: replaces ``<!--lh:1.7-->`` HTML comment hack.
   *  Null = use default 1.7 (the frontend parser falls back to legacy
   *  comment if the html still contains one, until the user changes it). */
  line_height: number | null
  vector_ptr: string | null
  created_at: string
}

// ─── JSON Resume Schema (Phase 5 §8.36) ────────────────────────

/** JSON Resume v1.0.0 + resume-AI 扩展（basics.desiredSalary / basics.desiredLocation）。
 *  https://jsonresume.org/schema/
 */
export interface JsonResume {
  meta?: { schema_version?: string; canonical?: string; section_order?: string[] }
  basics: ResumeBasics
  work: ResumeWork[]
  education: ResumeEducation[]
  projects: ResumeProject[]
  skills: ResumeSkill[]
  customSections?: ResumeCustomSection[]
  languages?: ResumeLanguage[]
  certificates?: ResumeCertificate[]
  awards?: ResumeAward[]
  publications?: unknown[]
  interests?: unknown[]
  references?: unknown[]
  volunteer?: unknown[]
}

/** 自定义区块 — Escape Hatch（§8.39） */
export interface ResumeCustomSection {
  title: string
  content: string
}

export interface ResumeBasics {
  name: string
  email: string
  phone: string
  url: string
  summary: string
  location: ResumeLocation
  profiles: ResumeProfile[]
  /** resume-AI 扩展：仅由用户填写，AI 永远不可写入 */
  desiredSalary: string | null
  desiredLocation: string | null
  /** 头像（Phase 5 §8.36 简化版头像处理） */
  image?: string | null
}

export interface ResumeLocation {
  city: string
  region: string
  countryCode: string
  address?: string
  postalCode?: string
}

export interface ResumeProfile {
  network?: string
  username?: string
  url?: string
}

export interface ResumeWork {
  name: string                  // 公司
  position: string              // 职位
  startDate: string             // YYYY 或 YYYY-MM
  endDate: string               // 同上，空字符串 = 至今
  url: string
  summary: string               // ✅ AI 可写
  highlights: string[]          // ✅ AI 可写
  /** Phase 7 §8.48: 用户自定义标签，用于 AI Entry Scorer 匹配 */
  tags?: string[]
}

export interface ResumeEducation {
  institution: string
  studyType: string             // 学位
  area: string                  // 专业
  startDate: string
  endDate: string
  url: string
  score: string                 // ✅ AI 可写（GPA / 排名等描述性）
  summary: string               // ✅ AI 可写（在校经历、课程、奖项等）
  courses: string[]
  /** Phase 7 §8.48: 用户自定义标签，用于 AI Entry Scorer 匹配 */
  tags?: string[]
}

export interface ResumeProject {
  name: string
  description: string           // ✅ AI 可写
  highlights: string[]          // ✅ AI 可写
  keywords: string[]            // ✅ AI 可写（追加新关键词，但不改既有）
  startDate: string
  endDate: string
  url: string
  roles: string[]
  entity: string
  type: string
  /** Phase 7 §8.48: 用户自定义标签，用于 AI Entry Scorer 匹配 */
  tags?: string[]
}

export interface ResumeSkill {
  name: string                  // ❌ AI 不可改名
  level: string                 // ❌ AI 不可改 level
  keywords: string[]            // ✅ AI 可改 keywords
}

export interface ResumeLanguage {
  language: string
  fluency: string
}

export interface ResumeCertificate {
  name: string
  date: string
  issuer: string
  url: string
}

export interface ResumeAward {
  title: string
  date: string
  awarder: string
  summary: string               // ✅ AI 可写
}

/** 是否 Phase 5 新格式简历（schema_version 已设置 + structured_json 含 basics 字段） */
export function isJsonResumeFormat(r: ResumeResponse): boolean {
  return Boolean(
    r.schema_version &&
    r.structured_json &&
    typeof r.structured_json === 'object' &&
    'basics' in r.structured_json
  )
}

/** Phase 5 §8.36 A5: AI patch 单条 */
export interface ResumePatch {
  /** JSON Resume path，例 "work[0].summary" — 必须在白名单内 */
  path: string
  /** 新值（string 或 string[]） */
  new_value: string | string[]
}

/** PATCH /api/resumes/{id}/structured 响应 */
export interface ResumePatchResponse {
  resume: ResumeResponse
  applied_count: number
  rejected: Array<{
    patch: { path?: string; new_value?: unknown }
    reason: string
  }>
}

// ─── Analysis ──────────────────────────────────────

/** §8.34 Phase B — 三层评估模型 */
export type GateStatus = 'pass' | 'fail' | 'unknown'
export type CoreLevel = 'high' | 'medium' | 'low'
export type NegotiableStatus = 'matched' | 'negotiable' | 'gap_too_large' | 'unknown' | 'remote_ok' | 'relocation_needed' | 'exceeds' | 'met' | 'below'
export type SeekerAction = 'strong_apply' | 'apply' | 'gap_fill_first' | 'mismatch'
export type RecruiterAction = 'interview' | 'shortlist' | 'reject' | 'uncertain'

export interface AssessmentGate {
  must_skills: GateStatus
  experience: GateStatus
  hard_constraints: GateStatus
}

export interface AssessmentCore {
  skill_depth: CoreLevel
  skill_evidence: string[]
  experience_quality: CoreLevel
  experience_evidence: string[]
  overall_fit: CoreLevel
  overall_rationale: string
}

export interface NegotiableItem {
  status: NegotiableStatus
  detail: string
}

export interface AssessmentNegotiable {
  salary: NegotiableItem
  location: NegotiableItem
  education: NegotiableItem
}

export interface AssessmentVerdict {
  action: SeekerAction | RecruiterAction
  gaps?: string[]
  concerns?: string[]
}

export interface Assessment {
  gate: AssessmentGate
  core: AssessmentCore
  negotiable: AssessmentNegotiable
  verdict: AssessmentVerdict
}

/** Phase 5 §8.36 A4: action_items 升级为 path-based。
 *  老分析记录可能是 LegacyActionItem（带 target_text）；前端需双格式兼容。
 */
export interface ActionItem {
  priority: 'high' | 'medium' | 'low'
  path: string
  issue: string
  rewritten?: string
  new_value?: string | string[]
}

/** §8.34 旧格式（pre-§8.36），DiffModal 等老 UI 仍读这个；DB 中存量记录使用此结构。 */
export interface LegacyActionItem {
  priority: 'high' | 'medium' | 'low'
  target_text: string
  issue: string
  rewritten: string
  _legacy?: boolean
}

/** 双格式守卫：判断单条 action_item 是新（path）还是旧（target_text） */
export function isPathActionItem(item: unknown): item is ActionItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'path' in item &&
    typeof (item as { path: unknown }).path === 'string'
  )
}

/** 兼容旧数据：dimension_scores_json 在 §8.34 后废弃，新数据为 null */
export interface AnalysisResult {
  id: number
  resume_id: number
  job_id: number
  base_score: number
  dimension_scores_json: Record<string, number> | null
  total_score: number
  /** §8.34 后废弃，action_items 改存 model_config_json */
  paragraph_suggestions_json: Array<{ target_text: string; issue: string; rewritten: string }> | null
  /** 后端字段名是 model_config_json (注意非 Pydantic 的 model_config)
   *  §8.34 后新增 assessment / information_gaps / action_items 等键
   */
  model_config_json: Record<string, unknown> | null
  created_at: string
}

// ─── Config ────────────────────────────────────────
export type ProviderType = 'ollama' | 'openai_compatible' | 'anthropic'

export interface LLMConfigResponse {
  provider_type: string
  base_url: string
  model_name: string
  temperature: number
  /** 后端不会回显 api_key 本身；仅用此字段告知"是否已配置过 key" */
  has_api_key: boolean
}

export interface LLMConfigUpdate {
  provider_type?: ProviderType
  base_url?: string
  api_key?: string
  model_name?: string
  temperature?: number
}

export interface RecommendedModelsResponse {
  providers: string[]
  models: Record<string, string[]>
}

// ─── Phase 4 — 模型预设切换 ─────────────────────────
export interface ModelOption {
  name: string
  label: string
  context_window: number | null
}

export interface LLMPreset {
  id: string
  label: string
  provider_type: ProviderType
  base_url: string
  requires_api_key: boolean
  hint: string
  models: ModelOption[]
  default_model: string
}

export interface PresetsResponse {
  presets: LLMPreset[]
  /** 当前生效 (provider_type, base_url) 匹配到的 preset id；null = 自定义 */
  active_preset_id: string | null
}

/** Phase 4 — 自定义预设槽位（最多3个） */
export interface CustomPreset {
  id: string
  name: string
  provider_type: ProviderType
  base_url: string
  model_name: string
  temperature: number
}

export interface CustomPresetsResponse {
  presets: CustomPreset[]
  max_slots: number
}

export interface TestConnectionResponse {
  ok: boolean
  model: string | null
  /** 模型回包前 80 字符预览（仅 ok=true 时） */
  preview: string | null
  /** 失败原因截断字符串（仅 ok=false 时） */
  error: string | null
}

// ─── Health ────────────────────────────────────────
export interface HealthResponse {
  status: 'ok' | string
  app: string
}
