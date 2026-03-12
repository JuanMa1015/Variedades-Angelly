/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        shell: '#fffafd',
        rosewood: '#5f3245',
        blush: {
          100: '#ffe5ec',
          200: '#ffd1dc',
        },
        gold: {
          50: '#fff5d8',
          100: '#f8e5ab',
          200: '#edd389',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
      },
      boxShadow: {
        soft: '0 14px 35px rgba(190, 113, 143, 0.24)',
        gold: '0 16px 38px rgba(164, 124, 34, 0.24)',
      },
    },
  },
  plugins: [],
}
