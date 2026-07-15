import { defineConfig } from 'vitepress'
import { shared } from './config/shared.mts'
import { zh } from './config/zh.mts'
import { en } from './config/en.mts'

export default defineConfig({
  ...shared,
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      ...zh,
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      ...en,
    },
  },
})
