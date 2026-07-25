/** 조건부 className을 병합하며 Tailwind 충돌을 마지막 값으로 정리한다 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 조건부 className을 하나의 충돌 없는 문자열로 합친다 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
