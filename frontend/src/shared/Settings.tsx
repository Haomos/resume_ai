import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { api, ApiError } from '../api/client'
import { useConfig } from '../hooks/useConfig'
import { PresetCard, CustomPresetCard, NewCustomCard } from './SettingsPresetCards'
import { SettingsForm, type FormState } from './SettingsForm'
import type {
  LLMConfigResponse,
  LLMConfigUpdate,
  LLMPreset,
  ProviderType,
  RecommendedModelsResponse,
  CustomPreset,
  TestConnectionResponse,
} from '../api/types'

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success'; config: LLMConfigResponse }
  | { status: 'error'; message: string }

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'done'; result: TestConnectionResponse }

function fromServer(c: LLMConfigResponse): FormState {
  return {
    provider_type: (c.provider_type as ProviderType) ?? 'openai_compatible',
    base_url: c.base_url,
    model_name: c.model_name,
    temperature: c.temperature,
    api_key: '',
  }
}

function fromCustomPreset(p: CustomPreset): FormState {
  return {
    provider_type: p.provider_type,
    base_url: p.base_url,
    model_name: p.model_name,
    temperature: p.temperature,
    api_key: '',
  }
}

function matchPreset(
  presets: LLMPreset[],
  provider_type: string,
  base_url: string,
): LLMPreset | null {
  const canon = (base_url || '').replace(/\/+$/, '')
  return (
    presets.find(
      (p) =>
        p.provider_type === provider_type && p.base_url.replace(/\/+$/, '') === canon,
    ) ?? null
  )
}

/**
 * Settings — /settings (跨模式共享)
 * Phase 4 增强：自定义预设最多保存3个 + Bug 1b 测试连接传 body
 */
