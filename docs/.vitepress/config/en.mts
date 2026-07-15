import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress'

export const en: LocaleSpecificConfig<DefaultTheme.Config> = {
  description: 'NestJS-inspired MVC framework for the Electron main process',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/en/guide/', activeMatch: '/en/guide/' },
      { text: 'Internals', link: '/en/core/', activeMatch: '/en/core/' },
      {
        text: 'GitHub',
        link: 'https://github.com/TangJie007/electrum',
      },
    ],
    sidebar: {
      '/en/guide/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Overview', link: '/en/guide/' },
            { text: 'Quick start', link: '/en/guide/getting-started' },
            { text: 'Concepts', link: '/en/guide/concepts' },
          ],
        },
        {
          text: 'Fundamentals',
          items: [
            { text: 'Controllers', link: '/en/guide/controllers' },
            { text: 'Providers', link: '/en/guide/providers' },
            { text: 'Modules', link: '/en/guide/modules' },
            { text: 'Middleware pipeline', link: '/en/guide/middleware' },
            { text: 'Guard', link: '/en/guide/guards' },
            { text: 'Pipe', link: '/en/guide/pipes' },
            { text: 'Interceptor', link: '/en/guide/interceptors' },
            { text: 'Filter', link: '/en/guide/filters' },
            { text: 'Windows & lifecycle', link: '/en/guide/windows-lifecycle' },
            { text: 'Preload', link: '/en/guide/preload' },
            { text: 'Client', link: '/en/guide/client' },
            { text: 'IPC (supplement)', link: '/en/guide/ipc' },
          ],
        },
        {
          text: 'Recipes',
          items: [{ text: 'Example projects', link: '/en/guide/examples' }],
        },
      ],
      '/en/core/': [
        {
          text: 'Source deep-dive',
          items: [
            { text: 'Learning guide', link: '/en/core/' },
            { text: 'Architecture', link: '/en/core/architecture' },
            { text: 'ModuleScanner design', link: '/en/core/module-scanner' },
            { text: 'Module scan & DI', link: '/en/core/di-and-modules' },
            { text: 'IPC & middleware', link: '/en/core/ipc-and-middleware' },
            { text: 'Window / event / lifecycle', link: '/en/core/window-event-lifecycle' },
            { text: 'Typegen & plugins', link: '/en/core/types-and-plugins' },
            { text: 'Specs ↔ Core map', link: '/en/core/specs-mapping' },
          ],
        },
      ],
    },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Search', buttonAriaLabel: 'Search docs' },
          modal: {
            noResultsText: 'No results found',
            resetButtonTitle: 'Clear',
            footer: {
              selectText: 'to select',
              navigateText: 'to navigate',
              closeText: 'to close',
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
      text: 'Edit this page on GitHub',
    },
    outline: {
      label: 'On this page',
      level: [2, 3],
    },
    docFooter: {
      prev: 'Previous',
      next: 'Next',
    },
    returnToTopLabel: 'Back to top',
    sidebarMenuLabel: 'Menu',
    darkModeSwitchLabel: 'Appearance',
    langMenuLabel: 'Language',
  },
}
