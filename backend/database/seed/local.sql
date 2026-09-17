-- 모든 MVP 화면이 대표 상태를 표시하도록 고정된 로컬 데이터 그래프를 만든다.
begin;

insert into users (
  id,
  cognito_sub,
  email,
  role,
  status,
  phone_verified_at,
  mfa_enrolled_at,
  created_at,
  updated_at
) values
  (
    '00000000-0000-4000-8000-000000000001',
    'local-admin-sub',
    'admin@hufs.ac.kr',
    'ADMIN',
    'ACTIVE',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'local-learner-sub',
    'learner@hufs.ac.kr',
    'LEARNER',
    'ACTIVE',
    null,
    null,
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  );

update operations_cost_settings
set
  currency = 'USD',
  warning_usd = '15.000000',
  critical_usd = '24.000000',
  updated_at = '2026-07-01T00:00:00Z',
  updated_by = '00000000-0000-4000-8000-000000000001',
  last_request_id = null,
  last_request_fingerprint = null
where id = 1;



insert into vocabularies (
  id,
  thai,
  normalized_thai,
  kind,
  status,
  published_at,
  created_at,
  updated_at
) values
  (
    '00000000-0000-4000-8000-000000000101',
    'สวัสดี',
    'สวัสดี',
    'WORD',
    'PUBLISHED',
    '2026-07-05T00:00:00Z',
    '2026-07-01T00:00:00Z',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'ขอบคุณ',
    'ขอบคุณ',
    'WORD',
    'PUBLISHED',
    '2026-07-06T00:00:00Z',
    '2026-07-02T00:00:00Z',
    '2026-07-06T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    'ไม่เป็นไร',
    'ไม่เป็นไร',
    'EXPRESSION',
    'DRAFT',
    null,
    '2026-07-03T00:00:00Z',
    '2026-07-07T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    'เรียน',
    'เรียน',
    'WORD',
    'HIDDEN',
    null,
    '2026-07-04T00:00:00Z',
    '2026-07-08T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000105',
    'ขอโทษ',
    'ขอโทษ',
    'WORD',
    'PUBLISHED',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000106',
    'ใช่',
    'ใช่',
    'WORD',
    'PUBLISHED',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000107',
    'ไม่',
    'ไม่',
    'WORD',
    'PUBLISHED',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000108',
    'กิน',
    'กิน',
    'WORD',
    'PUBLISHED',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000109',
    'ดื่ม',
    'ดื่ม',
    'WORD',
    'PUBLISHED',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000110',
    'ไป',
    'ไป',
    'WORD',
    'PUBLISHED',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000111',
    'มา',
    'มา',
    'WORD',
    'PUBLISHED',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000112',
    'บ้าน',
    'บ้าน',
    'WORD',
    'PUBLISHED',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z',
    '2026-07-05T00:00:00Z'
  );

insert into vocabulary_meanings (
  id,
  vocabulary_id,
  meaning_ko,
  part_of_speech,
  difficulty,
  context_note,
  created_at
) values
  (
    '00000000-0000-4000-8000-000000000111',
    '00000000-0000-4000-8000-000000000101',
    '안녕하세요',
    '감탄사',
    1,
    '태국어의 기본 인사말',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000112',
    '00000000-0000-4000-8000-000000000102',
    '감사합니다',
    '감탄사',
    1,
    '감사를 표현할 때 사용',
    '2026-07-02T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000113',
    '00000000-0000-4000-8000-000000000103',
    '괜찮습니다',
    '표현',
    2,
    '사과나 감사에 답할 때 사용',
    '2026-07-03T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000114',
    '00000000-0000-4000-8000-000000000104',
    '배우다',
    '동사',
    2,
    null,
    '2026-07-04T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000115',
    '00000000-0000-4000-8000-000000000105',
    '죄송합니다',
    '감탄사',
    1,
    '사과할 때 사용',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000116',
    '00000000-0000-4000-8000-000000000106',
    '네',
    '부사',
    1,
    '긍정할 때 사용',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000117',
    '00000000-0000-4000-8000-000000000107',
    '아니요',
    '부사',
    1,
    '부정할 때 사용',
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000118',
    '00000000-0000-4000-8000-000000000108',
    '먹다',
    '동사',
    1,
    null,
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000119',
    '00000000-0000-4000-8000-000000000109',
    '마시다',
    '동사',
    1,
    null,
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000120',
    '00000000-0000-4000-8000-000000000110',
    '가다',
    '동사',
    1,
    null,
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000121',
    '00000000-0000-4000-8000-000000000111',
    '오다',
    '동사',
    1,
    null,
    '2026-07-05T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000122',
    '00000000-0000-4000-8000-000000000112',
    '집',
    '명사',
    1,
    null,
    '2026-07-05T00:00:00Z'
  );





