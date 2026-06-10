/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          light: '#e8d5b7',
          DEFAULT: '#D4AF37',
          dark: '#C5A059',
          premium: '#c9a96e',
        },
        charcoal: {
          light: '#252836',
          DEFAULT: '#1A1A1A',
          dark: '#121212',
          black: '#0e0f13',
        }
      },
      fontFamily: {
        serif: ['Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
