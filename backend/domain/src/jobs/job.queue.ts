/** queue 제품과 무관한 최소 Job message 경계를 정의한다 */

/** worker가 DB에서 최신 Job을 읽게 하는 작은 queue port */
export interface JobQueue {
  send(message: { jobId: string; attempt: number }): Promise<void>;
}
