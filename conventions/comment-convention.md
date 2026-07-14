# 주석 컨벤션

모든 파일과 로직에 의도를 드러내는 주석을 일관된 포맷으로 둔다. 목표는 "이 파일·함수가 왜 있고 무엇을 노리는지"를 한눈에 잡게 하는 것이지, 코드를 줄마다 받아쓰는 것이 아니다.

## 1. 핵심 원칙

- **한 줄 WHY.** 모든 주석은 한 줄. 멀티라인 설명 블록·불릿 풀이 금지. 코드가 *무엇을(WHAT)* 하는지 받아쓰지 말고 *왜·의도·함정(WHY)*을 적는다.
- **길이가 아니라 밀도.** 한 줄에 안 들어가면 주석 문제가 아니라 코드 분리·네이밍 신호다. 함수 추출이나 식별자 명확화로 푼다.
- **초보 개념은 농축해서.** 기초 개념(`fail-fast`, `barrel`, `cookie store` 등)도 풀어쓰지 말고 한 줄 안에 단어로 녹인다.

## 2. 포맷

- **파일 헤더·모든 export = 단일 라인 JSDoc** `/** ... */`
  - 한 줄짜리 `/** ... */`를 대상 바로 윗줄에 둔다. IDE 호버 툴팁을 얻으면서 한 줄 원칙을 유지한다.
  - `@param`/`@returns`/`@throws` 태그는 쓰지 않는다. 상시 멀티라인이 되어 한 줄 원칙과 충돌한다.
- **함수 본문 안 인라인 = `//`**
  - 본문 안 구문에는 JSDoc을 붙일 수 없으니 `//` 라인 주석을 대상 바로 윗줄에 둔다.
  - 한 줄로 끝나는 단일 값에는 트레일링 `// ...`를 허용한다.
- **언어**: 주석 본문은 한국어, 식별자는 영어로 둔다.

## 3. 커버리지

- **파일 헤더 1줄(필수)**: 모든 FSD 파일 맨 위에 역할을 1줄 `/** */`로 명시한다. 단순 re-export만 하는 `index.ts`(barrel)는 생략한다.
- **모든 export 1줄(필수)**: export 함수·타입·상수 바로 윗줄에 목적 1줄 `/** */`.
- **비자명 인라인만**: 의도가 한눈에 안 보이는 로직(조건 분기·부수효과·트릭)에만 `//` WHY 1줄. 자명한 줄에는 주석을 달지 않는다.

## 4. 예시

`src/shared/config/env.ts` 기준.

```ts
/** 환경변수 읽기·검증 — 없으면 앱이 못 도는 값을 시작 시 한 번에 확인(fail-fast) */
type EnvSource = Record<string, string | undefined>;

/** 필수 env 누락 시 즉시 throw — 조용히 undefined로 새지 않게 */
const requireEnv = (source: EnvSource, key: string): string => {
  const value = source[key];
  // 빈 문자열도 누락으로 취급
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

/** 서버 전용 키 포함 — 브라우저로 새 나가면 안 되는 값 */
export const readServerEnv = (source: EnvSource = process.env): ServerEnv => ({
  ...readPublicEnv(source),
  supabaseServiceRoleKey: requireEnv(source, 'SUPABASE_SERVICE_ROLE_KEY'),
});
```

## 5. 금지

- 코드 받아쓰기(`// value를 가져온다`처럼 WHAT 중계).
- 주석 처리된 죽은 코드.
- author·changelog·날짜 같은 잡설.
- `@param`/`@returns` 태그 블록(4줄짜리 인자 풀이).

## 6. 예외

- 보안 위험·법적 구속·외부 시스템 회피처럼 길게 풀어쓸 정당한 이유가 있을 때만 멀티라인을 허용한다.
- 테스트 파일: `describe`/`it` 텍스트가 의도를 담으므로 비자명한 setup에만 인라인 주석을 단다.

## 7. 적용

규칙을 세운 시점부터 새로 작성·변경되는 파일에 적용한다. 기존 코드 일괄 소급은 하지 않는다(변경되는 파일부터 점진 적용).