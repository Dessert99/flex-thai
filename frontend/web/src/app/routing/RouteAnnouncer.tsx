/** route 이동을 문서 제목·live region·본문 초점으로 브라우저에 동기화한다 */
import { useEffect } from 'react';

/** route별 접근성 안내에 필요한 제목과 main landmark 식별자 */
export interface RouteAnnouncerProps {
  mainId: string;
  title: string;
}

/** 화면 이동을 알리고 키보드 초점을 새 본문 시작점으로 옮긴다 */
export function RouteAnnouncer({ mainId, title }: RouteAnnouncerProps) {
  useEffect(() => {
    document.title = `${title} | FLEX THIA`;
    const main =
      document.getElementById(mainId) ?? document.querySelector('main');

    if (main instanceof HTMLElement) {
      main.tabIndex = -1;
      main.focus();
    }
  }, [mainId, title]);

  return (
    <p
      aria-live='polite'
      className='sr-only'
      role='status'
    >
      {title}
    </p>
  );
}
