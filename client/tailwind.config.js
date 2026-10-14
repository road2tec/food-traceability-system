/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#f1f5f3', 100: '#dde7e2', 200: '#bbcfc5', 300: '#8fb0a1', 400: '#5f8a76',
          500: '#3f6b57', 600: '#2f5545', 700: '#26443a', 800: '#1d342d', 900: '#16271f', 950: '#0f1b15',
        },
        amber: {
          50: '#fff8eb', 100: '#feecc7', 200: '#fdd88b', 300: '#fcbf4d', 400: '#fba824',
          500: '#f08c0b', 600: '#d46a06', 700: '#af4b09', 800: '#8d3b0e', 900: '#73320f',
        },
        paper: { DEFAULT: '#faf8f4', 100: '#f4f1ea', 200: '#ebe6db', 300: '#d9d2c3' },
        ink: { DEFAULT: '#1f2a25', soft: '#4a5851', muted: '#6b7872' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(31,42,37,0.05), 0 1px 3px rgba(31,42,37,0.06)',
        pop: '0 8px 24px rgba(15,27,21,0.14)',
      },
    },
  },
  plugins: [],
};