export function Settings() {
  const { state, refresh, updateLLM } = useConfig()
  const [form, setForm] = useState<FormState | null>(null)
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [presets, setPresets] = useState<LLMPreset[] | null>(null)
  const [models, setModels] = useState<RecommendedModelsResponse | null>(null)
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([])
  const [activeCustomId, setActiveCustomId] = useState<string | null>(null)

  // 从外部 config 同步表单初始值（ConfigContext 加载完成后触发）
  // React 19: 这是外部系统→React state 的同步，属于 effect 合法用途
  useEffect(() => {
    if (state.status === 'ready' && form === null) {
      queueMicrotask(() => setForm(fromServer(state.config)))
    }
  }, [state, form])

  useEffect(() => {
    api.config.getPresets().then((r) => setPresets(r.presets)).catch(() => { toast.error('预设加载失败'); setPresets([]) })
    api.config.getModels().then(setModels).catch(() => { toast.error('模型列表加载失败'); setModels(null) })
    api.config.getCustomPresets().then((r) => setCustomPresets(r.presets)).catch(() => { toast.error('自定义预设加载失败'); setCustomPresets([]) })
  }, [])

  const activePreset = useMemo(() => {
    if (!form || !presets) return null
    // 若正在编辑某自定义预设，强制不匹配内置 preset，保证自定义卡片高亮
    if (activeCustomId) return null
    return matchPreset(presets, form.provider_type, form.base_url)
  }, [form, presets, activeCustomId])

  const applyPreset = useCallback((p: LLMPreset) => {
    setForm((prev) =>
      prev
        ? { ...prev, provider_type: p.provider_type, base_url: p.base_url, model_name: p.default_model }
        : prev,
    )
    setActiveCustomId(null)
    setSave({ status: 'idle' })
    setTest({ status: 'idle' })
  }, [])

  const applyCustomPreset = useCallback((p: CustomPreset) => {
    setForm(fromCustomPreset(p))
    setActiveCustomId(p.id)
    setSave({ status: 'idle' })
    setTest({ status: 'idle' })
  }, [])

  const createNewCustom = useCallback(() => {
    setForm((prev) =>
      prev
        ? { ...prev, provider_type: 'openai_compatible', base_url: '', model_name: '' }
        : prev,
    )
    setActiveCustomId(null)
    setSave({ status: 'idle' })
    setTest({ status: 'idle' })
  }, [])

  const handleChange = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))
    setSave({ status: 'idle' })
    setTest({ status: 'idle' })
  }, [])

  const onSave = async () => {
    if (!form) return
    setSave({ status: 'saving' })
    setTest({ status: 'idle' })

    const patch: LLMConfigUpdate = {
      provider_type: form.provider_type,
      base_url: form.base_url.trim(),
      model_name: form.model_name.trim(),
      temperature: form.temperature,
    }
    if (form.api_key.trim().length > 0) {
      patch.api_key = form.api_key.trim()
    }

    try {
      const config = await updateLLM(patch)
      setSave({ status: 'success', config })
      setForm((prev) => (prev ? { ...prev, api_key: '' } : prev))

      // Bug 1b 隐性修复：保存成功后同步 form 与 state.config（让 dirty 指示正确）
      // 实际上 updateLLM 已经通过 ConfigContext 更新了 state.config，
      // 但 form 仍保持用户编辑值。这里不需要强制 sync，因为用户可能继续编辑。

      // 自定义模式：同步保存到 customPresets（activeCustomId 存在 或 未命中内置 preset）
      if (activeCustomId !== null || activePreset === null) {
        const newPreset: CustomPreset = {
          id: activeCustomId ?? `custom_${Date.now().toString(36)}`,
          name: form.model_name.trim() || '未命名自定义',
          provider_type: form.provider_type,
          base_url: form.base_url.trim(),
          model_name: form.model_name.trim(),
          temperature: form.temperature,
        }
        setCustomPresets((prev) => {
          const idx = prev.findIndex((p) => p.id === newPreset.id)
          let next: CustomPreset[]
          if (idx >= 0) {
            next = [...prev]
            next[idx] = newPreset
          } else if (prev.length < 3) {
            next = [...prev, newPreset]
          } else {
            next = prev
          }
          api.config.updateCustomPresets(next).catch(() => { toast.error('保存自定义预设失败') })
          return next
        })
        if (!activeCustomId) {
          setActiveCustomId(newPreset.id)
        }
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `HTTP ${err.status} · ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body)}`
          : err instanceof Error
            ? err.message
            : 'unknown error'
      setSave({ status: 'error', message: msg })
    }
  }

  const onTest = async () => {
    if (!form) return
    setTest({ status: 'testing' })
    try {
      const result = await api.config.testConnection({
        provider_type: form.provider_type,
        base_url: form.base_url.trim(),
        model_name: form.model_name.trim(),
        temperature: form.temperature,
        ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
      })
      setTest({ status: 'done', result })
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `HTTP ${err.status}`
          : err instanceof Error
            ? err.message
            : 'unknown error'
      setTest({
        status: 'done',
        result: { ok: false, model: null, preview: null, error: msg },
      })
    }
  }

  const onReset = useCallback(() => {
    if (state.status === 'ready') {
      setForm(fromServer(state.config))
      setActiveCustomId(null)
      setSave({ status: 'idle' })
      setTest({ status: 'idle' })
    }
  }, [state])

  const handleDeleteCustom = useCallback((id: string) => {
    setCustomPresets((prev) => {
      const next = prev.filter((p) => p.id !== id)
      api.config.updateCustomPresets(next).catch(() => {})
      return next
    })
    if (activeCustomId === id) {
      setActiveCustomId(null)
    }
  }, [activeCustomId])

  if (state.status === 'loading' || form === null) {
    return (
      <section className="mx-auto max-w-3xl py-12 text-center text-slate-500">
        加载配置中...
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="mx-auto max-w-3xl space-y-4 py-12">
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          ❌ {state.message}
        </p>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-800"
        >
          重试
        </button>
      </section>
    )
  }

  const serverHasApiKey = state.status === 'ready' && state.config.has_api_key
  const isCustomActive = activePreset === null

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">系统设置 · /settings</p>
        <h1 className="text-2xl font-semibold tracking-tight">LLM Provider 配置</h1>
        <p className="text-sm text-slate-500">
          所有字段保存在本地{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">system_config</code> 表（SQLite）。
          api_key 永不在 GET 接口中回显。
        </p>
      </header>

      {/* Active state banner */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
        当前生效:
        <strong className="ml-1">{activePreset?.label ?? customPresets.find((p) => p.id === activeCustomId)?.name ?? '自定义'}</strong>
        <span className="ml-2 text-emerald-700/70 dark:text-emerald-300/70">
          · {state.config.model_name} · temp {state.config.temperature.toFixed(2)}
          {serverHasApiKey ? ' · 🔑 已配置' : ''}
        </span>
      </div>

      {/* Built-in presets */}
      {presets && (
        <div>
          <p className="mb-2 text-xs text-slate-500">快捷预设</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {presets.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                isActive={activePreset?.id === p.id}
                onClick={() => applyPreset(p)}
              />
            ))}
          </div>
          {activePreset && (
            <p className="mt-2 text-[11px] text-slate-400">{activePreset.hint}</p>
          )}
        </div>
      )}

      {/* Custom presets */}
      <div>
        <p className="mb-2 text-xs text-slate-500">
          我的自定义配置 ({customPresets.length}/3)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {customPresets.map((p) => (
            <CustomPresetCard
              key={p.id}
              preset={p}
              isActive={isCustomActive && activeCustomId === p.id}
              onClick={() => applyCustomPreset(p)}
              onDelete={() => handleDeleteCustom(p.id)}
            />
          ))}
          <NewCustomCard
            disabled={customPresets.length >= 3}
            onClick={createNewCustom}
          />
        </div>
      </div>

      {/* Form */}
      <SettingsForm
        form={form}
        onChange={handleChange}
        activePreset={activePreset}
        models={models}
        serverHasApiKey={serverHasApiKey}
        save={save}
        test={test}
        onSave={onSave}
        onTest={onTest}
        onReset={onReset}
      />

      {/* Debug echo */}
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">debug · 当前后端配置</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-slate-100 p-3 dark:bg-slate-900">
          {JSON.stringify(state.status === 'ready' ? state.config : null, null, 2)}
        </pre>
      </details>
    </section>
  )
}
