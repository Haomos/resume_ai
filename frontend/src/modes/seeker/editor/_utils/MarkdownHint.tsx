export function MarkdownHint() {
  const tips = [
    { syntax: '**文字**', desc: '加粗' },
    { syntax: '*文字*', desc: '斜体' },
    { syntax: '# 小标题', desc: '标题' },
    { syntax: '- 项目', desc: '无序列表' },
    { syntax: '1. 项目', desc: '有序列表' },
    { syntax: '[文字](https://...)', desc: '链接' },
    { syntax: '`代码`', desc: '行内代码' },
  ]

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[10px] text-slate-400">支持 Markdown：</span>
      {tips.map((t) => (
        <span key={t.syntax} className="inline-flex items-center gap-1 text-[10px]">
          <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {t.syntax}
          </code>
          <span className="text-slate-400">{t.desc}</span>
        </span>
      ))}
    </div>
  )
}
