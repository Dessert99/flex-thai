const mimeTypes: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
export function validateExtractionFile(selected: File, count: number): File {
  const extension = selected.name
    .slice(selected.name.lastIndexOf('.') + 1)
    .toLowerCase();
  const mimeType = mimeTypes[extension];
  if (
    count !== 1 ||
    !mimeType ||
    (selected.type && selected.type !== mimeType)
  ) {
    throw new Error('PDF 또는 JPG·PNG·WebP 이미지 한 개를 선택하세요.');
  }
  if (mimeType.startsWith('image/') && selected.size > 5 * 1024 * 1024) {
    throw new Error('이미지는 5MB 이하로 선택하세요.');
  }
  if (selected.size === 0) throw new Error('내용이 있는 파일을 선택하세요.');
  return selected.type
    ? selected
    : new File([selected], selected.name, { type: mimeType });
}
