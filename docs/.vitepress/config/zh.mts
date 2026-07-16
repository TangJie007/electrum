import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress'

export const zh: LocaleSpecificConfig<DefaultTheme.Config> = {
  description: 'NestJS 风格的 Electron 主进程 MVC 框架',
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/', activeMatch: '/guide/' },
      { text: '源码学习', link: '/demo/', activeMatch: '/demo/' },
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
            { text: '整体架构', link: '/guide/architecture' },
            { text: '核心概念', link: '/guide/concepts' },
          ],
        },
        {
          text: '基础',
          items: [
            { text: 'Controllers', link: '/guide/controllers' },
            { text: 'Providers', link: '/guide/providers' },
            { text: '模块', link: '/guide/modules' },
            { text: '中间件管道', link: '/guide/middleware' },
            { text: 'Guard', link: '/guide/guards' },
            { text: 'Pipe', link: '/guide/pipes' },
            { text: 'Interceptor', link: '/guide/interceptors' },
            { text: 'Filter', link: '/guide/filters' },
            { text: '窗口与生命周期', link: '/guide/windows-lifecycle' },
            { text: 'Preload', link: '/guide/preload' },
            { text: 'Client', link: '/guide/client' },
            { text: 'IPC 通信', link: '/guide/ipc' },
          ],
        },
        {
          text: '实践',
          items: [{ text: '示例项目', link: '/guide/examples' }],
        },
      ],
      '/demo/': [
        {
          text: '实现走读',
          items: [
            { text: '目录', link: '/demo/' },
            { text: '从 createApp 到 start', link: '/demo/create-app-start' },
            { text: '模块扫描与注册', link: '/demo/module-scanner' },
            { text: '@Inject 注入路径', link: '/demo/inject' },
            { text: '@IpcHandle 绑定路径', link: '/demo/ipc-handle' },
            { text: '一次 invoke 怎么跑完', link: '/demo/middleware-pipeline' },
            { text: '@IpcEmit 推送路径', link: '/demo/ipc-emit' },
            { text: '@AppEvent 绑定路径', link: '/demo/app-event' },
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
    langMenuLabel: '切换语言',
  },
}
