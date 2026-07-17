/** passwordless 인증과 refresh cookie 수명주기를 HTTP로 노출한다 */
import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { PasswordlessAuthService, type TokenSet } from '@flex-thia/domain';
import { CsrfGuard } from './csrf.guard.js';

type CookieResponse = {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
};

type CookieRequest = {
  headers?: { cookie?: string };
};

const readRefreshToken = (request: CookieRequest): string | null => {
  const cookie = request.headers?.cookie;

  if (!cookie) {
    return null;
  }

  for (const part of cookie.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');

    if (name === 'refresh_token') {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
};

/** 공개 인증 endpoint */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: PasswordlessAuthService) {}

  /** 계정 존재 여부를 숨긴 동일 응답으로 이메일 challenge를 시작한다 */
  @Post('challenges')
  @HttpCode(202)
  start(@Body() body: { email: string }) {
    return this.auth.start(body.email);
  }

  /** 숫자 code를 일회용 Cognito challenge에 응답한다 */
  @Post('challenges/:challengeId/code')
  verifyCode(
    @Param('challengeId') challengeId: string,
    @Body() body: { code: string },
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    return this.finish(this.auth.verifyCode(challengeId, body.code), response);
  }

  /** 사용자 POST만 일회용 링크 token을 교환한다 */
  @Post('challenges/:challengeId/link')
  verifyLink(
    @Param('challengeId') challengeId: string,
    @Body() body: { token: string },
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    return this.finish(this.auth.verifyLink(challengeId, body.token), response);
  }

  /** HttpOnly cookie를 새 access token으로 교환한다 */
  @Post('refresh')
  @UseGuards(CsrfGuard)
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const refreshToken = readRefreshToken(request);

    if (!refreshToken) {
      return { accessToken: null, expiresIn: 0 };
    }

    return this.finish(this.auth.refresh(refreshToken), response);
  }

  /** refresh token을 폐기하고 cookie를 삭제한다 */
  @Post('logout')
  @HttpCode(204)
  @UseGuards(CsrfGuard)
  async logout(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    const refreshToken = readRefreshToken(request);

    if (refreshToken) {
      await this.auth.revoke(refreshToken);
    }

    response.clearCookie('refresh_token', {
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/auth',
    });
  }

  private async finish(
    tokensPromise: Promise<TokenSet>,
    response: CookieResponse,
  ) {
    const tokens = await tokensPromise;
    response.cookie('refresh_token', tokens.refreshToken, {
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    };
  }
}
