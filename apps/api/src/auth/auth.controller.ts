/** 이메일 확인 기반 가입·로그인·비밀번호 재설정과 token cookie를 노출한다 */
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  PasswordAuthService,
  type TokenSet,
  type UserRepository,
} from '@flex-thia/domain';
import { CsrfGuard } from './csrf.guard.js';
import { USER_REPOSITORY } from './phone-verification.controller.js';

type CookieResponse = {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
};

type CookieRequest = { headers?: { cookie?: string } };

const readRefreshToken = (request: CookieRequest): string | null => {
  const cookie = request.headers?.cookie;
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name === 'refresh_token') {
      return decodeURIComponent(valueParts.join('='));
    }
  }
  return null;
};

/** 공개 비밀번호 인증 endpoint */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: PasswordAuthService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /** Cognito 회원을 만들지 않고 학교 이메일 인증 코드를 발송한다 */
  @Post('signup')
  @HttpCode(202)
  signup(@Body() body: { email: string }) {
    return this.auth.startSignup(body.email);
  }

  /** 이메일 코드 확인 뒤에만 비밀번호 계정과 token을 만든다 */
  @Post('signup/verify')
  verifySignup(
    @Body() body: { challengeId: string; code: string; password: string },
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    return this.finish(
      this.auth.verifySignup(body.challengeId, body.code, body.password),
      response,
    );
  }

  /** 이메일과 비밀번호를 Cognito 서버 전용 흐름으로 검증한다 */
  @Post('login')
  login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    return this.finish(this.auth.login(body.email, body.password), response);
  }

  /** 계정 존재 여부를 숨긴 채 기존 회원에게만 재설정 코드를 보낸다 */
  @Post('password/forgot')
  @HttpCode(202)
  async forgotPassword(@Body() body: { email: string }) {
    const result = await this.auth.startPasswordReset(body.email);
    return { accepted: true, challengeId: result.challengeId };
  }

  /** 이메일 코드 확인 뒤 Cognito 비밀번호를 교체한다 */
  @Post('password/reset')
  @HttpCode(204)
  async resetPassword(
    @Body()
    body: {
      challengeId: string;
      code: string;
      newPassword: string;
    },
  ): Promise<void> {
    await this.auth.resetPassword(
      body.challengeId,
      body.code,
      body.newPassword,
    );
  }

  /** HttpOnly cookie를 새 access token으로 교환한다 */
  @Post('refresh')
  @UseGuards(CsrfGuard)
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const refreshToken = readRefreshToken(request);
    if (!refreshToken) return { accessToken: null, expiresIn: 0 };
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
    if (refreshToken) await this.auth.revoke(refreshToken);
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
    await this.users.upsertIdentity({
      subject: tokens.subject,
      email: tokens.email,
    });
    response.cookie('refresh_token', tokens.refreshToken, {
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }
}
