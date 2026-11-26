/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0E231D',
          800: '#132B23',
          700: '#183A30',
        },
        forest: {
          950: '#081712',
          900: '#0E231D',
          800: '#132B23',
          700: '#183A30',
          600: '#235345',
        },
        primary: {
          DEFAULT: '#059669',
          hover: '#047857',
          light: '#ECFDF5',
        },
        surface: '#FFFFFF',
        page: '#F5F7FA',
        border: '#E2E8F0',
        text: {
          main: '#172033',
          muted: '#64748B',
        },
        success: '#15803D',
        warning: '#D97706',
        danger: '#DC2626',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
