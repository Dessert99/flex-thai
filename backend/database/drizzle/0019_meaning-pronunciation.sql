-- 뜻마다 발음 하나를 보존한다. 모호한 데이터는 삭제/임의 선택하지 않고 전체 이전을 중단한다.
LOCK TABLE vocabularies, vocabulary_meanings, vocabulary_pronunciations,
  vocabulary_meaning_pronunciations, token_occurrences, expression_occurrences,
  vocabulary_practice_questions IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT m.id FROM vocabulary_meanings m
    LEFT JOIN vocabulary_meaning_pronunciations mp ON mp.meaning_id = m.id
    GROUP BY m.id HAVING count(mp.pronunciation_id) <> 1
  ) THEN
    RAISE EXCEPTION 'Each meaning must have exactly one pronunciation before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM vocabulary_pronunciations p
    WHERE NOT EXISTS (SELECT 1 FROM vocabulary_meaning_pronunciations mp WHERE mp.pronunciation_id = p.id)
  ) THEN
    RAISE EXCEPTION 'Unlinked pronunciations must be resolved before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT meaning_id, pronunciation_id FROM token_occurrences
      UNION ALL SELECT meaning_id, pronunciation_id FROM expression_occurrences
      UNION ALL SELECT meaning_id, pronunciation_id FROM vocabulary_practice_questions WHERE pronunciation_id IS NOT NULL
    ) occurrence
    WHERE NOT EXISTS (
      SELECT 1 FROM vocabulary_meaning_pronunciations mp
      WHERE mp.meaning_id = occurrence.meaning_id AND mp.pronunciation_id = occurrence.pronunciation_id
    )
  ) THEN
    RAISE EXCEPTION 'Occurrence meaning/pronunciation mismatch must be resolved before migration';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE vocabulary_meanings ADD COLUMN pronunciation_ko text, ADD COLUMN tone_marks text;
--> statement-breakpoint
UPDATE vocabulary_meanings m SET pronunciation_ko = p.pronunciation_ko, tone_marks = p.tone_marks
FROM vocabulary_meaning_pronunciations mp
JOIN vocabulary_pronunciations p ON p.id = mp.pronunciation_id
WHERE mp.meaning_id = m.id;
--> statement-breakpoint
ALTER TABLE vocabulary_meanings ALTER COLUMN pronunciation_ko SET NOT NULL, ALTER COLUMN tone_marks SET NOT NULL;
--> statement-breakpoint
-- import의 clientRef는 새 뜻 ID로 해석한다. 공유 발음은 동일 값을 가진 첫 뜻을 참조한다.
UPDATE content_import_items item SET reference_map = (
  SELECT jsonb_object_agg(entry.key, coalesce(to_jsonb(mapped.meaning_id::text), entry.value))
  FROM jsonb_each(item.reference_map) entry
  LEFT JOIN (
    SELECT vocabulary_id, pronunciation_id, min(meaning_id::text)::uuid AS meaning_id
    FROM vocabulary_meaning_pronunciations GROUP BY vocabulary_id, pronunciation_id
  ) mapped ON mapped.vocabulary_id = item.target_id AND entry.value = to_jsonb(mapped.pronunciation_id::text)
) WHERE item.kind = 'VOCABULARY' AND item.reference_map <> '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE token_occurrences DROP CONSTRAINT token_occurrences_pronunciation_vocabulary_fk;
--> statement-breakpoint
UPDATE token_occurrences SET pronunciation_id = meaning_id WHERE pronunciation_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE token_occurrences ADD CONSTRAINT token_occurrences_pronunciation_vocabulary_fk
FOREIGN KEY (pronunciation_id, vocabulary_id) REFERENCES vocabulary_meanings(id, vocabulary_id)
ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE token_occurrences ADD CONSTRAINT token_occurrences_pronunciation_matches_meaning CHECK (pronunciation_id = meaning_id);
--> statement-breakpoint
ALTER TABLE expression_occurrences DROP CONSTRAINT expression_occurrences_pronunciation_vocabulary_fk;
--> statement-breakpoint
UPDATE expression_occurrences SET pronunciation_id = meaning_id WHERE pronunciation_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE expression_occurrences ADD CONSTRAINT expression_occurrences_pronunciation_vocabulary_fk
FOREIGN KEY (pronunciation_id, vocabulary_id) REFERENCES vocabulary_meanings(id, vocabulary_id)
ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE expression_occurrences ADD CONSTRAINT expression_occurrences_pronunciation_matches_meaning CHECK (pronunciation_id = meaning_id);
--> statement-breakpoint
ALTER TABLE vocabulary_practice_questions DROP CONSTRAINT vocabulary_practice_questions_pronunciation_vocabulary_fk;
--> statement-breakpoint
UPDATE vocabulary_practice_questions SET pronunciation_id = meaning_id WHERE pronunciation_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE vocabulary_practice_questions ADD CONSTRAINT vocabulary_practice_questions_pronunciation_vocabulary_fk
FOREIGN KEY (pronunciation_id, vocabulary_id) REFERENCES vocabulary_meanings(id, vocabulary_id)
ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE vocabulary_practice_questions ADD CONSTRAINT vocabulary_practice_questions_pronunciation_matches_meaning CHECK (pronunciation_id = meaning_id);
--> statement-breakpoint
-- 학습 카드·병합 감사 snapshot은 당시 내용을 보존한다.
DROP TABLE vocabulary_meaning_pronunciations;
--> statement-breakpoint
DROP TABLE vocabulary_pronunciations;