insert into thai_sentences (id, created_at) values
  ('00000000-0000-4000-8000-000000000201', '2026-07-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000202', '2026-07-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000203', '2026-07-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000204', '2026-07-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000205', '2026-07-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000206', '2026-07-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000207', '2026-07-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000208', '2026-07-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000209', '2026-07-01T00:00:00Z');

insert into thai_sentence_versions (
  id,
  sentence_id,
  version,
  original_text,
  translation_ko,
  frozen_at,
  created_at
) values
  (
    '00000000-0000-4000-8000-000000000211',
    '00000000-0000-4000-8000-000000000201',
    1,
    'สวัสดี',
    '다음 태국어의 뜻을 고르세요.',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000212',
    '00000000-0000-4000-8000-000000000202',
    1,
    '안녕하세요',
    '안녕하세요',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000213',
    '00000000-0000-4000-8000-000000000203',
    1,
    '감사합니다',
    '감사합니다',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000214',
    '00000000-0000-4000-8000-000000000204',
    1,
    '괜찮습니다',
    '괜찮습니다',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000215',
    '00000000-0000-4000-8000-000000000205',
    1,
    '미안합니다',
    '미안합니다',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000216',
    '00000000-0000-4000-8000-000000000206',
    1,
    'ขอบคุณ',
    '다음 태국어의 뜻을 고르세요.',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000217',
    '00000000-0000-4000-8000-000000000207',
    1,
    'สวัสดี는 기본 인사말입니다.',
    'สวัสดี는 안녕하세요라는 뜻입니다.',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000218',
    '00000000-0000-4000-8000-000000000208',
    1,
    'ขอบคุณ은 감사를 표현합니다.',
    'ขอบคุณ은 감사합니다라는 뜻입니다.',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000219',
    '00000000-0000-4000-8000-000000000209',
    1,
    'สวัสดี',
    '다음 태국어의 뜻을 고르세요.',
    null,
    '2026-07-01T00:01:00Z'
  );

insert into token_occurrences (
  id,
  sentence_version_id,
  position,
  surface,
  start_offset,
  end_offset,
  vocabulary_id,
  meaning_id,
  context_meaning_ko,
  role
) values
  (
    '00000000-0000-4000-8000-000000000221',
    '00000000-0000-4000-8000-000000000211',
    0,
    'สวัสดี',
    0,
    6,
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000111',
    '안녕하세요',
    'TARGET'
  ),
  (
    '00000000-0000-4000-8000-000000000222',
    '00000000-0000-4000-8000-000000000216',
    0,
    'ขอบคุณ',
    0,
    6,
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000112',
    '감사합니다',
    'TARGET'
  ),
  (
    '00000000-0000-4000-8000-000000000223',
    '00000000-0000-4000-8000-000000000219',
    0,
    'สวัสดี',
    0,
    6,
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000111',
    '안녕하세요',
    'TARGET'
  );

insert into question_topics (
  id,
  slug,
  display_name,
  status,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000320',
  'general',
  '일반',
  'ACTIVE',
  '2026-07-01T00:00:00Z',
  '2026-07-01T00:00:00Z'
)
on conflict (slug) do update set
  display_name = excluded.display_name,
  status = excluded.status,
  updated_at = excluded.updated_at;

