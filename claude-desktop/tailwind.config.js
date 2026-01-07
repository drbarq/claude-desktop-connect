/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        claude: {
          orange: '#E07A5F',
          'orange-dark': '#C4684F',
          bg: '#FAFAFA',
          'bg-dark': '#1A1A1A',
          sidebar: '#F5F5F5',
          'sidebar-dark': '#252525',
          border: '#E5E5E5',
          'border-dark': '#333333'
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ],
        mono: [
          'SF Mono',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace'
        ]
      }
    }
  },
  plugins: []
}
