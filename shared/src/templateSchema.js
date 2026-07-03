import { z } from 'zod';

// 설계서 §7.1 스타일 스키마. 검증 실패 시 호출부는 기본 프리셋으로 폴백한다.

const marginSchema = z.object({
  top: z.number().min(0).max(60),
  bottom: z.number().min(0).max(60),
  left: z.number().min(0).max(60),
  right: z.number().min(0).max(60),
}); // mm

const headingSchema = z.object({
  font: z.string().optional(), // 생략 시 body.font 상속
  size: z.number().min(6).max(48), // pt
  weight: z.number().int().min(100).max(900).default(700),
  spaceBefore: z.number().min(0).max(60).default(0), // pt
  spaceAfter: z.number().min(0).max(60).default(0), // pt
  // nested = 1. / 1.1. / 1.1.1. 다단계 번호 (설계서 §7.1)
  numbering: z.enum(['roman', 'decimal', 'hangul', 'nested', 'none']).default('none'),
});

// 머리말/꼬리말 텍스트에 쓸 수 있는 자리표시자: {page} {total} {title} {date}
const hfTextSchema = z.string().max(120).default('');

const headerFooterSchema = z
  .object({
    headerLeft: hfTextSchema,
    headerCenter: hfTextSchema,
    headerRight: hfTextSchema,
    footerLeft: hfTextSchema,
    footerCenter: hfTextSchema,
    footerRight: hfTextSchema,
    fontSize: z.number().min(6).max(14).default(9), // pt
    // 쪽번호 표기: 1 / - 1 - / 1 / N (footerCenter가 비어 있고 options.pageNumber=true일 때 적용)
    pageNumberFormat: z.enum(['decimal', 'dash', 'fraction']).default('dash'),
  })
  .default({});

export const templateSchema = z.object({
  name: z.string().min(1).max(60),
  page: z.object({
    size: z.enum(['A4', 'B5', 'Letter']).default('A4'),
    orientation: z.enum(['portrait', 'landscape']).default('portrait'),
    margin: marginSchema,
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
  }),
  body: z.object({
    font: z.string(),
    size: z.number().min(6).max(24).default(11), // pt
    lineHeight: z.number().min(1).max(3).default(1.6),
    letterSpacing: z.number().min(-0.1).max(0.5).default(0), // em
    align: z.enum(['left', 'justify']).default('justify'),
  }),
  headings: z.object({
    h1: headingSchema,
    h2: headingSchema,
    h3: headingSchema,
  }),
  options: z
    .object({
      toggleExpand: z.boolean().default(true),
      columnStack: z.boolean().default(true),
      pageNumber: z.boolean().default(true),
    })
    .default({}),
  hf: headerFooterSchema,
});

/** 파싱 성공 시 {ok:true, template}, 실패 시 {ok:false, issues} */
export function validateTemplate(input) {
  const parsed = templateSchema.safeParse(input);
  if (parsed.success) return { ok: true, template: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}
