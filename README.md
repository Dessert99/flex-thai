# FLEX THIA local runtime

FLEX THIA를 외부 유료 AI·OCR provider 없이 로컬에서 수동 확인하는 방법입니다. Docker와 Docker Compose가 필요합니다.

## 시작과 종료

개발 중에는 Web HMR과 API·worker 자동 재시작을 사용하는 dev profile을 실행합니다. PostgreSQL data는 유지됩니다.

```bash
pnpm local:dev
```

React와 backend workspace의 `src` 변경은 실행 중인 컨테이너에 바로 반영됩니다. 의존성이나 Docker 설정을 바꾼 경우에는 명령을 다시 실행해 image를 갱신합니다.

아직 로컬 database를 만든 적이 없다면 아래 `pnpm local:fresh`를 한 번 실행해 초기 데이터를 준비한 뒤 `pnpm local:dev`를 사용합니다.

배포와 유사한 build 결과를 처음부터 확인하려면 다음 명령을 사용합니다.

```bash
pnpm local:fresh
```

`fresh`는 FLEX THIA local database data를 초기화하고 샘플 데이터를 만든 뒤 실행합니다. 기존 local 데이터를 유지하려면 다음 명령을 사용합니다.

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

기존 host port와 충돌하면 `FLEX_THIA_POSTGRES_HOST_PORT`, `FLEX_THIA_API_HOST_PORT`, `FLEX_THIA_WEB_HOST_PORT`를 설정해 각각 `55432`, `53000`, `5173` 기본값을 바꿀 수 있습니다. Web port를 바꿀 때는 `FLEX_THIA_LOCAL_PUBLIC_ORIGIN`도 같은 web origin으로 설정하며, 이 값이 CORS·이메일 확인 링크·upload URL에 함께 적용됩니다.

## Local 로그인

- 학습자: `learner@hufs.ac.kr` → 이메일 코드 `123456`
- 관리자: `admin@hufs.ac.kr` → 이메일 코드 `123456` → TOTP `123456`

## Upload부터 게시까지

관리자 로그인 뒤 Swagger의 콘텐츠 제작과 어휘 후보 검수 API를 사용합니다.

1. `uploads/policies`로 upload policy를 만들고 응답 URL에 파일을 전송합니다.
2. `uploads/{uploadId}/complete`로 업로드를 완료합니다.
3. `GET /api/v1/admin/content-production/presets`에서 활성 어휘 추출 preset을 선택합니다.
4. `POST /api/v1/admin/content-production/jobs`로 작업을 생성하고 작업 상세에서 결과를 확인합니다.
5. `vocabulary-candidates`에서 어휘 후보를 검수하고 승인합니다.

fresh seed의 VERIFIED upload와 어휘 추출 preset을 사용하는 작업 요청 예시입니다. 새 작업에는 새 `clientRequestId`를 사용합니다.

```json
{
  "clientRequestId": "11111111-1111-4111-8111-111111111111",
  "uploadIds": ["00000000-0000-4000-8000-000000000930"],
  "purpose": "VOCABULARY_EXTRACTION",
  "presetId": "00000000-0000-4000-8000-000000000901",
  "options": {}
}
```

## Local 범위

local runtime은 실제 filesystem upload, deterministic candidate를 사용합니다. 유료 provider나 network 호출은 하지 않습니다. production에서 provider가 구성되지 않은 경우의 fail-closed 동작은 이 local runtime이 바꾸지 않습니다.
