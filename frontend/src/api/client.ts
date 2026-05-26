import type {
  JobCreate, JobResponse, JobPreviewResponse,
  JobExtractRequest, JobExtractResponse,
  ResumeResponse,
  JsonResume, ResumePatch, ResumePatchResponse,
  AnalysisResult,
  LLMConfigResponse, LLMConfigUpdate, RecommendedModelsResponse,
  PresetsResponse, CustomPresetsResponse, CustomPreset, TestConnectionResponse,
  HealthResponse,
} from './types'

const DEFAULT_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8000' : ''

/**
 * baseUrl 优先级:
 *   1. import.meta.env.VITE_API_BASE_URL（构建/dev 时由 .env 注入）
 *   2. DEV 模式: http://127.0.0.1:8000（直连后端 uvicorn）
 *   3. 生产/Docker: ''（相对路径，走 nginx /api 反代）
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? DEFAULT_BASE

/** 后端返回非 2xx 时抛出此错误，业务层可 try/catch 取 status / body */
export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('resumeai_token')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function jsonRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
): Promise<T> {
  const headers = getAuthHeaders()
  let body: string | undefined
  if (payload !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(payload)
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers, body })
  const parsed = await parseBody(res)
  if (!res.ok) {
    throw new ApiError(res.status, parsed, `HTTP ${res.status} ${method} ${path}`)
  }
  return parsed as T
}

async function formRequest<T>(path: string, form: FormData): Promise<T> {
  const headers = getAuthHeaders()
  // 注意: 不要手动设置 Content-Type, fetch 会自动加 multipart boundary
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: form,
  })
  const parsed = await parseBody(res)
  if (!res.ok) {
    throw new ApiError(res.status, parsed, `HTTP ${res.status} POST ${path}`)
  }
  return parsed as T
}

/** 通用 HTTP 方法 */
export const http = {
  get:    <T = unknown>(path: string)                        => jsonRequest<T>('GET', path),
  post:   <T = unknown>(path: string, data?: unknown)        => jsonRequest<T>('POST', path, data),
  put:    <T = unknown>(path: string, data?: unknown)        => jsonRequest<T>('PUT', path, data),
  patch:  <T = unknown>(path: string, data?: unknown)        => jsonRequest<T>('PATCH', path, data),
  delete: <T = unknown>(path: string)                        => jsonRequest<T>('DELETE', path),
  postForm: <T = unknown>(path: string, form: FormData)      => formRequest<T>(path, form),
}

