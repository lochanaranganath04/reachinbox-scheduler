/** Tweak these tokens to match the Figma palette. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#E8F5EC', 100: '#D4EEDB', 500: '#00A844', 600: '#00A844', 700: '#008A38' },
        field: '#F3F4F4',
        pill: { bg: '#FFE8D1', fg: '#C2410C' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], pixel: ['Silkscreen', 'monospace'] },
    },
  },
  plugins: [],
};
