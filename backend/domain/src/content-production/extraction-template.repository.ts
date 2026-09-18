/** 관리자 사이에서 공유하는 복사용 지시문 저장소 */
export interface ExtractionTemplateRecord {
  id: string;
  description: string;
  body: string;
  createdAt: Date;
}
export interface ExtractionTemplateActor {
  userId: string;
  sub: string;
}
export interface ExtractionTemplateRepository {
  list(): Promise<ExtractionTemplateRecord[]>;
  create(
    input: { description: string; body: string },
    actor: ExtractionTemplateActor,
  ): Promise<ExtractionTemplateRecord>;
  delete(id: string, actor: ExtractionTemplateActor): Promise<void>;
}