/** 业务领域端点（Phase 2a 起按需扩充） */
export const api = {
  health: () => http.get<HealthResponse>('/health'),

  jobs: {
    create: (data: JobCreate)         => http.post<JobResponse>('/api/jobs', data),
    list:   (limit = 50, offset = 0) => http.get<JobResponse[]>(`/api/jobs?limit=${limit}&offset=${offset}`),
    get:    (id: number | string)     => http.get<JobResponse>(`/api/jobs/${id}`),
    update: (id: number | string, data: JobCreate) => http.put<JobResponse>(`/api/jobs/${id}`, data),
    delete: (id: number | string)     => http.delete<{ ok: boolean }>(`/api/jobs/${id}`),
    /** Phase 4 新增: 从链接抓取 JD 正文，**不**写库（用于表单自动填充） */
    preview: (url: string)            => http.get<JobPreviewResponse>(`/api/jobs/preview?url=${encodeURIComponent(url)}`),
    /** 抓取 + 直接写库 (back-compat with Phase 3 一键抓取) */
    fetch:   (url: string)            => http.post<JobResponse>(`/api/jobs/fetch?url=${encodeURIComponent(url)}`, {}),
    /** §8.17: LLM 从粘贴的 JD 文本抽取 position/company/salary/location，失败时 ok=false 不抛 5xx */
    extract: (data: JobExtractRequest) => http.post<JobExtractResponse>('/api/jobs/extract', data),
  },

  resumes: {
    upload: (file: File, recordType?: string) => {
      const fd = new FormData()
      fd.append('file', file)
      const url = recordType
        ? `/api/resumes/upload?record_type=${encodeURIComponent(recordType)}`
        : '/api/resumes/upload'
      return http.postForm<ResumeResponse>(url, fd)
    },
    /** 创建空白简历（无文件上传），用于直接进入编辑器从零开始写。
     *  filename 可选，省略时后端用 "未命名简历"。 */
    createBlank: (filename?: string) =>
      http.post<ResumeResponse>('/api/resumes', filename ? { filename } : {}),
    list: (limit = 50, offset = 0, recordType?: string) =>
      http.get<ResumeResponse[]>(`/api/resumes?limit=${limit}&offset=${offset}${recordType ? `&record_type=${encodeURIComponent(recordType)}` : ''}`),
    get: (id: number | string) => http.get<ResumeResponse>(`/api/resumes/${id}`),
    delete: (id: number | string) => http.delete<{ ok: boolean }>(`/api/resumes/${id}`),
    update: (id: number | string, data: { filename: string }) =>
      http.put<ResumeResponse>(`/api/resumes/${id}`, data),
    /** Phase 5 §8.36 A11: 持久化行距到 Resume.line_height 字段（替代旧的
     *  ``<!--lh:1.7-->`` HTML 注释 hack）。范围 0.8-3.0，超出会被服务端拒绝。 */
    setLineHeight: (id: number | string, value: number) =>
      http.put<ResumeResponse>(`/api/resumes/${id}/line_height?value=${value}`),
    /** Phase 5 §8.36 A3: 完整替换 structured_json（JSON Resume schema）。 */
    saveStructured: (id: number | string, structured: JsonResume) =>
      http.put<ResumeResponse>(`/api/resumes/${id}/structured`, { structured_json: structured }),
    /** Phase 5 §8.36 A5: 应用 AI 生成的 path-based patches。
     *  服务端校验 path 白名单，拒绝越界写入；返回 applied/rejected 详情。 */
    patchStructured: (id: number | string, patches: ResumePatch[]) =>
      http.patch<ResumePatchResponse>(`/api/resumes/${id}/structured`, { patches }),
    /** Phase 5c: Playwright PDF export. Frontend sends rendered HTML; backend returns PDF blob. */
    exportPdf: async (id: number | string, html: string, filename: string, scale = 1.0) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const token = localStorage.getItem('resumeai_token')
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${API_BASE_URL}/api/resumes/${id}/export-pdf`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ html, filename, scale }),
      })
      if (!res.ok) {
        const parsed = await parseBody(res)
        throw new ApiError(res.status, parsed, `HTTP ${res.status} POST /api/resumes/${id}/export-pdf`)
      }
      return res.blob()
    },
  },

  /** Phase 7 §8.48: Seeker Master Pool + Snapshot generation */
  seekerPool: {
    get:    () => http.get<ResumeResponse>('/api/seeker/pool'),
    update: (structured: JsonResume) => http.put<ResumeResponse>('/api/seeker/pool', { structured_json: structured }),
    import: (resumeId: number, selectedEntryIds: string[]) =>
      http.post<ResumeResponse>('/api/seeker/pool/import', { resume_id: resumeId, selected_entry_ids: selectedEntryIds }),
    analyze: (jobId: number) =>
      http.post<{ analysis_id: number; strategy: unknown; selected: unknown[]; omitted: unknown[] }>('/api/seeker/analyze', { job_id: jobId }),
    previewGenerate: (jobId: number) =>
      http.post<{ analysis_id?: number; strategy: unknown; selected: unknown[]; omitted: unknown[] }>('/api/seeker/generate-preview', { job_id: jobId }),
    generate: (jobId: number, selectedEntryIds?: string[], polish?: boolean) =>
      http.post<{ snapshot_id: number; resume: ResumeResponse; strategy: unknown }>('/api/seeker/generate', { job_id: jobId, selected_entry_ids: selectedEntryIds ?? [], polish: polish ?? false }),
  },

  analysis: {
    create: (resumeId: number, jobId: number) =>
      http.post<AnalysisResult>(
        `/api/analyze?resume_id=${resumeId}&job_id=${jobId}`,
      ),
    list: (limit = 50, offset = 0, resumeId?: number, jobId?: number) => {
      let url = `/api/analyze?limit=${limit}&offset=${offset}`
      if (resumeId != null) url += `&resume_id=${resumeId}`
      if (jobId != null) url += `&job_id=${jobId}`
      return http.get<AnalysisResult[]>(url)
    },
    get: (id: number | string) => http.get<AnalysisResult>(`/api/analyze/${id}`),
    delete: (id: number | string) => http.delete<{ ok: boolean }>(`/api/analyze/${id}`),

    batch: {
      create: (jobId: number, resumeIds: number[], concurrency?: number) => {
        const ids = resumeIds.map((id) => `resume_ids=${id}`).join('&')
        const concParam = concurrency != null ? `&concurrency=${concurrency}` : ''
        return http.post<{ batch_id: string; status: string; total: number }>(
          `/api/analyze/batch?job_id=${jobId}&${ids}${concParam}`,
        )
      },
      get: (batchId: string) =>
        http.get<{
          batch_id: string
          job_id: number
          status: string
          total: number
          completed: number
          avg_score: number
          results: AnalysisResult[]
        }>(`/api/analyze/batches/${batchId}`),
      /** Bug 3 — 拉所有 batch 概要列表（按 created_at desc）.
       *  success_count = len(Analysis where batch_id=X)，识破 BE counter 撒谎. */
      list: (limit = 20, offset = 0) =>
        http.get<{
          batch_id: string
          job_id: number
          status: string
          total: number
          completed: number
          success_count: number
          created_at: string
        }[]>(`/api/analyze/batches?limit=${limit}&offset=${offset}`),
      /** Issue #003 ③: SSE 实时进度 URL — 返回字符串供 ``new EventSource(url)`` 使用。
       *  服务端 500ms 轮询 batch 状态，状态变化推 ``progress`` 事件，终态后推 ``done`` 关闭。
       *  事件 data 形如 ``{batch_id, completed, total, status}``。 */
      streamUrl: (batchId: string) =>
        `${API_BASE_URL}/api/analyze/batches/${batchId}/stream`,
      exportCSV: (batchId: string) =>
        http.get<string>(`/api/analyze/batches/${batchId}/export?format=csv`),
      delete: (batchId: string) =>
        http.delete<{ ok: boolean }>(`/api/analyze/batches/${batchId}`),
    },
  },

  ai: {
    polish: (text: string, instruction?: string) =>
      http.post<{ original: string; polished: string; before: string; after: string; model: string }>(
        `/api/ai/polish?text=${encodeURIComponent(text)}&instruction=${encodeURIComponent(instruction || '')}`,
      ),
  },

  config: {
    getLLM:         ()                       => http.get<LLMConfigResponse>('/api/config/llm'),
    updateLLM:      (data: LLMConfigUpdate)  => http.put<LLMConfigResponse>('/api/config/llm', data),
    getModels:      ()                       => http.get<RecommendedModelsResponse>('/api/config/models'),
    getPresets:     ()                       => http.get<PresetsResponse>('/api/config/presets'),
    getCustomPresets: ()                     => http.get<CustomPresetsResponse>('/api/config/custom-presets'),
    updateCustomPresets: (data: CustomPreset[]) => http.put<CustomPresetsResponse>('/api/config/custom-presets', data),
    testConnection: (body?: LLMConfigUpdate) => http.post<TestConnectionResponse>('/api/config/test', body ?? {}),
  },
}
