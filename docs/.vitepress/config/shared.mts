import type { DefaultTheme, UserConfig } from 'vitepress'

export const shared: UserConfig<DefaultTheme.Config> = {
  title: 'Electrum',
  cleanUrls: true,
  // GitHub / personal notes — not published site pages
  srcExclude: [
    'README.md',
    'core/**',
    'en/README.md',
    'en/core/**',
  ],

  themeConfig: {
    siteTitle: 'Electrum',
    socialLinks: [{ icon: 'github', link: 'https://github.com/TangJie007/electrum' }],
  },
}
