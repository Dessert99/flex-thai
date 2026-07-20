# Troubleshooting Concepts Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 필요한 트러블슈팅 문서가 초심자에게 핵심 배경지식과 문제의 연결 맥락을 먼저 설명하게 한다.

**Architecture:** `troubleshooting-doc` 스킬에 선택적 `주요 개념` 계약과 템플릿을 추가한다. 방금 작성한 CI/CDK 트러블슈팅 문서를 실제 예시로 갱신해 스킬 지침과 산출물이 같은 구조를 갖게 한다.

**Tech Stack:** Markdown, Codex skill instructions, Prettier

## Global Constraints

- `주요 개념`은 특정 도구나 실행 환경의 전제지식이 필요할 때만 추가한다.
- 메타 정보 다음과 `증상` 사이에 `주요 개념`을 둔다.
- 문제의 인과관계를 따라가는 데 필요한 개념 2~5개만 선택한다.
- 각 개념은 `### 개념명`과 `일반적인 뜻 → 프로젝트 동작 → 문제와의 관계` 흐름으로 설명한다.
- 개념 설명에는 번호 문장 규칙을 적용하지 않는다.
- 확인하지 않은 일반 지식을 추측으로 채우지 않는다.
- 최종 변경을 사용자가 요청한 커밋으로 남긴다.

---

### Task 1: troubleshooting-doc 출력 계약 확장

**Files:**
- Modify: `.agents/skills/troubleshooting-doc/SKILL.md`

**Interfaces:**
- Consumes: 해결된 문제의 대화 기록, 프로젝트 코드, 관련 공식 문서
- Produces: 선택적 `주요 개념` 섹션을 포함할 수 있는 트러블슈팅 문서 작성 절차

- [x] **Step 1: 기존 스킬과 산출물의 누락을 RED로 확인한다**

Run:

```bash
rg -n '^## 주요 개념$' .agents/skills/troubleshooting-doc/SKILL.md docs/troubleshooting/2026-07-20-ci-cdk-esbuild-not-found.md
```

Expected: 일치하는 줄이 없어 종료 코드 1.

- [x] **Step 2: 개념 선택과 설명 규칙을 추가한다**

`교훈 한 줄` 다음에 아래 계약을 추가한다.

```markdown
## 주요 개념

`주요 개념`은 개발 지식은 있지만 해당 분야를 처음 접하는 독자가 `증상`과
`원인`을 이해하는 데 배경지식이 필요할 때만 추가한다.

- 특정 도구, 실행 환경, 프레임워크 동작을 모르면 인과관계를 따라갈 수 없는지 확인한다.
- 꼭 필요한 개념 2~5개만 고르고 본문에 등장하는 모든 용어를 사전화하지 않는다.
- 메타 정보 다음과 `증상` 사이에 `## 주요 개념`을 둔다.
- 각 개념은 `### 개념명` 소제목 아래에 `일반적인 뜻 → 이 프로젝트에서의 동작 → 이번 문제와의 관계` 순서로 풀어 쓴다.
- 전문용어로 다른 전문용어를 설명하지 않고, 추상적일 때만 짧은 예시를 덧붙인다.
- 개념 설명도 관찰한 코드나 공식 문서로 확인하며, 확신하지 못한 내용을 추측으로 채우지 않는다.

단순 오타처럼 별도 배경지식 없이 원인을 이해할 수 있으면 섹션을 생략한다.
```

- [x] **Step 3: 번호 문장 규칙의 적용 범위를 명시한다**

번호 문장 규칙에 아래 항목을 추가한다.

```markdown
- `주요 개념`은 독립적인 배경 설명이므로 번호 문장 규칙을 적용하지 않는다.
```

- [x] **Step 4: 재료 수집 절차와 템플릿을 갱신한다**

재료 목록에 아래 항목을 추가한다.

```markdown
- 증상과 원인을 이해하기 전에 알아야 할 도구·실행 환경·프레임워크 개념
```

템플릿의 메타 정보와 `증상` 사이에 아래 선택적 블록을 추가한다.

```markdown
## 주요 개념

### {개념명}