insert into content_production_presets (
  id,
  name,
  purpose,
  version,
  parameters,
  enabled
) values
  (
    '00000000-0000-4000-8000-000000000901',
    '기본 어휘 추출',
    'VOCABULARY_EXTRACTION',
    1,
    '{"suspectedDuplicateMaxCodePointDistance":1}'::jsonb,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000902',
    '기본 문제 생성',
    'QUESTION_GENERATION',
    1,
    '{}'::jsonb,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000903',
    '기본 어휘·문제 생성',
    'VOCABULARY_THEN_QUESTION_GENERATION',
    1,
    '{"suspectedDuplicateMaxCodePointDistance":1}'::jsonb,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000904',
    '기본 문제 생성',
    'QUESTION_GENERATION',
    2,
    '{"promptRevision":"retired-local-v2"}'::jsonb,
    false
  )
on conflict (name, version) do update set
  parameters = excluded.parameters,
  enabled = excluded.enabled;

insert into uploads (
  id,
  owner_id,
  input_type,
  object_key,
  declared_content_type,
  size_bytes,
  status,
  verified_at,
  created_at
) values (
  '00000000-0000-4000-8000-000000000930',
  '00000000-0000-4000-8000-000000000001',
  'TEXT',
  'local/content-production/source.txt',
  'text/plain',
  128,
  'VERIFIED',
  '2026-07-01T00:00:00Z',
  '2026-07-01T00:00:00Z'
);

insert into jobs (
  id,
  requested_by,
  client_request_id,
  type,
  purpose,
  preset_id,
  preset_snapshot,
  status,
  attempt,
  enqueued_at,
  completed_at,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000931',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000932',
  'QUESTION_GENERATION',
  'QUESTION_GENERATION',
  '00000000-0000-4000-8000-000000000902',
  '{"id":"00000000-0000-4000-8000-000000000902","name":"기본 문제 생성","purpose":"QUESTION_GENERATION","version":1,"parameters":{}}'::jsonb,
  'COMPLETED',
  0,
  '2026-07-01T00:00:00Z',
  '2026-07-01T00:01:00Z',
  '2026-07-01T00:00:00Z',
  '2026-07-01T00:01:00Z'
);

insert into job_inputs (
  id,
  job_id,
  upload_id,
  ordinal,
  created_at
) values (
  '00000000-0000-4000-8000-000000000933',
  '00000000-0000-4000-8000-000000000931',
  '00000000-0000-4000-8000-000000000930',
  0,
  '2026-07-01T00:00:00Z'
);

insert into job_items (
  id,
  job_id,
  job_input_id,
  operation,
  status,
  source_ref,
  attempt,
  retryable,
  result,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000934',
  '00000000-0000-4000-8000-000000000931',
  '00000000-0000-4000-8000-000000000933',
  'QUESTION_GENERATION',
  'SUCCEEDED',
  'local-source-1',
  0,
  false,
  '{"generatedCount":1}'::jsonb,
  '2026-07-01T00:00:00Z',
  '2026-07-01T00:01:00Z'
);

insert into provider_runs (
  id,
  job_item_id,
  operation,
  sequence,
  provider,
  model,
  prompt_version,
  item_lease_token,
  attempt,
  status,
  usage,
  estimated_cost_usd,
  success,
  result,
  retryable,
  provider_request_id,
  started_at,
  finished_at
) values (
  '00000000-0000-4000-8000-000000000935',
  '00000000-0000-4000-8000-000000000934',
  'QUESTION_GENERATION',
  0,
  'LOCAL_FAKE',
  'deterministic-content-v1',
  'local-prompt-v1',
  'local-lease-1',
  0,
  'SUCCEEDED',
  '{"inputTokens":100,"outputTokens":50}'::jsonb,
  '0.750000',
  true,
  '{"generatedCount":1}'::jsonb,
  false,
  'local-content-provider-request',
  '2026-07-01T00:00:00Z',
  '2026-07-01T00:01:00Z'
);

















insert into question_types (
  id,
  slug,
  display_name,
  skill,
  major_category,
  created_at,
  updated_at
) values
  (
    '00000000-0000-4000-8000-000000000301',
    'reading-vocabulary',
    '어휘 의미 선택',
    'READING',
    'READING_VOCABULARY_GRAMMAR',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000305',
    'reading-synonym-relation',
    '동의·유의 관계',
    'READING',
    'READING_SYNONYM_RELATION',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000306',
    'reading-error-identification',
    '비문 찾기',
    'READING',
    'READING_ERROR_IDENTIFICATION',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000307',
    'reading-passage',
    '지문 독해',
    'READING',
    'READING_PASSAGE',
    '2026-07-01T00:00:00Z',
    '2026-07-01T00:00:00Z'
  );

