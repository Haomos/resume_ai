interface PreviewFooterProps {
  veto: boolean
  polish: boolean
  onTogglePolish: (v: boolean) => void
  onConfirm: () => void
  confirming: boolean
  confirmedCount: number
}

export function PreviewFooter({
  veto,
  polish,
  onTogglePolish,
  onConfirm,
  confirming,
  confirmedCount,
}: PreviewFooterProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label
        className={`flex cursor-pointer items-center gap-2 text-xs ${
          veto ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'
        }`}
      >
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-seeker-600 focus:ring-seeker-500"
          checked={polish}
          onChange={(e) => onTogglePolish(e.target.checked)}
          disabled={veto}
        />
        🪄 启用 AI 润色措辞
        <span className="text-[10px] text-slate-400">
          {polish ? '（约 10-30 秒）' : '（更快）'}
        </span>
      </label>
      <button
        onClick={onConfirm}
        disabled={confirming || confirmedCount === 0 || veto}
        title={veto ? '契合度过低，请先丰富档案或选择其他岗位' : undefined}
        className="rounded-lg bg-seeker-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700 disabled:opacity-50"
      >
        {veto
          ? '❌ 契合度过低'
          : confirming
            ? polish
              ? 'AI 润色中…'
              : '生成中…'
            : `确认生成（${confirmedCount} 条经历）`}
      </button>
    </div>
  )
}
