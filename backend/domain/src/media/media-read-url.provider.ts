/** private media storage key를 제한된 만료 시각의 읽기 URL로 변환하는 port다 */

/** private media key를 짧은 읽기 URL로만 공개한다 */
export interface MediaReadUrlProvider {
  createReadUrl(storageKey: string, expiresAt: Date): Promise<string>;
}