insert into question_type_versions (
  id,
  question_type_id,
  version,
  template,
  option_count,
  status,
  decision_rules
) values
  (
    '00000000-0000-4000-8000-000000000311',
    '00000000-0000-4000-8000-000000000301',
    1,
    'STANDARD_CHOICE',
    4,
    'ACTIVE',
    '{"mode":"single-choice"}'
  ),
  (
    '00000000-0000-4000-8000-000000000315',
    '00000000-0000-4000-8000-000000000305',
    1,
    'STANDARD_CHOICE',
    4,
    'DRAFT',
    '{"mode":"single-choice"}'
  ),
  (
    '00000000-0000-4000-8000-000000000316',
    '00000000-0000-4000-8000-000000000306',
    1,
    'INLINE_SPAN_CHOICE',
    4,
    'DRAFT',
    '{"mode":"single-choice"}'
  ),
  (
    '00000000-0000-4000-8000-000000000317',
    '00000000-0000-4000-8000-000000000307',
    1,
    'PASSAGE_CHOICE',
    4,
    'DRAFT',
    '{"mode":"single-choice"}'
  );

insert into question_production_candidates (
  id,
  job_item_id,
  job_attempt,
  ordinal,
  type_version_id,
  payload_state,
  topic_id,
  difficulty,
  payload,
  payload_hash,
  result_group,
  review_status,
  review_code,
  revision,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000936',
  '00000000-0000-4000-8000-000000000934',
  0,
  0,
  '00000000-0000-4000-8000-000000000311',
  'REDACTED_INVALID',
  null,
  null,
  null,
  repeat('a', 64),
  'FAILED',
  'PENDING',
  'SCHEMA_VALIDATION_FAILED',
  0,
  '2026-07-01T00:00:30Z',
  '2026-07-01T00:00:30Z'
);

