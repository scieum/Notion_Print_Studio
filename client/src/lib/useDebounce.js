import { useEffect, useRef, useState } from 'react';

/** 값이 delay 동안 안정되면 반영 (검색 입력용) */
export function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * deps가 delay 동안 안정되면 effect 실행 (설계서 §3 — 설정 변경 후 1~2초 디바운스
 * → 미리보기 자동 재렌더).
 */
export function useDebouncedEffect(effect, deps, delay = 1200) {
  const effectRef = useRef(effect);
  effectRef.current = effect;
  useEffect(() => {
    const t = setTimeout(() => effectRef.current(), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay]);
}
