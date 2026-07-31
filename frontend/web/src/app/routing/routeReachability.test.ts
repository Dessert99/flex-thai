/** 승인된 정적·동적 navigation target이 생성 route tree에 남아 있는지 검증한다 */
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from '../router';

const router = createAppRouter(new QueryClient());
const approvedTargets = [
  '/',
  '/login',
  '/login/challenge',
  '/login/confirm',
  '/login/mfa',
  '/learn',
  '/questions',
  '/history',
  '/practice',
  '/vocabularies',
  '/wordbooks',
  '/admin',
  '/admin/users',
  '/admin/audit-logs',
  '/admin/question-settings',
  '/admin/totp-setup',
  '/admin/content-imports',
  '/admin/questions',
  '/admin/vocabularies',
  '/admin/content-error-reports',
  '/admin/content-production',
  '/admin/content-production/candidates',
  '/admin/content-production/vocabulary-candidates',
  '/admin/content-production/presets',
  '/admin/tts',
  '/admin/tts/presets',
  '/admin/usage-cost',
  '/forbidden',
] as const;

const questionId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const vocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aab';
const importId = '01933b6a-8f13-7a19-b7e5-536d70f57aac';
const versionId = '01933b6a-8f13-7a19-b7e5-536d70f57aad';
const wordbookId = '01933b6a-8f13-7a19-b7e5-536d70f57aae';
const sessionId = '01933b6a-8f13-7a19-b7e5-536d70f57aaf';
const conceptId = '01933b6a-8f13-7a19-b7e5-536d70f57ab0';
const jobId = '01933b6a-8f13-7a19-b7e5-536d70f57ab1';
const candidateId = '01933b6a-8f13-7a19-b7e5-536d70f57ab2';
const dynamicTargets = [
  {
    build: () =>
      router.buildLocation({
        params: { jobId },
        to: '/admin/content-production/jobs/$jobId',
      }),
    label: '콘텐츠 제작 작업 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { candidateId },
        to: '/admin/content-production/candidates/$candidateId',
      }),
    label: '문제 후보 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { candidateId },
        to: '/admin/content-production/vocabulary-candidates/$candidateId',
      }),
    label: '어휘 후보 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { jobId },
        search: { page: 1, pageSize: 20 },
        to: '/admin/tts/jobs/$jobId',
      }),
    label: 'TTS 작업 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { sessionId },
        to: '/practice/$sessionId',
      }),
    label: '단어 연습 진행',
  },
  {
    build: () =>
      router.buildLocation({
        params: { sessionId },
        to: '/practice/$sessionId/result',
      }),
    label: '단어 연습 결과',
  },
  {
    build: () =>
      router.buildLocation({
        search: { category: 'GRAMMAR' },
        to: '/concepts',
      }),
    label: '학습자 개념 목록',
  },
  {
    build: () =>
      router.buildLocation({
        params: { conceptId },
        to: '/concepts/$conceptId',
      }),
    label: '학습자 개념 상세',
  },
  {
    build: () =>
      router.buildLocation({
        search: { page: 1, pageSize: 20 },
        to: '/admin/concepts',
      }),
    label: '관리자 개념 목록',
  },
  {
    build: () =>
      router.buildLocation({
        params: { conceptId },
        to: '/admin/concepts/$conceptId',
      }),
    label: '관리자 개념 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { wordbookId },
        search: { page: 1, pageSize: 20 },
        to: '/wordbooks/$wordbookId',
      }),
    label: '학습자 단어장 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { questionId },
        search: { page: 1, pageSize: 20 },
        to: '/questions/$questionId',
      }),
    label: '학습자 문제 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { vocabularyId },
        search: { page: 1, pageSize: 20 },
        to: '/vocabularies/$vocabularyId',
      }),
    label: '학습자 어휘 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { importId },
        search: { page: 1, pageSize: 20 },
        to: '/admin/content-imports/$importId',
      }),
    label: '콘텐츠 가져오기 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { questionId },
        search: { page: 1, pageSize: 20 },
        to: '/admin/questions/$questionId',
      }),
    label: '관리자 문제 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { questionId, versionId },
        search: { page: 1, pageSize: 20 },
        to: '/admin/questions/$questionId/versions/$versionId/replace',
      }),
    label: '문제 버전 교체',
  },
  {
    build: () =>
      router.buildLocation({
        params: { vocabularyId },
        search: { page: 1, pageSize: 20 },
        to: '/admin/vocabularies/$vocabularyId',
      }),
    label: '관리자 어휘 상세',
  },
] as const;

describe('route 도달 가능성', () => {
  it.each(approvedTargets)('%s 경로를 route tree에서 찾을 수 있다', (to) => {
    expect(
      (router.routesByPath as unknown as Record<string, unknown>)[to],
    ).toBeDefined();
    expect(() => router.buildLocation({ to })).not.toThrow();
  });

  it.each(dynamicTargets)(
    '$label 경로와 대표 UUID params를 조립할 수 있다',
    ({ build }) => {
      expect(build).not.toThrow();
    },
  );

  it.each([
    '/practice/$sessionId',
    '/practice/$sessionId/result',
    '/concepts/$conceptId',
    '/admin/concepts/$conceptId',
    '/wordbooks/$wordbookId',
    '/questions/$questionId',
    '/vocabularies/$vocabularyId',
    '/admin/content-imports/$importId',
    '/admin/questions/$questionId',
    '/admin/questions/$questionId/versions/$versionId/replace',
    '/admin/vocabularies/$vocabularyId',
    '/admin/content-production/jobs/$jobId',
    '/admin/content-production/candidates/$candidateId',
    '/admin/content-production/vocabulary-candidates/$candidateId',
    '/admin/tts/jobs/$jobId',
  ])('%s 동적 경로를 route tree에서 찾을 수 있다', (to) => {
    expect(
      (router.routesByPath as unknown as Record<string, unknown>)[to],
    ).toBeDefined();
  });

  it.each([
    '/admin/content-production',
    '/admin/content-production/jobs/$jobId',
    '/admin/content-production/candidates',
    '/admin/content-production/candidates/$candidateId',
    '/admin/content-production/vocabulary-candidates',
    '/admin/content-production/vocabulary-candidates/$candidateId',
    '/admin/content-production/presets',
    '/admin/tts',
    '/admin/tts/jobs/$jobId',
    '/admin/tts/presets',
    '/admin/usage-cost',
  ])('%s 경로가 route loader로 화면 query를 미리 불러온다', (to) => {
    const route = (
      router.routesByPath as unknown as Record<
        string,
        { options?: { loader?: unknown } }
      >
    )[to];
    expect(route?.options?.loader).toBeTypeOf('function');
  });
});