with source_questions(id, status, difficulty, prompt_id, explanation_id) as (values
 ('00000000-0000-4000-8000-000000000401'::uuid, 'PUBLISHED'::question_status, 1, '00000000-0000-4000-8000-000000000211'::uuid, '00000000-0000-4000-8000-000000000217'::uuid),
 ('00000000-0000-4000-8000-000000000402'::uuid, 'PUBLISHED'::question_status, 2, '00000000-0000-4000-8000-000000000216'::uuid, '00000000-0000-4000-8000-000000000218'::uuid),
 ('00000000-0000-4000-8000-000000000403'::uuid, 'DRAFT'::question_status, 3, '00000000-0000-4000-8000-000000000219'::uuid, '00000000-0000-4000-8000-000000000217'::uuid),
 ('00000000-0000-4000-8000-000000000404'::uuid, 'HIDDEN'::question_status, 2, '00000000-0000-4000-8000-000000000216'::uuid, '00000000-0000-4000-8000-000000000218'::uuid)
), source_options(id, question_id, sentence_id, position, correct) as (values
('00000000-0000-4000-8000-000000000431'::uuid, '00000000-0000-4000-8000-000000000401'::uuid, '00000000-0000-4000-8000-000000000212'::uuid, 0, true),
('00000000-0000-4000-8000-000000000432'::uuid, '00000000-0000-4000-8000-000000000401'::uuid, '00000000-0000-4000-8000-000000000213'::uuid, 1, false),
('00000000-0000-4000-8000-000000000433'::uuid, '00000000-0000-4000-8000-000000000401'::uuid, '00000000-0000-4000-8000-000000000214'::uuid, 2, false),
('00000000-0000-4000-8000-000000000434'::uuid, '00000000-0000-4000-8000-000000000401'::uuid, '00000000-0000-4000-8000-000000000215'::uuid, 3, false),
('00000000-0000-4000-8000-000000000435'::uuid, '00000000-0000-4000-8000-000000000402'::uuid, '00000000-0000-4000-8000-000000000213'::uuid, 0, true),
('00000000-0000-4000-8000-000000000436'::uuid, '00000000-0000-4000-8000-000000000402'::uuid, '00000000-0000-4000-8000-000000000212'::uuid, 1, false),
('00000000-0000-4000-8000-000000000437'::uuid, '00000000-0000-4000-8000-000000000402'::uuid, '00000000-0000-4000-8000-000000000214'::uuid, 2, false),
('00000000-0000-4000-8000-000000000438'::uuid, '00000000-0000-4000-8000-000000000402'::uuid, '00000000-0000-4000-8000-000000000215'::uuid, 3, false),
('00000000-0000-4000-8000-000000000439'::uuid, '00000000-0000-4000-8000-000000000403'::uuid, '00000000-0000-4000-8000-000000000212'::uuid, 0, true),
('00000000-0000-4000-8000-000000000440'::uuid, '00000000-0000-4000-8000-000000000403'::uuid, '00000000-0000-4000-8000-000000000213'::uuid, 1, false),
('00000000-0000-4000-8000-000000000441'::uuid, '00000000-0000-4000-8000-000000000403'::uuid, '00000000-0000-4000-8000-000000000214'::uuid, 2, false),
('00000000-0000-4000-8000-000000000442'::uuid, '00000000-0000-4000-8000-000000000403'::uuid, '00000000-0000-4000-8000-000000000215'::uuid, 3, false),
('00000000-0000-4000-8000-000000000443'::uuid, '00000000-0000-4000-8000-000000000404'::uuid, '00000000-0000-4000-8000-000000000213'::uuid, 0, true),
('00000000-0000-4000-8000-000000000444'::uuid, '00000000-0000-4000-8000-000000000404'::uuid, '00000000-0000-4000-8000-000000000212'::uuid, 1, false),
('00000000-0000-4000-8000-000000000445'::uuid, '00000000-0000-4000-8000-000000000404'::uuid, '00000000-0000-4000-8000-000000000214'::uuid, 2, false),
('00000000-0000-4000-8000-000000000446'::uuid, '00000000-0000-4000-8000-000000000404'::uuid, '00000000-0000-4000-8000-000000000215'::uuid, 3, false)
)
insert into questions (id, status, type_version_id, topic_id, difficulty, version, prompt, options, correct_option_id, explanation, published_at)
select q.id, q.status, '00000000-0000-4000-8000-000000000311'::uuid, '00000000-0000-4000-8000-000000000320'::uuid,
 q.difficulty, 1, prompt.original_text,
 (select jsonb_agg(jsonb_build_object('id', o.id, 'text', sentence.original_text) order by o.position) from source_options o join thai_sentence_versions sentence on sentence.id = o.sentence_id where o.question_id = q.id),
 (select o.id from source_options o where o.question_id = q.id and o.correct), explanation.original_text,
 case when q.status = 'DRAFT' then null else '2026-07-10T00:00:00Z'::timestamptz end
from source_questions q join thai_sentence_versions prompt on prompt.id = q.prompt_id join thai_sentence_versions explanation on explanation.id = q.explanation_id;

insert into question_vocabularies (question_id, vocabulary_id, meaning_id, role, occurrence_count)
select q.id, t.vocabulary_id, (array_agg(t.meaning_id))[1], 'TARGET', count(*)::int
from questions q join thai_sentence_versions s on s.original_text = q.prompt
join token_occurrences t on t.sentence_version_id = s.id and t.role = 'TARGET'
group by q.id, t.vocabulary_id;

insert into question_type_difficulty_criteria (
  type_version_id,
  difficulty,
  criteria
) values
  ('00000000-0000-4000-8000-000000000311', 1, '기본 어휘의 뜻을 단일 문장에서 구별한다.'),
  ('00000000-0000-4000-8000-000000000311', 2, '자주 쓰는 표현의 뜻을 유사 선택지와 구별한다.'),
  ('00000000-0000-4000-8000-000000000311', 3, '문맥 속 어휘와 문법 단서를 함께 판단한다.'),
  ('00000000-0000-4000-8000-000000000311', 4, '낯선 어휘를 문장 구조와 의미 관계로 추론한다.'),
  ('00000000-0000-4000-8000-000000000311', 5, '복합 문맥의 미세한 어휘·문법 차이를 판단한다.');

