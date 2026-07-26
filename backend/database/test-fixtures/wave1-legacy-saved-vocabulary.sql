-- 0000~0006 적용 상태에서 saved vocabulary backfill의 시각 보존을 검증한다.
insert into "users" (
	"id",
	"cognito_sub",
	"email",
	"role",
	"status",
	"created_at",
	"updated_at"
) values (
	'10000000-0000-4000-8000-000000000001',
	'wave1-legacy-learner',
	'wave1-legacy@hufs.ac.kr',
	'LEARNER',
	'ACTIVE',
	'2025-01-01 00:00:00+00',
	'2025-01-01 00:00:00+00'
);

insert into "vocabularies" (
	"id",
	"thai",
	"normalized_thai",
	"kind",
	"status",
	"created_at",
	"updated_at"
) values
	(
		'20000000-0000-4000-8000-000000000001',
		'สวัสดี',
		'สวัสดี',
		'WORD',
		'PUBLISHED',
		'2025-01-01 00:00:00+00',
		'2025-01-01 00:00:00+00'
	),
	(
		'20000000-0000-4000-8000-000000000002',
		'ขอบคุณ',
		'ขอบคุณ',
		'WORD',
		'PUBLISHED',
		'2025-01-01 00:00:00+00',
		'2025-01-01 00:00:00+00'
	);

insert into "saved_vocabularies" ("user_id", "vocabulary_id", "saved_at")
values
	(
		'10000000-0000-4000-8000-000000000001',
		'20000000-0000-4000-8000-000000000001',
		'2025-01-02 03:04:05+00'
	),
	(
		'10000000-0000-4000-8000-000000000001',
		'20000000-0000-4000-8000-000000000002',
		'2025-02-03 04:05:06+00'
	);
