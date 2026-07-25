/** Vite가 React 애플리케이션을 브라우저 root에 연결한다 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/styles/theme.css';

/** 잘못된 HTML 진입점은 빈 화면 대신 시작 단계에서 드러낸다 */
function requireRootElement() {
  const rootElement = document.getElementById('root');

  if (!(rootElement instanceof HTMLElement)) {
    throw new Error('React root element를 찾을 수 없습니다.');
  }

  return rootElement;
}

/** 프론트엔드 provider와 router가 연결되기 전 최소 진입 화면 */
function BootstrapPlaceholder() {
  return <main className='bg-surface text-primary'>FLEX THIA</main>;
}

createRoot(requireRootElement()).render(
  <StrictMode>
    <BootstrapPlaceholder />
  </StrictMode>,
);