insert into question_type_approved_examples (
  id,
  type_version_id,
  title,
  payload,
  payload_hash,
  created_at
) values (
  '00000000-0000-4000-8000-000000000318',
  '00000000-0000-4000-8000-000000000311',
  'canonical-reading-vocabulary-v1',
  $readingVocabularyExample$
{
  "questionTypeSlug": "reading-vocabulary",
  "questionTypeVersion": 1,
  "difficulty": 1,
  "topicSlug": "general",
  "tagSlugs": [],
  "blocks": [
    {
      "kind": "QUESTION",
      "sentences": [
        {
          "sentence": {
            "originalText": "สวัสดี",
            "translationKo": "다음 태국어의 뜻을 고르세요.",
            "tokens": [
              {
                "surface": "สวัสดี",
                "startOffset": 0,
                "endOffset": 6,
                "vocabulary": {
                  "id": "00000000-0000-4000-8000-000000000101"
                },
                "meaning": {
                  "id": "00000000-0000-4000-8000-000000000111"
                },
                "contextMeaningKo": "안녕하세요",
                "role": "TARGET"
              }
            ],
            "expressions": []
          }
        }
      ]
    },
    {
      "kind": "EXPLANATION",
      "sentences": [
        {
          "sentence": {
            "originalText": "สวัสดี는 기본 인사말입니다.",
            "translationKo": "สวัสดี는 안녕하세요라는 뜻입니다.",
            "tokens": [],
            "expressions": []
          }
        }
      ]
    }
  ],
  "options": [
    {
      "clientRef": "option-1",
      "position": 0,
      "sentence": {
        "originalText": "안녕하세요",
        "translationKo": "안녕하세요",
        "tokens": [],
        "expressions": []
      },
      "span": null
    },
    {
      "clientRef": "option-2",
      "position": 1,
      "sentence": {
        "originalText": "감사합니다",
        "translationKo": "감사합니다",
        "tokens": [],
        "expressions": []
      },
      "span": null
    },
    {
      "clientRef": "option-3",
      "position": 2,
      "sentence": {
        "originalText": "괜찮습니다",
        "translationKo": "괜찮습니다",
        "tokens": [],
        "expressions": []
      },
      "span": null
    },
    {
      "clientRef": "option-4",
      "position": 3,
      "sentence": {
        "originalText": "미안합니다",
        "translationKo": "미안합니다",
        "tokens": [],
        "expressions": []
      },
      "span": null
    }
  ],
  "correctOptionRef": "option-1"
}
$readingVocabularyExample$::jsonb,
  '4f8d889208185a1c356a922bd350eafa881fc7ea5e0bb9082c29bf12eed810a8',
  '2026-07-10T00:00:00Z'
);

insert into question_attempts (id, user_id, question_id, question_version, question_snapshot, attempt_no, selected_option_id, client_attempt_id, duration_ms, is_correct, submitted_at)
select '00000000-0000-4000-8000-000000000501'::uuid, '00000000-0000-4000-8000-000000000002'::uuid, q.id, q.version,
 jsonb_build_object('updatedAt', to_char(q.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'version', q.version, 'typeVersionId', q.type_version_id, 'difficulty', q.difficulty, 'passage', q.passage, 'prompt', q.prompt, 'options', q.options, 'correctOptionId', q.correct_option_id, 'explanation', q.explanation),
 1, q.correct_option_id, '00000000-0000-4000-8000-000000000511'::uuid, 4200, true, '2026-07-15T00:00:00Z'::timestamptz
from questions q where q.id = '00000000-0000-4000-8000-000000000401';

insert into saved_questions (user_id, question_id, saved_at) values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000401',
  '2026-07-15T00:00:00Z'
);

insert into wordbooks (
  id,
  user_id,
  name,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000551',
  '00000000-0000-4000-8000-000000000002',
  '저장한 어휘',
  '2026-07-15T00:00:00Z',
  '2026-07-15T00:00:00Z'
);

