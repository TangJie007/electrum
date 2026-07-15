import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Electrum',
  description: 'NestJS 风格的 Electron 主进程 MVC 框架',
  lang: 'zh-CN',
  cleanUrls: true,
  // GitHub 浏览用 README，不作为站点页面
  srcExclude: ['README.md', 'core/README.md'],

  themeConfig: {
    siteTitle: 'Electrum',
    nav: [
      { text: '指南', link: '/guide/', activeMatch: '/guide/' },
      { text: '深入源码', link: '/core/', activeMatch: '/core/' },
      {
        text: 'GitHub',
        link: 'https://github.com/TangJie007/electrum',
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '概述', link: '/guide/' },
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '核心概念', link: '/guide/concepts' },
          ],
        },
        {
          text: '基础',
          items: [
            { text: 'Controllers', link: '/guide/controllers' },
            { text: 'Providers', link: '/guide/providers' },
            { text: '模块', link: '/guide/modules' },
            { text: '中间件', link: '/guide/middleware' },
            { text: '窗口与生命周期', link: '/guide/windows-lifecycle' },
            { text: 'IPC 通信（补充）', link: '/guide/ipc' },
          ],
        },
        {
          text: '实践',
          items: [{ text: '示例项目', link: '/guide/examples' }],
        },
      ],
      '/core/': [
        {
          text: '深入源码',
          items: [
            { text: '学习指南', link: '/core/' },
            { text: '架构总览', link: '/core/architecture' },
            { text: 'ModuleScanner 设计', link: '/core/module-scanner' },
            { text: '模块扫描与 DI', link: '/core/di-and-modules' },
            { text: 'IPC 与中间件', link: '/core/ipc-and-middleware' },
            { text: '窗口 / 事件 / 生命周期', link: '/core/window-event-lifecycle' },
            { text: '类型生成与插件', link: '/core/types-and-plugins' },
            { text: 'Specs ↔ Core 对照', link: '/core/specs-mapping' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到相关结果',
            resetButtonTitle: '清除',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/TangJie007/electrum' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Electrum contributors',
    },

    editLink: {
      pattern: 'https://github.com/TangJie007/electrum/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },

    outline: {
      label: '本页目录',
      level: [2, 3],
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '外观',
  },
})
