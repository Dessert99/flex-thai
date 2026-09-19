import type { ExtractionReviewItem } from '@flex-thia/contracts/content-production/vocabulary-extraction';
/** 실제 자료·AI 호출·단어 저장과 무관한 화면 확인용 예시. */
const words: Array<[string, string, string, number]> = [
  ['พัฒนา', '개발하다', 'เราต้องพัฒนาเมือง', 2],
  ['เศรษฐกิจ', '경제', 'เศรษฐกิจเติบโตอย่างต่อเนื่อง', 3],
  ['ประชาชน', '국민', 'ประชาชนต้องการบริการที่ดี', 3],
  ['สิ่งแวดล้อม', '환경', 'เราควรดูแลสิ่งแวดล้อม', 4],
  ['โอกาส', '기회', 'ทุกคนควรได้รับโอกาส', 5],
  ['ขึ้น', '가격이나 수준이 오르다', 'ราคาสินค้าเพิ่มขึ้น', 6],
];
export const extractionReviewPreview = {
  items: words.map(
    ([thai, meaningKo, context, page], index): ExtractionReviewItem => ({
      id: `0:${index}`,
      thai,
      meaningKo,
      context,
      page,
      partOfSpeech: '',
      classification: index === 5 ? 'NEW_MEANING' : 'NEW_WORD',
      vocabularyId: index === 5 ? '00000000-0000-4000-8000-000000000001' : null,
      existingMeanings: index === 5 ? ['올라타다'] : [],
    }),
  ),
  excluded: 12,
  receipt: null,
};