insert into wordbook_items (wordbook_id, vocabulary_id, added_at) values
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000101', '2026-07-15T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000102', '2026-07-15T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000105', '2026-07-15T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000106', '2026-07-15T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000107', '2026-07-15T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000108', '2026-07-15T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000109', '2026-07-15T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000110', '2026-07-15T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000111', '2026-07-15T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000112', '2026-07-15T00:00:00Z');

insert into content_imports (
  id,
  requested_by,
  idempotency_key,
  request_hash,
  status,
  vocabulary_count,
  question_count,
  imported_count,
  rejected_count,
  created_at,
  completed_at
) values (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000602',
  repeat('d', 64),
  'COMPLETED_WITH_FAILURES',
  1,
  1,
  1,
  1,
  '2026-07-16T00:00:00Z',
  '2026-07-16T00:01:00Z'
);

insert into content_import_items (
  id,
  import_id,
  kind,
  source_index,
  client_ref,
  status,
  target_id,
  errors,
  reference_map,
  created_at
) values
  (
    '00000000-0000-4000-8000-000000000611',
    '00000000-0000-4000-8000-000000000601',
    'VOCABULARY',
    0,
    'local-draft-vocabulary',
    'IMPORTED',
    '00000000-0000-4000-8000-000000000103',
    '[]',
    '{"local-draft-vocabulary":"00000000-0000-4000-8000-000000000103"}',
    '2026-07-16T00:00:30Z'
  ),
  (
    '00000000-0000-4000-8000-000000000612',
    '00000000-0000-4000-8000-000000000601',
    'QUESTION',
    0,
    'local-rejected-question',
    'REJECTED',
    null,
    '[{"path":"questions.0.options","code":"OPTION_COUNT_INVALID"}]',
    '{}',
    '2026-07-16T00:00:40Z'
  );

insert into concepts (
  id,
  status,
  current_published_version_id,
  created_at,
  updated_at
) values
  (
    '00000000-0000-4000-8000-000000000701',
    'PUBLISHED',
    null,
    '2026-07-17T00:00:00Z',
    '2026-07-17T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000702',
    'PUBLISHED',
    null,
    '2026-07-17T00:00:00Z',
    '2026-07-17T00:00:00Z'
  );

insert into concept_versions (
  id,
  concept_id,
  version,
  revision,
  category,
  position,
  title,
  summary,
  status,
  validation_status,
  validation_issues,
  validated_revision,
  validated_at,
  published_at,
  created_at,
  updated_at
) values
  (
    '00000000-0000-4000-8000-000000000711',
    '00000000-0000-4000-8000-000000000701',
    1,
    0,
    'THAI_SCRIPT',
    0,
    '태국어 인사말의 쓰임',
    '기본 인사말의 뜻과 쓰임을 실제 문장으로 익힙니다.',
    'PUBLISHED',
    'PASSED',
    '[]',
    0,
    '2026-07-17T00:10:00Z',
    '2026-07-17T00:20:00Z',
    '2026-07-17T00:00:00Z',
    '2026-07-17T00:20:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000712',
    '00000000-0000-4000-8000-000000000702',
    1,
    0,
    'GRAMMAR',
    0,
    '감사 표현의 기본 구조',
    '감사를 나타내는 표현과 사용하는 상황을 문장으로 익힙니다.',
    'PUBLISHED',
    'PASSED',
    '[]',
    0,
    '2026-07-17T00:10:00Z',
    '2026-07-17T00:20:00Z',
    '2026-07-17T00:00:00Z',
    '2026-07-17T00:20:00Z'
  );

update concepts
set current_published_version_id = case id
  when '00000000-0000-4000-8000-000000000701' then '00000000-0000-4000-8000-000000000711'::uuid
  when '00000000-0000-4000-8000-000000000702' then '00000000-0000-4000-8000-000000000712'::uuid
  else current_published_version_id
end;

