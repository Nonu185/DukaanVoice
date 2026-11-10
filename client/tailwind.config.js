/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Emerald primary accent as specified in Prompt 2
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669', // Primary accent
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // Warm off-white backgrounds & charcoal text
        warm: {
          50: '#FAF9F6',  // Warm off-white primary canvas
          100: '#F5F4F0',
          200: '#EAE8E2',
          300: '#D8D5CD',
          charcoal: '#18181B', // Charcoal / near-black text
        },
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans Devanagari"', '"Noto Sans Kannada"', 'system-ui', '-apple-system', 'sans-serif'],
        hindi: ['"Noto Sans Devanagari"', 'sans-serif'],
        kannada: ['"Noto Sans Kannada"', 'sans-serif'],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        '2xs': '0 1px 1px 0 rgba(0, 0, 0, 0.03)',
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
