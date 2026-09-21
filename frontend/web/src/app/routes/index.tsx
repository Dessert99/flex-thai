/** 로그인 여부와 관계없이 공개 랜딩 페이지를 제공한다. */
import { createFileRoute } from '@tanstack/react-router';
import { LandingPage } from '@/pages/home/LandingPage';

export const Route = createFileRoute('/')({
  component: LandingPage,
});