insert into concept_blocks (
  id,
  concept_version_id,
  kind,
  position,
  heading,
  paragraphs,
  table_headers,
  table_rows
) values
  (
    '00000000-0000-4000-8000-000000000721',
    '00000000-0000-4000-8000-000000000711',
    'EXPLANATION',
    0,
    '인사말을 소리 내어 읽기',
    '["สวัสดี는 처음 만났을 때와 일상적인 인사에 두루 사용합니다."]',
    null,
    null
  ),
  (
    '00000000-0000-4000-8000-000000000722',
    '00000000-0000-4000-8000-000000000711',
    'THAI_EXAMPLES',
    1,
    '인사말 예문',
    null,
    null,
    null
  ),
  (
    '00000000-0000-4000-8000-000000000723',
    '00000000-0000-4000-8000-000000000712',
    'RULE_TABLE',
    0,
    '감사 표현',
    null,
    '["표현","쓰임"]',
    '[["ขอบคุณ","고마움을 전할 때 사용"]]'
  ),
  (
    '00000000-0000-4000-8000-000000000724',
    '00000000-0000-4000-8000-000000000712',
    'THAI_EXAMPLES',
    1,
    '감사 표현 예문',
    null,
    null,
    null
  );

insert into concept_block_examples (
  id,
  block_id,
  position,
  sentence_version_id,
  note_ko
) values
  (
    '00000000-0000-4000-8000-000000000731',
    '00000000-0000-4000-8000-000000000722',
    0,
    '00000000-0000-4000-8000-000000000217',
    '인사말의 뜻과 쓰임을 함께 확인합니다.'
  ),
  (
    '00000000-0000-4000-8000-000000000732',
    '00000000-0000-4000-8000-000000000724',
    0,
    '00000000-0000-4000-8000-000000000218',
    '감사 표현이 쓰이는 문맥을 확인합니다.'
  );

insert into content_error_reports (
  id,
  reporter_user_id,
  target_kind,
  category,
  status,
  assignee_user_id,
  description,
  canonical_reference,
  snapshot,
  created_at,
  updated_at
) values
  (
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000002',
    'QUESTION',
    'ANSWER_EXPLANATION',
    'OPEN',
    null,
    '선택지 설명을 조금 더 자세히 확인해 주세요.',
    '{"kind":"QUESTION","contentId":"00000000-0000-4000-8000-000000000401","contentVersionId":"00000000-0000-4000-8000-000000000411","questionVersionId":"00000000-0000-4000-8000-000000000411","sentenceVersionId":"00000000-0000-4000-8000-000000000211","locationId":"00000000-0000-4000-8000-000000000421"}',
    '{"title":"어휘 의미 선택","primaryText":"สวัสดี","secondaryText":"다음 태국어의 뜻을 고르세요.","versionLabel":"버전 1","locationLabel":"문제 본문"}',
    '2026-07-18T00:00:00Z',
    '2026-07-18T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000002',
    'CONCEPT',
    'MEANING_TRANSLATION',
    'IN_PROGRESS',
    '00000000-0000-4000-8000-000000000001',
    '예문 뜻 설명을 확인해 주세요.',
    '{"kind":"CONCEPT","contentId":"00000000-0000-4000-8000-000000000701","contentVersionId":"00000000-0000-4000-8000-000000000711","questionVersionId":null,"sentenceVersionId":null,"locationId":"00000000-0000-4000-8000-000000000722"}',
    '{"title":"태국어 인사말의 쓰임","primaryText":"인사말 예문","secondaryText":"기본 인사말의 뜻과 쓰임을 실제 문장으로 익힙니다.","versionLabel":"버전 1","locationLabel":"개념 블록 2"}',
    '2026-07-18T01:00:00Z',
    '2026-07-18T01:02:00Z'
  );

insert into content_error_report_history (
  id,
  report_id,
  actor_user_id,
  action,
  from_status,
  to_status,
  from_assignee_user_id,
  to_assignee_user_id,
  created_at
) values
  (
    '00000000-0000-4000-8000-000000000811',
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000002',
    'SUBMITTED',
    null,
    null,
    null,
    null,
    '2026-07-18T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000812',
    '00000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000002',
    'SUBMITTED',
    null,
    null,
    null,
    null,
    '2026-07-18T01:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000813',
    '00000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000001',
    'ASSIGNEE_CHANGED',
    null,
    null,
    null,
    '00000000-0000-4000-8000-000000000001',
    '2026-07-18T01:01:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000814',
    '00000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000001',
    'STATUS_CHANGED',
    'OPEN',
    'IN_PROGRESS',
    null,
    null,
    '2026-07-18T01:02:00Z'
  );

commit;
