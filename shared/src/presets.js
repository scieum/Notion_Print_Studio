// 내장 프리셋 3종 (설계서 §7.1). DB 시드 시 user_id NULL로 저장된다.

export const PRESET_GONGMUN = {
  name: '공문서형',
  page: {
    size: 'A4',
    orientation: 'portrait',
    margin: { top: 20, bottom: 15, left: 20, right: 20 },
    background: '#ffffff',
  },
  body: { font: 'kopub-batang', size: 11, lineHeight: 1.6, letterSpacing: 0, align: 'justify' },
  headings: {
    h1: { font: 'kopub-dotum', size: 18, weight: 700, spaceBefore: 12, spaceAfter: 6, numbering: 'roman' },
    h2: { size: 14, weight: 700, spaceBefore: 8, spaceAfter: 4, numbering: 'decimal' },
    h3: { size: 12, weight: 600, spaceBefore: 6, spaceAfter: 3, numbering: 'hangul' },
  },
  options: { toggleExpand: true, columnStack: true, pageNumber: true },
};

export const PRESET_REPORT = {
  name: '보고서형',
  page: {
    size: 'A4',
    orientation: 'portrait',
    margin: { top: 25, bottom: 20, left: 25, right: 25 },
    background: '#ffffff',
  },
  body: { font: 'pretendard', size: 10.5, lineHeight: 1.7, letterSpacing: 0, align: 'justify' },
  headings: {
    h1: { size: 20, weight: 700, spaceBefore: 16, spaceAfter: 8, numbering: 'decimal' },
    h2: { size: 15, weight: 700, spaceBefore: 10, spaceAfter: 5, numbering: 'decimal' },
    h3: { size: 12, weight: 600, spaceBefore: 8, spaceAfter: 4, numbering: 'decimal' },
  },
  options: { toggleExpand: true, columnStack: true, pageNumber: true },
};

export const PRESET_WORKSHEET = {
  name: '학습지형',
  page: {
    size: 'A4',
    orientation: 'portrait',
    margin: { top: 15, bottom: 15, left: 15, right: 15 },
    background: '#ffffff',
  },
  body: { font: 'kopub-dotum', size: 11, lineHeight: 1.8, letterSpacing: 0.02, align: 'left' },
  headings: {
    h1: { size: 22, weight: 700, spaceBefore: 8, spaceAfter: 10, numbering: 'none' },
    h2: { size: 16, weight: 700, spaceBefore: 10, spaceAfter: 6, numbering: 'decimal' },
    h3: { size: 13, weight: 600, spaceBefore: 8, spaceAfter: 4, numbering: 'none' },
  },
  options: { toggleExpand: true, columnStack: true, pageNumber: false },
};

export const SYSTEM_PRESETS = [PRESET_GONGMUN, PRESET_REPORT, PRESET_WORKSHEET];
export const DEFAULT_TEMPLATE = PRESET_GONGMUN;
