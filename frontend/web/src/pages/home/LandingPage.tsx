/** 로그인 없이 서비스 소개와 학습 시작 경로를 제공한다. */
import { Link } from '@tanstack/react-router';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/components/card';

export function LandingPage() {
  return (
    <main
      className='grid min-h-screen place-items-center bg-background p-page'
      id='app-main'
      tabIndex={-1}
    >
      <Card className='w-full max-w-form border-default bg-surface shadow-overlay'>
        <CardHeader>
          <h1 className='text-title text-primary'>FLEX 태국어 학습</h1>
          <CardDescription className='text-body text-subtle'>
            태국어 어휘와 개념을 차근차근 익히며 FLEX 시험을 준비하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-section'>
          <p className='text-body text-subtle'>
            어휘를 찾아 뜻과 예문을 살펴보고, 내 단어장에 모아 복습할 수 있어요.
            개념 학습으로 태국어의 기초도 함께 다져 보세요.
          </p>
          <Button asChild>
            <Link to='/learn'>학습 시작</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
