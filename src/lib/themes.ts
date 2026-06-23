export interface ThemeDefinition {
  name: string
  vars: Record<string, string>
  palette: string[]
}

export const APP_THEMES: ThemeDefinition[] = [
  {
    name: 'Blueprint (default)',
    vars: {
      '--bg': '#194a8d',
      '--surface': '#1f5aa8',
      '--surface2': '#143d78',
      '--border': '#2e6ec0',
      '--accent': '#7db8ff',
      '--text-primary': '#ffffff',
      '--text-secondary': '#c8dff8',
      '--text-muted': '#90b8e0',
      '--selected-bg': '#2560a8',
      '--selected-border': '#7db8ff',
      '--hover-bg': '#205298',
      '--sqft-color': '#7fffcf',
      '--group-color': '#c8dff8',
    },
    palette: ['#6A89A7', '#88BDF2', '#BDDDFC', '#384959'],
  },
  {
    name: 'Olive Grove',
    vars: {
      '--bg': '#2b2e18',
      '--surface': '#3a3f20',
      '--surface2': '#2b2e18',
      '--border': '#565c2e',
      '--accent': '#d4de95',
      '--text-primary': '#f2f4e8',
      '--text-secondary': '#c8cf8a',
      '--text-muted': '#a0a860',
      '--selected-bg': '#4d5426',
      '--selected-border': '#d4de95',
      '--hover-bg': '#434922',
      '--sqft-color': '#d4de95',
      '--group-color': '#c8cf8a',
    },
    palette: ['#636B2F', '#BAC095', '#D4DE95', '#3D4127'],
  },
  {
    name: 'Forest',
    vars: {
      '--bg': '#1b2e1e',
      '--surface': '#253d2c',
      '--surface2': '#1b2e1e',
      '--border': '#3a5e42',
      '--accent': '#68ba7f',
      '--text-primary': '#e8f5eb',
      '--text-secondary': '#a8d6b0',
      '--text-muted': '#78b884',
      '--selected-bg': '#2e4e35',
      '--selected-border': '#68ba7f',
      '--hover-bg': '#2a4430',
      '--sqft-color': '#cfffdc',
      '--group-color': '#a8d6b0',
    },
    palette: ['#2E6F40', '#CFFFDC', '#68BA7F', '#253D2C'],
  },
  {
    name: 'Chocolate Truffle',
    vars: {
      '--bg': '#1c0d03',
      '--surface': '#2e1105',
      '--surface2': '#1c0d03',
      '--border': '#5a2d08',
      '--accent': '#c05800',
      '--text-primary': '#fdfbd4',
      '--text-secondary': '#e8c48a',
      '--text-muted': '#b88a50',
      '--selected-bg': '#3d1a06',
      '--selected-border': '#c05800',
      '--hover-bg': '#361608',
      '--sqft-color': '#fdfbd4',
      '--group-color': '#e8c48a',
    },
    palette: ['#713600', '#C05800', '#FDFBD4', '#38240D'],
  },
  {
    name: 'Chai Latte',
    vars: {
      '--bg': '#1a1108',
      '--surface': '#2a1d0e',
      '--surface2': '#1a1108',
      '--border': '#6b3d12',
      '--accent': '#d47e30',
      '--text-primary': '#fdfbd4',
      '--text-secondary': '#e5c89a',
      '--text-muted': '#b89060',
      '--selected-bg': '#3a2510',
      '--selected-border': '#d47e30',
      '--hover-bg': '#311f0c',
      '--sqft-color': '#fdfbd4',
      '--group-color': '#e5c89a',
    },
    palette: ['#FDFBD4', '#D47E30', '#8D5A2B', '#825E34'],
  },
  {
    name: 'Electric Sky',
    vars: {
      '--bg': '#1a2030',
      '--surface': '#202a40',
      '--surface2': '#141c2e',
      '--border': '#3a5070',
      '--accent': '#66c4ff',
      '--text-primary': '#f0f8ff',
      '--text-secondary': '#a8d8f8',
      '--text-muted': '#6a98c0',
      '--selected-bg': '#253550',
      '--selected-border': '#66c4ff',
      '--hover-bg': '#1e2e45',
      '--sqft-color': '#ffc067',
      '--group-color': '#a8d8f8',
    },
    palette: ['#FFC067', '#66F4FF', '#66C4FF', '#7D99AA'],
  },
]

export function updateBldgLabelColor(bg: string, accent: string): void {
  for (const sheet of document.styleSheets) {
    try {
      const rules = sheet.cssRules ?? []
      for (let j = 0; j < rules.length; j++) {
        const rule = rules[j] as CSSStyleRule
        if (rule.selectorText === '.bldg-label') {
          rule.style.setProperty('background', `${bg}eb`, 'important')
          rule.style.setProperty('border', `1px solid ${accent}66`, 'important')
        }
      }
    } catch {
      /* cross-origin stylesheets */
    }
  }
}

export function applyThemeVars(themeIndex: number): void {
  const theme = APP_THEMES[themeIndex] ?? APP_THEMES[0]!
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value)
  }
  updateBldgLabelColor(theme.vars['--bg']!, theme.vars['--accent']!)
}
