/** route 이동 뒤 문서 제목·live 안내·본문 초점 복구를 검증한다 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteAnnouncer } from './RouteAnnouncer';

describe('RouteAnnouncer', () => {
  it('화면 이동 뒤 제목을 알리고 main landmark로 초점을 옮긴다', async () => {
    render(
      <>
        <main
          id='app-main'
          tabIndex={-1}
        >
          문제 목록 본문
        </main>
        <RouteAnnouncer
          mainId='app-main'
          title='문제 목록'
        />
      </>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('문제 목록');
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(document.title).toBe('문제 목록 | FLEX THIA');
  });

  it('지정한 ID가 없으면 첫 main landmark를 복구 지점으로 사용한다', async () => {
    render(
      <>
        <main>학습 홈 본문</main>
        <RouteAnnouncer
          mainId='missing-main'
          title='학습 홈'
        />
      </>,
    );

    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
  });

  it('main landmark가 아직 없어도 제목과 이동 안내를 유지한다', () => {
    render(
      <RouteAnnouncer
        mainId='missing-main'
        title='불러오는 중'
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
    expect(document.title).toBe('불러오는 중 | FLEX THIA');
  });
});
