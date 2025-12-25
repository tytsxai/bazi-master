export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        sm: '100%',
        md: '100%',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
        '3xl': '1720px'
      }
    },
    extend: {
      screens: {
        '3xl': '1920px'
      },
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
          400: '#e3c45c',
          300: '#edcf73',
          200: '#f5e2a6',
          100: '#fbf4d4',
          50: '#fdfbe9'
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
