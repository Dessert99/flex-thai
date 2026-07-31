/** 로컬 seed가 passwordless 사용자와 단어장 cutover 이후 graph를 만드는지 검증한다 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seedSql = readFileSync(
  new URL('../../seed/local.sql', import.meta.url),
  'utf8',
);
const uuidSource = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';

const readCompletedSentenceTtsItem = () => {
  const match = seedSql.match(
    new RegExp(
      `insert into tts_items[\\s\\S]*?values\\s*\\(\\s*'${uuidSource}',\\s*'${uuidSource}',\\s*'THAI_SENTENCE_VERSION',\\s*'(?<targetId>${uuidSource})',\\s*'(?<targetText>[^']+)',\\s*true,\\s*'(?<revision>${uuidSource})',[\\s\\S]*?'(?<cacheKey>[0-9a-f]{64})',\\s*'SUCCEEDED',\\s*0,\\s*false,\\s*'(?<mediaAssetId>${uuidSource})'`,
      'iu',
    ),
  );
  if (!match?.groups) throw new Error('완료된 문장 TTS fixture가 필요합니다.');
  return match.groups;
};

const readSentenceVersion = (sentenceVersionId: string) => {
  const match = seedSql.match(
    new RegExp(
      `insert into thai_sentence_versions[\\s\\S]*?\\(\\s*'${sentenceVersionId}',\\s*'${uuidSource}',\\s*1,\\s*'(?<originalText>[^']+)',\\s*'[^']+',\\s*'[^']+',\\s*'[^']+',\\s*(?<mediaAssetId>null|'${uuidSource}'),\\s*(?<frozenAt>null|'[^']+')`,
      'iu',
    ),
  );
  if (!match?.groups) throw new Error('TTS 대상 문장 버전이 필요합니다.');
  return {
    originalText: match.groups.originalText,
    mediaAssetId: match.groups.mediaAssetId?.replaceAll("'", ''),
    frozenAt: match.groups.frozenAt?.replaceAll("'", ''),
  };
};

const readReadyCacheMediaId = (cacheKey: string) => {
  const match = seedSql.match(
    new RegExp(
      `insert into tts_audio_cache[\\s\\S]*?values\\s*\\(\\s*'${uuidSource}',\\s*'${cacheKey}',[\\s\\S]*?'READY',\\s*1,\\s*false,\\s*'(?<mediaAssetId>${uuidSource})'`,
      'iu',
    ),
  );
  if (!match?.groups?.mediaAssetId) {
    throw new Error('READY TTS cache fixture가 필요합니다.');
  }
  return match.groups.mediaAssetId;
};

describe('로컬 seed SQL', () => {
  it('학교 이메일 사용자와 관리자 MFA 상태를 password 없이 만든다', () => {
    expect(seedSql).toContain("'admin@hufs.ac.kr'");
    expect(seedSql).toContain("'learner@hufs.ac.kr'");
    expect(seedSql).toContain('mfa_enrolled_at');
    expect(seedSql).not.toMatch(/password(?:_hash)?/iu);
  });

  it('학습자 저장 어휘를 legacy table 대신 단어장 membership으로 만든다', () => {
    expect(seedSql).toMatch(/insert into wordbooks/iu);
    expect(seedSql).toMatch(/insert into wordbook_items/iu);
    expect(seedSql).not.toMatch(/insert into saved_vocabularies/iu);
    expect(seedSql).toContain("'저장한 어휘'");
  });

  it('단어 연습·개념 학습·오류 신고를 직접 확인할 대표 데이터를 만든다', () => {
    expect(seedSql).toContain("'ขอโทษ'");
    expect(seedSql).toMatch(/insert into concepts/iu);
    expect(seedSql).toMatch(/insert into concept_versions/iu);
    expect(seedSql).toMatch(/insert into content_error_reports/iu);
    expect(seedSql).toMatch(/insert into content_error_report_history/iu);
  });

  it('공개 어휘의 fallback 추천 정렬에 사용할 공개 시각을 채운다', () => {
    expect(seedSql).toMatch(/insert into vocabularies \([\s\S]*published_at/iu);
  });

  it('개념 block 신고 snapshot을 현재 canonical 위치와 문맥으로 저장한다', () => {
    expect(seedSql).toContain(
      '"primaryText":"인사말 예문","secondaryText":"기본 인사말의 발음과 성조를 실제 문장으로 익힙니다."',
    );
    expect(seedSql).toContain('"locationLabel":"개념 블록 2"');
  });

  it('기존 reading-vocabulary fixture를 ACTIVE taxonomy와 일반 주제에 보존한다', () => {
    expect(seedSql).toContain("'00000000-0000-4000-8000-000000000311'");
    expect(seedSql).toContain("'READING_VOCABULARY_GRAMMAR'");
    expect(seedSql).toContain("'ACTIVE'");
    expect(seedSql).toContain("'general'");
    expect(seedSql).toMatch(
      /insert into question_versions \([\s\S]*topic_id[\s\S]*'00000000-0000-4000-8000-000000000320'/iu,
    );
  });

  it('7대 분류의 유형 버전과 기존 ACTIVE 버전의 준비 데이터를 만든다', () => {
    [
      'LISTENING_RESPONSE',
      'LISTENING_DIALOGUE',
      'LISTENING_PASSAGE',
      'READING_VOCABULARY_GRAMMAR',
      'READING_SYNONYM_RELATION',
      'READING_ERROR_IDENTIFICATION',
      'READING_PASSAGE',
    ].forEach((category) => expect(seedSql).toContain(`'${category}'`));
    expect(seedSql).toMatch(/insert into question_type_difficulty_criteria/iu);
    [1, 2, 3, 4, 5].forEach((difficulty) =>
      expect(seedSql).toMatch(
        new RegExp(
          `'00000000-0000-4000-8000-000000000311',\\s*${difficulty},`,
          'u',
        ),
      ),
    );
    expect(seedSql).toMatch(/insert into question_type_approved_examples/iu);
    expect(seedSql).toMatch(
      /'00000000-0000-4000-8000-000000000311',[\s\S]*'canonical-reading-vocabulary-v1'/iu,
    );
    expect(seedSql).toMatch(
      /'00000000-0000-4000-8000-000000000312',[\s\S]*?'DRAFT'/iu,
    );
  });

  it('승인 예시를 관리자 문제 응답과 같은 유효 JSON snapshot으로 저장한다', () => {
    const payload = seedSql.match(
      /\$readingVocabularyExample\$\s*([\s\S]*?)\s*\$readingVocabularyExample\$::jsonb/iu,
    )?.[1];

    expect(payload).toBeDefined();
    if (payload === undefined) {
      throw new Error('canonical 승인 예시 payload가 필요합니다.');
    }
    const parsedPayload: unknown = JSON.parse(payload);
    expect(parsedPayload).toMatchObject({
      questionTypeSlug: 'reading-vocabulary',
      questionTypeVersion: 1,
      difficulty: 1,
      topicSlug: 'general',
      tagSlugs: [],
      correctOptionRef: 'option-1',
    });
    const storedHash = seedSql.match(
      /\$readingVocabularyExample\$::jsonb,\s*'([0-9a-f]{64})'/u,
    )?.[1];

    expect(storedHash).toBe(
      createHash('sha256').update(JSON.stringify(parsedPayload)).digest('hex'),
    );
  });

  it('AI 어휘 preset과 복합 preset의 중복 거리 정책을 보장한다', () => {
    const presetPolicy =
      /'00000000-0000-4000-8000-00000000090[13]'[\s\S]*?suspectedDuplicateMaxCodePointDistance[\s\S]*?1/giu;

    expect(seedSql.match(presetPolicy)).toHaveLength(2);
  });

  it('콘텐츠 제작과 AI 비용을 확인할 완료 작업을 고정한다', () => {
    expect(seedSql).toMatch(/insert into jobs/iu);
    expect(seedSql).toMatch(/insert into job_items/iu);
    expect(seedSql).toMatch(/insert into provider_runs/iu);
    expect(seedSql).toContain("'local-content-provider-request'");
    expect(seedSql).toContain("'0.750000'");
    expect(seedSql).toMatch(/insert into question_production_candidates/iu);
    expect(seedSql).toContain("'REDACTED_INVALID'");
    expect(seedSql).toMatch(
      /'기본 문제 생성',\s*'QUESTION_GENERATION',\s*2,[\s\S]*?false/iu,
    );
  });

  it('비용 경고 singleton과 TTS 비용 실행을 고정한다', () => {
    expect(seedSql).toMatch(/update operations_cost_settings/iu);
    expect(seedSql).not.toMatch(/insert into operations_cost_settings/iu);
    expect(seedSql).toMatch(
      /currency = 'USD',[\s\S]*warning_usd = '15.000000',[\s\S]*critical_usd = '24.000000'/iu,
    );
    expect(seedSql).toMatch(/insert into tts_provider_runs/iu);
    expect(seedSql).toContain("'0.25000000'");
    expect(seedSql).toContain("'로컬 비활성 음성'");
    expect(seedSql).toMatch(/insert into tts_jobs[\s\S]*?'RUNNING'/iu);
    expect(seedSql).toMatch(/insert into tts_jobs[\s\S]*?'FAILED'/iu);
  });

  it('API local 기본 UUID에 deterministic TTS 음성 preset을 활성화한다', () => {
    expect(seedSql).toMatch(/insert into tts_voice_presets/iu);
    expect(seedSql).toContain("'00000000-0000-4000-8000-000000000001'");
    expect(seedSql).toContain("'LOCAL_FAKE'");
    expect(seedSql).toContain("'deterministic-v1'");
    expect(seedSql).toContain("'th-TH-standard-a'");
    expect(seedSql).toContain("'2026-07-27'");
    expect(seedSql).not.toMatch(
      /insert into tts_voice_presets[\s\S]*?(?:POLLY|GOOGLE|AZURE|ELEVENLABS)/iu,
    );
  });

  it('deterministic preset snapshot과 READY media를 연결한 TTS 운영 fixture를 만든다', () => {
    expect(seedSql).toMatch(/insert into tts_jobs/iu);
    expect(seedSql).toMatch(/insert into tts_items/iu);
    expect(seedSql).toMatch(/insert into tts_audio_cache/iu);
    expect(seedSql).toContain(
      '"presetId":"00000000-0000-4000-8000-000000000001"',
    );
    expect(seedSql).toMatch(
      /insert into tts_items[\s\S]*?'SUCCEEDED'[\s\S]*?'00000000-0000-4000-8000-000000000013'/iu,
    );
    expect(seedSql).toMatch(
      /insert into tts_audio_cache[\s\S]*?'READY'[\s\S]*?'00000000-0000-4000-8000-000000000013'/iu,
    );
  });

  it('완료된 문장 TTS 항목은 expected DRAFT 문제 revision이 참조하는 문장을 대상으로 한다', () => {
    const item = readCompletedSentenceTtsItem();
    const draftVersionPattern = new RegExp(
      `\\(\\s*'${item.revision}',\\s*'${uuidSource}',\\s*\\d+,\\s*'${uuidSource}',\\s*'${uuidSource}',\\s*\\d+,\\s*'DRAFT'`,
      'iu',
    );
    const block = seedSql.match(
      new RegExp(
        `\\(\\s*'(?<blockId>${uuidSource})',\\s*'${item.revision}',\\s*'QUESTION'`,
        'iu',
      ),
    )?.groups?.blockId;

    expect(seedSql).toMatch(draftVersionPattern);
    expect(block).toBeDefined();
    expect(seedSql).toMatch(
      new RegExp(
        `\\(\\s*'${uuidSource}',\\s*'${block}',\\s*'${item.targetId}'`,
        'iu',
      ),
    );
  });

  it('완료된 문장 TTS 대상은 원문이 같고 게시 freeze 없이 연결 가능하다', () => {
    const item = readCompletedSentenceTtsItem();
    const sentence = readSentenceVersion(item.targetId!);

    expect(sentence.originalText).toBe(item.targetText);
    expect(sentence.frozenAt).toBe('null');
  });

  it('완료된 문장·항목·READY cache는 성공 후 같은 media를 가리킨다', () => {
    const item = readCompletedSentenceTtsItem();
    const sentence = readSentenceVersion(item.targetId!);
    const cacheMediaAssetId = readReadyCacheMediaId(item.cacheKey!);

    expect(sentence.mediaAssetId).toBe(item.mediaAssetId);
    expect(cacheMediaAssetId).toBe(item.mediaAssetId);
  });
});
