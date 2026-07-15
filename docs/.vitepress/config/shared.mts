import type { DefaultTheme, UserConfig } from 'vitepress'

export const shared: UserConfig<DefaultTheme.Config> = {
  title: 'Electrum',
  cleanUrls: true,
  // GitHub-only READMEs — not site pages
  srcExclude: ['README.md', 'core/README.md', 'en/README.md'],

  themeConfig: {
    siteTitle: 'Electrum',
    socialLinks: [{ icon: 'github', link: 'https://github.com/TangJie007/electrum' }],
  },
}
