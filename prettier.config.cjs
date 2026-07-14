/** @type {import('prettier').Config} */
module.exports = {
  // 한 줄 길이 기준; 예: 80이면 긴 코드를 대략 80자 근처에서 줄바꿈
  printWidth: 80,

  // 들여쓰기 공백 수; 예: 2면 스페이스 2칸
  tabWidth: 2,

  // 탭 대신 스페이스 사용; 예: false면 스페이스로 들여쓰기
  useTabs: false,

  // 문장 끝 세미콜론 사용; 예: const value = 1;
  semi: true,

  // 문자열에 작은따옴표 사용; 예: 'hello'
  singleQuote: true,

  // 객체 키 따옴표는 필요할 때만 사용; 예: { name: 'a', 'user-id': 1 }
  quoteProps: 'as-needed',

  // 여러 줄 구조에서 가능한 곳에 마지막 쉼표 사용; 예: ['a', 'b',]
  trailingComma: 'all',

  // 객체 중괄호 안쪽 공백 사용; 예: { name: 'Jaejoon' }
  bracketSpacing: true,

  // 화살표 함수 인자 괄호 항상 사용; 예: (value) => value
  arrowParens: 'always',

  // 줄바꿈 문자를 LF로 통일; 예: macOS/Linux/Git 저장소 기준
  endOfLine: 'lf',

  // Markdown 문단을 자동 줄바꿈하지 않음; 예: README 문장을 한 줄로 유지
  proseWrap: 'never',

  // JSX 속성 문자열에 작은따옴표 사용; 예: <Button label='저장' />
  jsxSingleQuote: true,

  // JSX/HTML 속성을 한 줄에 하나씩 배치; 예: props를 세로로 정렬
  singleAttributePerLine: true,

  // 여러 줄 JSX 태그의 닫는 꺾쇠를 다음 줄에 둠; 예: props와 children 경계 분리
  bracketSameLine: false,
};
