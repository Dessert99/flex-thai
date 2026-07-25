/** Vite가 React 애플리케이션을 브라우저 root에 연결한다 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './app/providers/AppProviders';
import './app/styles/theme.css';

/** 잘못된 HTML 진입점은 빈 화면 대신 시작 단계에서 드러낸다 */
function requireRootElement() {
  const rootElement = document.getElementById('root');

  if (!(rootElement instanceof HTMLElement)) {
    throw new Error('React root element를 찾을 수 없습니다.');
  }

  return rootElement;
}

createRoot(requireRootElement()).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
);
