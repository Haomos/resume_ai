import type { JsonResume } from '../../api/types'

export type ThemeName = 'default' | 'modern' | 'minimal' | 'classic' | 'tech' | 'elegant' | 'tech-dark'

export interface ThemeMeta {
  name: ThemeName
  label: string
}

export type RenderFn = (resume: JsonResume, lineHeight?: string) => string
