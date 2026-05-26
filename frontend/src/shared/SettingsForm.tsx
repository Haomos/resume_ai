import type {
  LLMPreset,
  RecommendedModelsResponse,
  LLMConfigResponse,
  TestConnectionResponse,
} from '../api/types'

type ProviderType = 'ollama' | 'openai_compatible' | 'anthropic'

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success'; config: LLMConfigResponse }
  | { status: 'error'; message: string }

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'done'; result: TestConnectionResponse }

export interface FormState {
  provider_type: ProviderType
  base_url: string
  model_name: string
  temperature: number
  api_key: string
}

const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20 dark:border-slate-700 dark:bg-slate-950'

interface SettingsFormProps {
  form: FormState
  onChange: (patch: Partial<FormState>) => void
  activePreset: LLMPreset | null
  models: RecommendedModelsResponse | null
  serverHasApiKey: boolean
  save: SaveState
  test: TestState
  onSave: () => void
  onTest: () => void
  onReset: () => void
}

export function SettingsForm({
  form,
  onChange,
  activePreset,
  models,
  serverHasApiKey,
  save,
  test,
  onSave,
  onTest,
  onReset,
}: SettingsFormProps) {
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    onChange({ [key]: value } as Partial<FormState>)
  }

  const datalistOptions =
    activePreset?.models.map((m) => m.name) ?? models?.models[form.provider_type] ?? []

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:bg-slate-900 dark:border-slate-800">
      {/* Provider Type */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Provider 类型
        </legend>
        <div className="flex flex-wrap gap-4">
          {(['ollama', 'openai_compatible', 'anthropic'] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="provider_type"
                value={opt}
                checked={form.provider_type === opt}
                onChange={() => update('provider_type', opt)}
              />
              <span>
                {opt === 'ollama'
                  ? 'Ollama (本地)'
                  : opt === 'openai_compatible'
                    ? 'OpenAI Compatible'
                    : 'Anthropic Claude'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Base URL */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Base URL <span className="font-normal text-slate-400">(支持自托管 vLLM / 其他 OpenAI 兼容端点)</span>
        </span>
        <input
          type="url"
          value={form.base_url}
          onChange={(e) => update('base_url', e.target.value)}
          className={inputCls}
          placeholder="http://localhost:11434（本地）或 http://host.docker.internal:11434（Docker）"
        />
      </label>

      {/* Model Name */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          模型名称
        </span>
        <input
          type="text"
          value={form.model_name}
          onChange={(e) => update('model_name', e.target.value)}
          className={inputCls}
          placeholder="qwen3:8b / moonshot-v1-32k / 任意自定义模型 ID"
          list="model-options"
        />
        <datalist id="model-options">
          {datalistOptions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {activePreset && (
          <div className="mt-1 flex flex-wrap gap-1">
            {activePreset.models.map((m) => {
              const selected = form.model_name === m.name
              const baseCls = 'rounded-full border px-2 py-0.5 text-[11px] transition-colors'
              const styleCls = selected
                ? 'border-slate-700 bg-slate-700 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              return (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => update('model_name', m.name)}
                  className={`${baseCls} ${styleCls}`}
                  title={m.context_window ? `ctx ${m.context_window} tokens` : undefined}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
        )}
        {!activePreset && datalistOptions.length > 0 && (
          <span className="block text-[11px] text-slate-400">
            datalist 自动补全：{datalistOptions.slice(0, 5).join(' · ')}
            {datalistOptions.length > 5 ? ' · ...' : ''}
          </span>
        )}
      </label>

      {/* API Key */}
      <label className="block space-y-1">
        <span className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
          API Key
          {serverHasApiKey && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              已配置
            </span>
          )}
          {activePreset && !activePreset.requires_api_key && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
              {activePreset.label} 无需 key
            </span>
          )}
        </span>
        <input
          type="password"
          value={form.api_key}
          onChange={(e) => update('api_key', e.target.value)}
          className={inputCls}
          placeholder={
            serverHasApiKey
              ? '留空则保留现有 key；输入新值则覆盖'
              : activePreset?.requires_api_key === false
                ? '(可选；该 provider 通常无需 key)'
                : '请输入 sk-* / token / API key'
          }
          autoComplete="off"
        />
      </label>

      {/* Temperature */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Temperature: <strong>{form.temperature.toFixed(2)}</strong>
        </span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={form.temperature}
          onChange={(e) => update('temperature', Number(e.target.value))}
          className="w-full"
        />
        <span className="block text-[11px] text-slate-400">
          0 = 严格 deterministic；建议 LLM 评分时 0.3-0.7
        </span>
      </label>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={save.status === 'saving'}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {save.status === 'saving' ? '保存中...' : '保存配置'}
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={test.status === 'testing' || save.status === 'saving'}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {test.status === 'testing' ? '测试中...' : '测试连接'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          title="把表单恢复到 backend 已保存的配置（撤销当前未保存的修改）"
        >
          ↩ 重置为已保存
        </button>
        {save.status === 'success' && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">✅ 已保存</span>
        )}
        {save.status === 'error' && (
          <span className="text-xs text-red-600 dark:text-red-400">{save.message}</span>
        )}
      </div>

      {/* Test result */}
      {test.status === 'done' && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            test.result.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200'
          }`}
        >
          {test.result.ok ? (
            <>
              <strong>✅ 连接成功</strong>
              <span className="ml-1">· {test.result.model}</span>
              {test.result.preview && (
                <span className="ml-1 italic opacity-75">→ "{test.result.preview}"</span>
              )}
            </>
          ) : (
            <>
              <strong>❌ 连接失败</strong>
              {test.result.model && (
                <span className="ml-1">(model: {test.result.model})</span>
              )}
              {test.result.error && (
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px]">
                  {test.result.error}
                </pre>
              )}
            </>
          )}
          <p className="mt-1 text-[10px] opacity-60">
            提示：测试用的是表单中当前值（未保存也会用于测试）。
          </p>
        </div>
      )}
    </div>
  )
}