{일반적인 뜻과 프로젝트 동작, 이번 문제와의 관계를 처음 보는 사람도 이해할 수 있게 설명한다.}
```

- [x] **Step 5: 선택 기준을 템플릿 후속 규칙에 반영한다**

템플릿 아래에 아래 규칙을 추가한다.

```markdown
- `주요 개념`이 필요하면 2~5개를 고르고, 필요하지 않으면 섹션 전체를 지운다.
- `주요 개념`만 읽은 독자가 뒤따르는 `증상`과 `원인`의 용어 및 실행 흐름을 이해할 수 있는지 확인한다.
```

- [x] **Step 6: 스킬 문서 형식과 폴더 구조를 검증한다**

Run:

```bash
pnpm exec prettier --check .agents/skills/troubleshooting-doc/SKILL.md
git diff --check -- .agents/skills/troubleshooting-doc/SKILL.md
python3 -m pip install --target /tmp/troubleshooting-skill-validator PyYAML==6.0.2
PYTHONPATH=/tmp/troubleshooting-skill-validator python3 /Users/limjaejoon/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/troubleshooting-doc
```

Expected: 네 명령 모두 종료 코드 0이고 `Skill is valid!`이 출력된다.

### Task 2: CI/CDK 트러블슈팅 문서에 맥락 연결형 개념 적용

**Files:**
- Modify: `docs/troubleshooting/2026-07-20-ci-cdk-esbuild-not-found.md`
- Modify: `docs/troubleshooting/README.md`
- Test: Markdown 형식과 색인 링크

**Interfaces:**
- Consumes: Task 1의 `주요 개념` 선택·설명 계약
- Produces: 초심자가 pnpm workspace부터 병렬 번들링 경합까지 이해할 수 있는 실제 문서

- [x] **Step 1: 메타 정보와 증상 사이에 다섯 개념을 추가한다**

다음 소제목을 이 순서로 추가한다.

```markdown
## 주요 개념

### pnpm workspace와 의존성 범위

### CDK `NodejsFunction`과 번들링

### `esbuild`

### 깨끗한 CI 설치

### Vitest 병렬 실행과 자원 경합
```

각 소제목은 일반적인 뜻, 이 저장소에서의 실제 동작, 이번 실패와의 관계를
2~4개의 짧은 문단으로 설명한다.

- [x] **Step 2: 초심자 관점으로 연결성을 검토한다**

다섯 설명에서 `workspace`, `번들링`, `CLI`, `깨끗한 설치`, `CPU 경합`을
처음 사용할 때 쉬운 말로 정의하고, 각 설명의 마지막 문장이 뒤따르는
`증상` 또는 `원인`과 연결되는지 확인한다.

- [x] **Step 3: 문서와 색인을 검증한다**

Run:

```bash
pnpm exec prettier --check .agents/skills/troubleshooting-doc/SKILL.md docs/troubleshooting/2026-07-20-ci-cdk-esbuild-not-found.md docs/troubleshooting/README.md docs/superpowers/plans/2026-07-20-troubleshooting-concepts-section.md
git diff --check
test -f docs/troubleshooting/2026-07-20-ci-cdk-esbuild-not-found.md
rg -n '^## 주요 개념$|^### pnpm workspace와 의존성 범위$|^### CDK `NodejsFunction`과 번들링$|^### `esbuild`$|^### 깨끗한 CI 설치$|^### Vitest 병렬 실행과 자원 경합$' .agents/skills/troubleshooting-doc/SKILL.md docs/troubleshooting/2026-07-20-ci-cdk-esbuild-not-found.md
```

Expected: 모든 명령이 종료 코드 0이고 색인 링크 대상과 필요한 제목이 존재한다.

- [x] **Step 4: 최종 변경을 커밋한다**

```bash
git add .agents/skills/troubleshooting-doc/SKILL.md docs/troubleshooting/2026-07-20-ci-cdk-esbuild-not-found.md docs/troubleshooting/README.md docs/superpowers/plans/2026-07-20-troubleshooting-concepts-section.md
git commit -m "docs: explain troubleshooting concepts in context"
```
