/** Data API migration의 성공·실패 로그와 client 정리를 한 경계에서 관리한다 */
export interface RunDataApiMigrationOptions {
  migrate: () => Promise<void>;
  destroy: () => void;
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

/** migration 결과를 기록하고 client를 항상 정리한다 */
export const runDataApiMigration = async ({
  migrate,
  destroy,
  onSuccess,
  onError,
}: RunDataApiMigrationOptions): Promise<void> => {
  try {
    await migrate();
    onSuccess();
  } catch (error) {
    onError(error);
    throw error;
  } finally {
    destroy();
  }
};
