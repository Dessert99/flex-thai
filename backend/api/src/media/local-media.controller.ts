/** local-only HMAC object ID를 WAV 응답으로 바꾸고 모든 실패를 404로 숨긴다 */
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { LocalFileMediaReadProvider } from '@flex-thia/providers';

/** production OpenAPI와 gateway에 등록하지 않는 local filesystem 읽기 경계 */
@ApiExcludeController()
@Controller('local-media')
export class LocalMediaController {
  constructor(private readonly media: LocalFileMediaReadProvider) {}

  /** 유효한 단기 token의 WAV bytes만 inline 응답으로 전달한다 */
  @Get(':objectId')
  async read(
    @Param('objectId') objectId: string,
    @Query() query: { expires?: string; signature?: string },
  ): Promise<StreamableFile> {
    try {
      const result = await this.media.read({
        objectId,
        expires: query.expires ?? '',
        signature: query.signature ?? '',
      });
      return new StreamableFile(result.bytes, {
        type: result.mimeType,
        disposition: 'inline',
        length: result.bytes.byteLength,
      });
    } catch {
      throw new NotFoundException({ code: 'LOCAL_MEDIA_NOT_FOUND' });
    }
  }
}
