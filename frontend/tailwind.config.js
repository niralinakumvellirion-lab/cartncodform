/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#4f46e5',
          dark: '#4338ca',
        },
        sidebar: '#111827',
      },
    },
  },
  plugins: [],
};
