/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // DESIGN.md 웜 뉴트럴 토큰 — 컴포넌트에 hex 하드코딩 금지, 전부 CSS 변수 경유
      colors: {
        fg: 'var(--fg)',
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        muted: 'var(--muted)',
        placeholder: 'var(--placeholder)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
      },
      borderColor: {
        whisper: 'var(--border)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      fontFamily: {
        sans: ['Inter', 'Pretendard', '-apple-system', 'system-ui', 'Segoe UI', 'Malgun Gothic', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
