/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary colors
        primary: {
          DEFAULT: '#9E7FFF',
          50: '#F5F2FF',
          100: '#E9E2FF',
          200: '#C1A8FF',
          300: '#9E7FFF',
          400: '#7D5FD3',
          500: '#5F45B2',
          600: '#4A3691',
          700: '#382971',
          800: '#271D51',
          900: '#1A1338',
        },
        // Secondary colors
        secondary: {
          DEFAULT: '#F472B6',
          50: '#FFF0F7',
          100: '#FFD6E9',
          200: '#FFA1D0',
          300: '#F472B6',
          400: '#E64A8A',
          500: '#C04A8C',
          600: '#A13A75',
          700: '#7D2C5C',
          800: '#5A1F43',
          900: '#3D152F',
        },
        // Status colors
        success: {
          DEFAULT: '#10B981',
          light: '#D1FAE5',
          dark: '#065F46',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FEF3C7',
          dark: '#92400E',
        },
        error: {
          DEFAULT: '#EF4444',
          light: '#FEE2E2',
          dark: '#B91C1C',
        },
        // Background and surface colors
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        // Text colors
        foreground: 'rgb(var(--color-text) / <alpha-value>)',
        'foreground-secondary': 'rgb(var(--color-text-secondary) / <alpha-value>)',
        // Border colors
        border: 'rgb(var(--color-border) / <alpha-value>)',
      },
      // Font families
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      // Border radius
      borderRadius: {
        none: '0px',
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        full: '9999px',
      },
      // Box shadow
      boxShadow: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
        none: 'none',
      },
      // Animation
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      // Custom spacing
      spacing: {
        4.5: '1.125rem',
        13: '3.25rem',
        18: '4.5rem',
        22: '5.5rem',
        26: '6.5rem',
        30: '7.5rem',
        34: '8.5rem',
        38: '9.5rem',
        42: '10.5rem',
        46: '11.5rem',
        50: '12.5rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography')
  ],
  safelist: [
    'bg-primary',
    'bg-secondary',
    'bg-success',
    'bg-warning',
    'bg-error',
    'text-primary',
    'text-secondary',
    'text-success',
    'text-warning',
    'text-error',
  ]
};
