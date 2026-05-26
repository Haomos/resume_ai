/**
 * BasicSection — Phase 5 §8.36 A8
 *
 * 渲染 JsonResume.basics 字段。设计原则：结构化字段（name/email/phone）走原生
 * <input>；summary 长文本走 <textarea>（暂用，5b 后期换 TipTap）。
 *
 * 字段属性矩阵（与 backend/app/services/patch_validator.py 白名单对齐）：
 *  ✅ AI 可写：summary
 *  ❌ AI 不可写：name / email / phone / url / location.* / desiredSalary /
 *               desiredLocation（这些字段仅由用户手动填写）
 *
 * desiredSalary / desiredLocation 是 resume-AI 扩展字段，给求职者主动声明
 * 期望值的入口 —— 解决 §8.35-fix LLM 编造 "12-15K 北京远程" 的问题：
 * 字段存在 → 用户填 → AI 不需要编造。
 */

import type { ResumeBasics } from '../../../../api/types'
import type { ResumeAction } from '../_hooks/useStructuredResume'
import { InlineSuggestion, type SuggestionItem } from '../InlineSuggestion'
import { MarkdownHint } from '../_utils/MarkdownHint'
import { memo } from 'react'
import { User } from 'lucide-react'

function BasicSectionComponent({
  basics,
  dispatch,
  suggestions,
  onApplySuggestion,
}: {
  basics: ResumeBasics
  dispatch: (action: ResumeAction) => void
  suggestions?: SuggestionItem[]
  onApplySuggestion?: (path: string, value: unknown) => void
}) {
  const setField = (path: string, value: unknown) => dispatch({ type: 'SET_FIELD', path, value })

  const handleImageFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => setField('basics.image', e.target?.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
          <User className="h-4 w-4 text-seeker-600 dark:text-seeker-400" strokeWidth={1.75} />
          基本信息
        </h2>
        <span className="text-[10px] text-slate-500">基本字段仅本人可编辑（AI 不会改写）</span>
      </header>

      {/* Avatar row */}
      <div className="mb-4 flex items-center gap-4">
        {basics.image ? (
          <img src={basics.image} alt="avatar" className="h-20 w-20 rounded-lg object-cover border border-slate-200" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
            无头像
          </div>
        )}
        <div className="flex-1 space-y-2">
          <Field
            label="头像链接（或粘贴图片 URL）"
            value={basics.image ?? ''}
            onChange={(v) => setField('basics.image', v || null)}
            placeholder="https://... 或上传文件"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
            className="block w-full text-xs text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-seeker-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-seeker-700 hover:file:bg-seeker-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="姓名 *" value={basics.name} onChange={(v) => setField('basics.name', v)} placeholder="张三" />
        <Field label="邮箱" value={basics.email} onChange={(v) => setField('basics.email', v)} placeholder="zhangsan@example.com" type="email" />
        <Field label="电话" value={basics.phone} onChange={(v) => setField('basics.phone', v)} placeholder="138-0000-0000" type="tel" />
        <Field label="个人主页 / GitHub" value={basics.url} onChange={(v) => setField('basics.url', v)} placeholder="https://github.com/..." />
        <Field
          label="所在城市"
          value={basics.location?.city ?? ''}
          onChange={(v) => setField('basics.location.city', v)}
          placeholder="北京"
        />
        <Field
          label="期望薪资"
          value={basics.desiredSalary ?? ''}
          onChange={(v) => setField('basics.desiredSalary', v || null)}
          placeholder="例：30K-40K（选填，避免 AI 编造）"
        />
        <Field
          label="期望工作地点"
          value={basics.desiredLocation ?? ''}
          onChange={(v) => setField('basics.desiredLocation', v || null)}
          placeholder="例：北京 / 远程（选填）"
          fullWidth
        />
      </div>

      <div className="mt-4">
        <label htmlFor="basics-summary" className="block text-xs font-medium text-slate-700 dark:text-slate-300">个人简介</label>
        <p className="text-[10px] text-slate-500 mt-0.5">⚠️ AI 可改写此字段以更好对齐目标 JD（应用前请核对）</p>
        <textarea
          id="basics-summary"
          name="basics-summary"
          value={basics.summary}
          onChange={(e) => setField('basics.summary', e.target.value)}
          placeholder="一段 50-150 字的自我介绍：几年经验、核心技能、最有代表性的成就..."
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-seeker-500 focus:outline-none focus:ring-1 focus:ring-seeker-500 dark:border-slate-700 dark:bg-slate-950"
          style={{ minHeight: '100px' }}
        />
        <MarkdownHint />
        {/* §8.38 Inline AI suggestions for basics.summary */}
        {suggestions
          ?.filter((s) => s.path === 'basics.summary')
          .map((s, i) => (
            <InlineSuggestion
              key={s.path ?? `suggestion-${i}`}
              suggestion={s}
              onApply={() => onApplySuggestion?.(s.path!, s.rewritten ?? '')}
              onRevert={() => onApplySuggestion?.(s.path!, basics.summary)}
            />
          ))}
      </div>
    </section>
  )
}

export const BasicSection = memo(BasicSectionComponent)

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  fullWidth = false,
  id,
  name,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  fullWidth?: boolean
  id?: string
  name?: string
}) {
  const fieldId = id ?? name ?? label.replace(/\s+/g, '-').toLowerCase()
  return (
    <div className={fullWidth ? 'md:col-span-2' : undefined}>
      <label htmlFor={fieldId} className="block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <input
        id={fieldId}
        name={name ?? fieldId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-seeker-500 focus:outline-none focus:ring-1 focus:ring-seeker-500 dark:border-slate-700 dark:bg-slate-950"
      />
    </div>
  )
}