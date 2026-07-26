-- legacy 저장 어휘 쓰기를 원자적으로 닫고 마지막 row를 새 단어장에 반영한다.
begin;

lock table "saved_vocabularies" in access exclusive mode;

create or replace function reject_legacy_saved_vocabulary_write()
returns trigger
language plpgsql
as $$
begin
	raise exception 'saved_vocabularies is read-only after the Wave 1 cutover';
end;
$$;

drop trigger if exists reject_legacy_saved_vocabulary_write
	on "saved_vocabularies";
create trigger reject_legacy_saved_vocabulary_write
before insert or update or delete on "saved_vocabularies"
for each statement
execute function reject_legacy_saved_vocabulary_write();

insert into "wordbooks" ("id", "user_id", "name", "created_at", "updated_at")
select
	gen_random_uuid(),
	sv."user_id",
	'저장한 어휘',
	min(sv."saved_at"),
	max(sv."saved_at")
from "saved_vocabularies" as sv
group by sv."user_id"
on conflict ("user_id", "name") do update
set
	"created_at" = least("wordbooks"."created_at", excluded."created_at"),
	"updated_at" = greatest("wordbooks"."updated_at", excluded."updated_at");

insert into "wordbook_items" ("wordbook_id", "vocabulary_id", "added_at")
select w."id", sv."vocabulary_id", sv."saved_at"
from "saved_vocabularies" as sv
inner join "wordbooks" as w
	on w."user_id" = sv."user_id"
	and w."name" = '저장한 어휘'
on conflict ("wordbook_id", "vocabulary_id") do update
set "added_at" = excluded."added_at";

do $$
declare
	legacy_saved_count bigint;
	migrated_item_count bigint;
	missing_item_count bigint;
begin
	select count(*) into legacy_saved_count
	from "saved_vocabularies";

	select count(*) into migrated_item_count
	from "saved_vocabularies" as sv
	inner join "wordbooks" as w
		on w."user_id" = sv."user_id"
		and w."name" = '저장한 어휘'
	inner join "wordbook_items" as wi
		on wi."wordbook_id" = w."id"
		and wi."vocabulary_id" = sv."vocabulary_id"
		and wi."added_at" = sv."saved_at";

	select count(*) into missing_item_count
	from "saved_vocabularies" as sv
	left join "wordbooks" as w
		on w."user_id" = sv."user_id"
		and w."name" = '저장한 어휘'
	left join "wordbook_items" as wi
		on wi."wordbook_id" = w."id"
		and wi."vocabulary_id" = sv."vocabulary_id"
		and wi."added_at" = sv."saved_at"
	where wi."wordbook_id" is null;

	if migrated_item_count <> legacy_saved_count or missing_item_count <> 0 then
		raise exception 'saved vocabulary catch-up mismatch: legacy %, migrated %, missing %',
			legacy_saved_count,
			migrated_item_count,
			missing_item_count;
	end if;
end $$;

commit;
