/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // mode 色板 — 求职者(海蓝) vs 招聘者(琥珀)
        // §8.42: 补齐 200/300/400/800/900/950 — 之前代码里 30 处用了这些不存在的色阶，
        //        Tailwind JIT 直接不生成 CSS，暗模式很多 panel 透明无边框。
        // seeker: 50/100 沿用 blue-50/100（历史），200-950 用 sky 系列（与 500-700 一致）
        seeker: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
          950: "#082f49",
        },
        // recruiter: 全部沿用 amber 系列
        recruiter: {
          50:  "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
        },
      },
    },
  },
  plugins: [],
}

