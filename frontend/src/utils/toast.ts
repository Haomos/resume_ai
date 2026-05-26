import toast from 'react-hot-toast'

/** 轻量 Toast 封装 — 替代原生 alert() */
export const t = {
  ok: (msg: string) => toast.success(msg),
  err: (msg: string) => toast.error(msg),
  info: (msg: string) => toast(msg, { icon: '💡' }),
}
