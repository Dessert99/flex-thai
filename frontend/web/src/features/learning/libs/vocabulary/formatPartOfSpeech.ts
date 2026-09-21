const koreanPartOfSpeech = new Map<string, string>([
  ['noun', '명사'],
  ['proper noun', '고유명사'],
  ['pronoun', '대명사'],
  ['verb', '동사'],
  ['auxiliary verb', '조동사'],
  ['copula', '계사'],
  ['adjective', '형용사'],
  ['adverb', '부사'],
  ['preposition', '전치사'],
  ['conjunction', '접속사'],
  ['interjection', '감탄사'],
  ['determiner', '한정사'],
  ['article', '관사'],
  ['numeral', '수사'],
  ['classifier', '분류사'],
  ['particle', '조사'],
  ['noun phrase', '명사구'],
  ['verb phrase', '동사구'],
  ['adjective phrase', '형용사구'],
  ['adjectival phrase', '형용사구'],
  ['adverb phrase', '부사구'],
  ['adverbial phrase', '부사구'],
  ['prepositional phrase', '전치사구'],
]);

export function formatPartOfSpeech(partOfSpeech: string): string {
  const normalized = partOfSpeech.trim().toLowerCase().replace(/\s+/g, ' ');
  return koreanPartOfSpeech.get(normalized) ?? partOfSpeech;
}
