import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import type { ResumeResponse, JsonResume } from '../../api/types'

/**
 * Extract selectable entry ids from legacy resume.
 * Phase 7: entries without id get a pseudo id "section-index" so the user
 * can still check/uncheck them. The backend import endpoint resolves these.
 */
function extractEntryIds(data: JsonResume | undefined | null): { ids: string[]; pseudoMap: Map<string, string> } {
  const ids: string[] = []
  const pseudoMap = new Map<string, string>() // pseudo id -> display label
  for (const section of ['work', 'projects', 'education', 'skills'] as const) {
    const list = (data?.[section] ?? []) as Array<{ id?: string; name?: string; institution?: string }>
    for (let i = 0; i < list.length; i++) {
      const item = list[i]
      if (item?.id) {
        ids.push(item.id)
      } else {
        const pseudoId = `${section}-${i}`
        ids.push(pseudoId)
        pseudoMap.set(pseudoId, item?.name || item?.institution || `${section} ${i + 1}`)
      }
    }
  }
  return { ids, pseudoMap }
}

function sectionLabel(section: string): string {
  const map: Record<string, string> = {
    work: '💼 工作经历',
    projects: '🚀 项目经历',
    education: '🎓 教育经历',
    skills: '🛠️ 技能',
  }
  return map[section] ?? section
}

function entryTitle(section: string, entry: Record<string, unknown>): string {
  if (section === 'work') return `${entry.name || '未命名公司'} · ${entry.position || ''}`
  if (section === 'projects') return `${entry.name || '未命名项目'}`
  if (section === 'education') return `${entry.institution || '未命名学校'} · ${entry.area || ''}`
  if (section === 'skills') return `${entry.name || ''}`
  return '未命名'
}

function entrySubtitle(section: string, entry: Record<string, unknown>): string {
  const dates = [entry.startDate, entry.endDate].filter(Boolean).join(' – ')
  if (section === 'work') return dates
  if (section === 'projects') return dates
  if (section === 'education') return `${entry.studyType || ''} ${dates ? '(' + dates + ')' : ''}`
  return ''
}

export function SeekerPoolImport() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillResumeId = searchParams.get('resume_id')

  const [step, setStep] = useState<'upload' | 'review' | 'importing'>('upload')
  const [uploaded, setUploaded] = useState<ResumeResponse | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)

  // Phase 7: 若 URL 带 ?resume_id=123，自动加载并进入 review
  useEffect(() => {
    if (!prefillResumeId) return
    let cancelled = false
    api.resumes.get(Number(prefillResumeId))
      .then((res) => {
        if (cancelled) return
        setUploaded(res)
        const { ids: allIds } = extractEntryIds(res.structured_json as unknown as JsonResume)
        setSelectedIds(allIds)
        setStep('review')
      })
      .catch((err) => {
        if (cancelled) return
        toast.error('加载简历失败: ' + (err instanceof Error ? err.message : 'unknown'))
      })
    return () => { cancelled = true }
  }, [prefillResumeId])

  const handleUpload = async (file: File) => {
    try {
      const res = await api.resumes.upload(file)
      setUploaded(res)
      const { ids: allIds } = extractEntryIds(res.structured_json as unknown as JsonResume)
      setSelectedIds(allIds)
      setStep('review')
    } catch (err) {
      toast.error('上传失败: ' + (err instanceof Error ? err.message : 'unknown'))
    }
  }

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleImport = async () => {
    if (!uploaded || selectedIds.length === 0) return
    setStep('importing')
    try {
      await api.seekerPool.import(uploaded.id, selectedIds)
      toast.success(`成功导入 ${selectedIds.length} 条经历到档案`)
      navigate('/seeker/pool')
    } catch (err) {
      toast.error('导入失败: ' + (err instanceof Error ? err.message : 'unknown'))
      setStep('review')
    }
  }

  const allIds = uploaded ? extractEntryIds(uploaded.structured_json as unknown as JsonResume).ids : []
  const isAllSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-seeker-600">求职者模式 · /seeker/pool/import</p>
        <h1 className="text-2xl font-semibold tracking-tight">从旧简历导入到档案</h1>
        <p className="text-xs text-slate-500">上传旧简历 PDF，AI 解析后勾选想保留的经历，一键合并入你的档案。</p>
      </header>

      {/* Step indicator */}
      <div className="flex gap-2 text-sm">
        {(['upload', 'review', 'importing'] as const).map((s, i) => (
          <span
            key={s}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              step === s
                ? 'bg-seeker-100 text-seeker-700 dark:bg-seeker-900/30 dark:text-seeker-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {i + 1}. {s === 'upload' ? '上传' : s === 'review' ? '审核勾选' : '导入'}
          </span>
        ))}
      </div>

      {step === 'upload' && (
        <div
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-colors ${
            dragOver
              ? 'border-seeker-400 bg-seeker-50 dark:border-seeker-500 dark:bg-seeker-900/20'
              : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) handleUpload(file)
          }}
        >
          <div className="mb-4 text-4xl">📤</div>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">拖拽 PDF 到这里，或点击上传</p>
          <label className="cursor-pointer rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700">
            选择文件
            <input
              type="file"
              accept=".pdf,.docx,.html,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
              }}
            />
          </label>
        </div>
      )}

      {step === 'review' && uploaded && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              已解析 <b>{allIds.length}</b> 条经历，选中 <b>{selectedIds.length}</b> 条
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedIds(isAllSelected ? [] : allIds)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {isAllSelected ? '取消全选' : '全选'}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {(['work', 'projects', 'education', 'skills'] as const).map((section) => {
              const list = (uploaded.structured_json?.[section] ?? []) as Array<Record<string, unknown>>
              if (list.length === 0) return null
              return (
                <div key={section}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{sectionLabel(section)}</h3>
                  <div className="space-y-2">
                    {list.map((entry, idx) => {
                      const id = entry.id ? String(entry.id) : `${section}-${idx}`
                      const checked = selectedIds.includes(id)
                      return (
                        <label
                          key={id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                            checked
                              ? 'border-seeker-200 bg-seeker-50 dark:border-seeker-800 dark:bg-seeker-900/20'
                              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-seeker-600 focus:ring-seeker-500"
                            checked={checked}
                            onChange={() => toggleId(id)}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{entryTitle(section, entry)}</p>
                            {entrySubtitle(section, entry) && (
                              <p className="text-xs text-slate-500">{entrySubtitle(section, entry)}</p>
                            )}
                            {Boolean(entry.summary || entry.description) && (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                                {String(entry.summary || entry.description || '').slice(0, 80)}…
                              </p>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => navigate('/seeker/pool')}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={selectedIds.length === 0}
              className="rounded-lg bg-seeker-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700 disabled:opacity-50"
            >
              导入选中项 ({selectedIds.length})
            </button>
          </div>
        </>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-seeker-200 border-t-seeker-600" />
          <p className="text-sm">正在导入到档案…</p>
        </div>
      )}
    </section>
  )
}
