-- legacy endpoint rollback 배포 후 저장 어휘 쓰기 차단을 해제한다.
begin;

lock table "saved_vocabularies" in access exclusive mode;
drop trigger if exists reject_legacy_saved_vocabulary_write
	on "saved_vocabularies";
drop function if exists reject_legacy_saved_vocabulary_write();

commit;
