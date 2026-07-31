# FLEX THIA local runtime

FLEX THIA를 외부 유료 AI·OCR·TTS provider 없이 로컬에서 수동 확인하는 방법입니다. Docker와 Docker Compose가 필요합니다.

## 시작과 종료

```bash
pnpm local:fresh
```

`fresh`는 FLEX THIA local database data를 초기화하고 seed media fixture를 만든 뒤 실행합니다. 기존 local 데이터를 유지하려면 다음 명령을 사용합니다.

```bash
pnpm local:preserve
```

종료할 때는 FLEX THIA Compose project만 중지하고 volume은 보존합니다.

```bash
pnpm local:stop
```

기본 접속 주소는 다음과 같습니다.

- Web: [http://localhost:5173](http://localhost:5173)
- API health: [http://localhost:53000/health](http://localhost:53000/health)
- API readiness: [http://localhost:53000/ready](http://localhost:53000/ready)
- Swagger: [http://localhost:53000/api/docs](http://localhost:53000/api/docs)

기존 host port와 충돌하면 `FLEX_THIA_POSTGRES_HOST_PORT`, `FLEX_THIA_API_HOST_PORT`, `FLEX_THIA_WEB_HOST_PORT`를 설정해 각각 `55432`, `53000`, `5173` 기본값을 바꿀 수 있습니다. Browser-facing URL을 함께 바꿀 때는 `FLEX_THIA_LOCAL_PUBLIC_ORIGIN`도 같은 web origin으로 설정합니다.

## Local 로그인

- 학습자: `learner@hufs.ac.kr` → 이메일 코드 `123456`
- 관리자: `admin@hufs.ac.kr` → 이메일 코드 `123456` → TOTP `123456`

## Upload부터 게시까지

관리자 로그인 뒤 Swagger의 `Admin Content Production`, `Admin Question Candidates`, `Admin TTS Operations`, `Admin Questions` 순서로 다음을 확인합니다.

1. `uploads/policies`로 TEXT, PDF 또는 IMAGE upload policy를 만들고, 응답 URL에 multipart form을 전송합니다.
2. `uploads/{uploadId}/complete`로 실제 bytes를 검사해 upload를 VERIFIED로 만듭니다.
3. `jobs`에서 업로드 ID와 활성 preset을 사용해 콘텐츠 제작 job을 만듭니다. 문제 생성이면 `options`에 question count, active question type version, difficulty plan, TTS voice preset을 입력합니다.
4. job 상세를 조회해 local queue가 candidate를 만든 것을 확인합니다. input ordinal 0은 후보를 만들고, ordinal 1은 검토 필요, ordinal 2는 재시도 가능한 실패 fixture입니다.
5. `question-candidates`에서 NORMAL 후보를 확인하고 `approve`합니다. 승인은 question DRAFT와 TTS outbox를 만듭니다.
6. `admin/tts`에서 local worker가 만든 READY audio를 확인합니다. 필요하면 TTS retry endpoint로 재요청합니다.
7. `admin/question-versions/{versionId}/validate` 후 `publish`로 검증된 DRAFT를 게시합니다.

질문 생성 API의 request shape와 활성 seed ID는 Swagger가 현재 실행 중인 계약을 보여 주므로, 해당 화면의 schema를 기준으로 입력합니다.

## Local 범위

local runtime은 실제 filesystem upload, signed media, deterministic candidate, local WAV fixture를 사용합니다. 유료 provider나 network 호출은 하지 않습니다. production에서 provider가 구성되지 않은 경우의 fail-closed 동작은 이 local runtime이 바꾸지 않습니다.
