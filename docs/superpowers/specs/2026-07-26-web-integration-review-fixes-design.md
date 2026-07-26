# Web Integration Review Fixes Design

## Goal

어휘 상세의 예문 번역과 route 전환 시 단어장 membership을 정확히 표시하고, FSD excessive-slicing 예외를 필요한 page layer로 제한한다.

## Design

`InteractiveThaiSentence`는 기본값이 `false`인 `showTranslation` prop을 받는다. 어휘 상세만 이 값을 활성화해 `translationKo`를 문장 아래에 표시하며, 문제 풀이처럼 번역을 숨겨야 하는 기존 소비자는 바꾸지 않는다.

`VocabularyDetailPageView`는 `VocabularyWordbookPicker`에 `key={detail.id}`를 준다. 같은 route component가 다른 어휘를 렌더링하면 이전 어휘의 mutation·dialog·확정 membership 상태를 함께 폐기하고 새 어휘의 서버 query를 기준으로 다시 시작한다.

Steiger의 recommended excessive-slicing 규칙은 전역에서 유지한다. 현재 threshold를 넘는 `src/pages/**` 진단에만 `off` override를 적용해 features/entities/widgets의 향후 과도한 slice 분할은 다시 검출한다.

## Verification

- 예문 fixture의 `나는 온다`가 어휘 상세에서 보이고, 기본 `InteractiveThaiSentence`에서는 번역이 숨겨진다.
- 상세 View를 어휘 A에서 membership 변경 후 어휘 B로 rerender하면 B의 서버 membership이 보이고 B 추가 요청은 `PUT`을 사용한다.
- polling을 활성화한 architecture check와 웹 전체 test/typecheck/build/lint/format gate가 통과한다.
