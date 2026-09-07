import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd7ff',
          300: '#8ebeff',
          400: '#599aff',
          500: '#3376ff',
          600: '#1d56fb',
          700: '#1642e8',
          800: '#1837bb',
          900: '#1a3393',
        },
      },
    },
  },
  plugins: [],
};

export default config;
