export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        mystic: {
          950: '#0b0618',
          900: '#120824',
          800: '#1a0f34',
          700: '#2d1b4e',
          600: '#3b2465',
          500: '#4b2f7a'
        },
        gold: {
          500: '#d4af37',
          400: '#e3c45c'
        }
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Times New Roman"', 'serif'],
        display: ['Cinzel', '"Times New Roman"', 'serif']
      },
      boxShadow: {
        glass: '0 0 0 1px rgba(212,175,55,0.2), 0 20px 60px rgba(0,0,0,0.45)'
      }
    }
  },
  plugins: []
};
