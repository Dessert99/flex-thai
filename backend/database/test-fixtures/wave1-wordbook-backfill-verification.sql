-- legacy fixture의 row 수와 저장 시각이 wordbook에 그대로 보존됐는지 검증한다.
do $$
declare
	matching_item_count bigint;
begin
	select count(*) into matching_item_count
	from "saved_vocabularies" as sv
	inner join "wordbooks" as w
		on w."user_id" = sv."user_id"
		and w."name" = '저장한 어휘'
	inner join "wordbook_items" as wi
		on wi."wordbook_id" = w."id"
		and wi."vocabulary_id" = sv."vocabulary_id"
		and wi."added_at" = sv."saved_at";

	if matching_item_count <> 2 then
		raise exception 'expected 2 preserved saved vocabulary rows, got %',
			matching_item_count;
	end if;
end $$;
