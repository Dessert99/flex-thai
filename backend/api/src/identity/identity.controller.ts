/** 사전 준비 계정의 로그인·TOTP·refresh·logout HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  confirmEmailLinkRequestSchema,
  emailAuthenticationChallengeResponseSchema,
  emailChallengeIdPathSchema,
  loginResponseSchema,
  type MeResponse,
  startEmailAuthenticationRequestSchema,
  totpChallengeRequestSchema,
  totpSetupResponseSchema,
  totpSetupVerifyRequestSchema,
  type ConfirmEmailLinkInput,
  type EmailAuthenticationChallengeResponse,
  type EmailChallengeIdPath,
  type LoginResponse,
  type StartEmailAuthenticationInput,
  type TotpChallengeInput,
  type TotpSetupResponse,
  type TotpSetupVerifyInput,
  type VerifyEmailCodeInput,
  verifyEmailCodeRequestSchema,
} from '@flex-thia/contracts';
import {
  IdentityAuthenticationService,
  PasswordlessAuthenticationService,
  type AuthenticationResult,
} from '@flex-thia/domain';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import {
  ApiAuthenticationResponse,
  ApiCsrfProtection,
  ApiProblemResponse,
} from '../openapi/openapi.decorators.js';
import {
  AuthenticatedResponseDto,
  MeResponseDto,
  MfaRequiredResponseDto,
  ProblemDetailsDto,
  TotpChallengeRequestDto,
  TotpSetupResponseDto,
  TotpSetupVerifyRequestDto,
} from '../openapi/openapi.dto.js';
import { ApplicationRoleGuard } from './application-role.guard.js';
import { CognitoAuthorizerGuard } from './cognito-authorizer.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import {
  clearRefreshCookie,
  readRefreshToken,
  writeRefreshCookie,
} from './refresh-cookie.js';
import { RequireRole } from './require-role.decorator.js';

type CookieRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

type CookieResponse = Parameters<typeof writeRefreshCookie>[0] &
  Parameters<typeof clearRefreshCookie>[0];

/** 공개 인증 및 관리자 TOTP 등록 endpoint */
@ApiTags('Authentication')
@ApiExtraModels(
  AuthenticatedResponseDto,
  MfaRequiredResponseDto,
  ProblemDetailsDto,
)
@Controller('auth')
export class IdentityController {
  constructor(
    private readonly identity: IdentityAuthenticationService,
    private readonly passwordless: PasswordlessAuthenticationService,
  ) {}

  /** 학교 이메일 challenge를 계정 존재 여부 없는 응답으로 시작한다 */
  @ApiOperation({ summary: '학교 이메일 로그인 challenge를 시작한다' })
  @ApiCsrfProtection()
  @ApiProblemResponse(400, '요청 body가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(403, 'CSRF 조건이 요청을 허용하지 않음')
  @ApiProblemResponse(429, 'challenge 발송 제한을 초과함')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('challenges')
  @UseGuards(CsrfGuard)
  async startChallenge(
    @Body() body: StartEmailAuthenticationInput,
  ): Promise<EmailAuthenticationChallengeResponse> {
    const input = startEmailAuthenticationRequestSchema.parse(body);
    return toChallengeResponse(
      await this.passwordless.start(input.email, new Date()),
    );
  }

  /** 6자리 코드 POST로만 challenge를 소비하고 인증을 완료한다 */
  @ApiOperation({ summary: '이메일 코드로 로그인 challenge를 확인한다' })
  @ApiAuthenticationResponse()
  @ApiCsrfProtection()
  @ApiProblemResponse(400, '요청 path 또는 body가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'challenge 또는 code가 올바르지 않음')
  @ApiProblemResponse(403, '계정 상태 또는 CSRF 조건이 요청을 허용하지 않음')
  @ApiProblemResponse(409, 'challenge를 이미 사용했거나 처리 중임')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('challenges/:challengeId/code')
  @UseGuards(CsrfGuard)
  async verifyCode(
    @Param() path: EmailChallengeIdPath,
    @Body() body: VerifyEmailCodeInput,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<LoginResponse> {
    const { challengeId } = emailChallengeIdPathSchema.parse(path);
    const { code } = verifyEmailCodeRequestSchema.parse(body);
    const providerResult = await this.passwordless.completeCode(
      challengeId,
      code,
      new Date(),
    );
    return this.finish(
      this.identity.completePasswordless(providerResult),
      response,
    );
  }

  /** 명시적인 링크 확인 POST에서만 challenge를 소비한다 */
  @ApiOperation({ summary: '이메일 링크로 로그인 challenge를 확인한다' })
  @ApiAuthenticationResponse()
  @ApiCsrfProtection()
  @ApiProblemResponse(400, '요청 path 또는 body가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'challenge 또는 link token이 올바르지 않음')
  @ApiProblemResponse(403, '계정 상태 또는 CSRF 조건이 요청을 허용하지 않음')
  @ApiProblemResponse(409, 'challenge를 이미 사용했거나 처리 중임')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('challenges/:challengeId/link')
  @UseGuards(CsrfGuard)
  async confirmLink(
    @Param() path: EmailChallengeIdPath,
    @Body() body: ConfirmEmailLinkInput,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<LoginResponse> {
    const { challengeId } = emailChallengeIdPathSchema.parse(path);
    const { token } = confirmEmailLinkRequestSchema.parse(body);
    const providerResult = await this.passwordless.completeLink(
      challengeId,
      token,
      new Date(),
    );
    return this.finish(
      this.identity.completePasswordless(providerResult),
      response,
    );
  }

  /** cooldown과 일일 상한 아래 기존 challenge를 새 challenge로 교체한다 */
  @ApiOperation({ summary: '이메일 로그인 challenge를 재전송한다' })
  @ApiCsrfProtection()
  @ApiProblemResponse(400, '요청 path가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'challenge가 만료됨')
  @ApiProblemResponse(403, 'CSRF 조건이 요청을 허용하지 않음')
  @ApiProblemResponse(429, 'challenge 발송 제한을 초과함')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('challenges/:challengeId/resend')
  @UseGuards(CsrfGuard)
  async resend(
    @Param() path: EmailChallengeIdPath,
  ): Promise<EmailAuthenticationChallengeResponse> {
    const { challengeId } = emailChallengeIdPathSchema.parse(path);
    return toChallengeResponse(
      await this.passwordless.resend(challengeId, new Date()),
    );
  }

  /** 로그인 TOTP challenge를 완료하고 token을 발급한다 */
  @ApiOperation({ summary: '로그인 TOTP challenge를 완료한다' })
  @ApiBody({ type: TotpChallengeRequestDto })
  @ApiAuthenticationResponse()
  @ApiCsrfProtection()
  @ApiProblemResponse(400, '요청 body가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'MFA challenge 또는 TOTP code가 올바르지 않음')
  @ApiProblemResponse(403, '계정 상태 또는 CSRF 조건이 요청을 허용하지 않음')
  @ApiProblemResponse(429, 'MFA 요청 제한을 초과함')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('mfa/totp/challenge')
  @UseGuards(CsrfGuard)
  async completeTotpChallenge(
    @Body() body: TotpChallengeInput,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<LoginResponse> {
    const input = totpChallengeRequestSchema.parse(body);
    return this.finish(this.identity.completeTotpChallenge(input), response);
  }

  /** 현재 관리자의 access token으로 TOTP secret 생성을 시작한다 */
  @ApiOperation({ summary: '현재 관리자의 TOTP 등록을 시작한다' })
  @ApiBearerAuth('accessToken')
  @ApiCreatedResponse({ type: TotpSetupResponseDto })
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '관리자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(429, '인증 공급자 요청 제한을 초과함')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('mfa/totp/setup')
  @UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard)
  @RequireRole('ADMIN')
  async startTotpSetup(
    @Req() request: CookieRequest,
  ): Promise<TotpSetupResponse> {
    const accessToken = readBearerAccessToken(request);
    const result = await this.identity.startTotpSetup(accessToken);
    return totpSetupResponseSchema.parse(result);
  }

  /** Cognito TOTP 확인 뒤 현재 관리자의 등록 상태를 갱신한다 */
  @ApiOperation({ summary: '현재 관리자의 TOTP 등록을 확인한다' })
  @ApiBearerAuth('accessToken')
  @ApiBody({ type: TotpSetupVerifyRequestDto })
  @ApiCreatedResponse({ type: MeResponseDto })
  @ApiProblemResponse(400, '요청 body가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token 또는 TOTP code가 올바르지 않음')
  @ApiProblemResponse(403, '관리자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(429, '인증 공급자 요청 제한을 초과함')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('mfa/totp/setup/verify')
  @UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard)
  @RequireRole('ADMIN')
  async verifyTotpSetup(
    @Req() request: CookieRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: TotpSetupVerifyInput,
  ): Promise<MeResponse> {
    const input = totpSetupVerifyRequestSchema.parse(body);
    const accessToken = readBearerAccessToken(request);
    const verifiedUser = await this.identity.verifyTotpSetup({
      subject: user.sub,
      accessToken,
      code: input.code,
    });

    return {
      id: verifiedUser.id,
      email: verifiedUser.email,
      role: verifiedUser.role,
      mfaEnrolled: verifiedUser.mfaEnrolledAt !== null,
    };
  }

  /** HttpOnly refresh cookie를 회전된 access token과 cookie로 교환한다 */
  @ApiOperation({ summary: 'refresh cookie로 access token을 갱신한다' })
  @ApiCookieAuth('refreshCookie')
  @ApiAuthenticationResponse()
  @ApiCsrfProtection()
  @ApiProblemResponse(401, 'refresh token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '계정 상태 또는 CSRF 조건이 요청을 허용하지 않음')
  @ApiProblemResponse(429, 'refresh 요청 제한을 초과함')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('refresh')
  @UseGuards(CsrfGuard)
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<LoginResponse> {
    const refreshToken = readRefreshToken(request.headers?.cookie);

    if (!refreshToken) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN' });
    }

    return this.finish(this.identity.refresh(refreshToken), response);
  }

  /** refresh token을 폐기한 뒤 브라우저 cookie를 삭제한다 */
  @ApiOperation({ summary: 'refresh token을 폐기하고 cookie를 삭제한다' })
  @ApiCookieAuth('refreshCookie')
  @ApiNoContentResponse()
  @ApiCsrfProtection()
  @ApiProblemResponse(403, 'CSRF 조건이 요청을 허용하지 않음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('logout')
  @HttpCode(204)
  @UseGuards(CsrfGuard)
  async logout(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    const refreshToken = readRefreshToken(request.headers?.cookie);

    if (refreshToken) {
      await this.identity.logout(refreshToken);
    }
    clearRefreshCookie(response);
  }

  private async finish(
    resultPromise: Promise<AuthenticationResult>,
    response: CookieResponse,
  ): Promise<LoginResponse> {
    const result = await resultPromise;

    if (result.kind === 'MFA_REQUIRED') {
      return loginResponseSchema.parse({
        status: 'MFA_REQUIRED',
        challengeToken: result.challengeToken,
      });
    }

    writeRefreshCookie(response, result.tokens.refreshToken);
    return loginResponseSchema.parse({
      status: 'AUTHENTICATED',
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        mfaEnrolled: result.user.mfaEnrolledAt !== null,
      },
    });
  }
}

const readBearerAccessToken = (request: CookieRequest): string => {
  const authorization = request.headers?.authorization;

  if (
    typeof authorization !== 'string' ||
    !authorization.startsWith('Bearer ') ||
    authorization.length === 'Bearer '.length
  ) {
    throw new UnauthorizedException();
  }

  return authorization.slice('Bearer '.length);
};

const toChallengeResponse = (input: {
  challengeId: string;
  expiresAt: Date;
  resendAt: Date;
}): EmailAuthenticationChallengeResponse =>
  emailAuthenticationChallengeResponseSchema.parse({
    challengeId: input.challengeId,
    expiresAt: input.expiresAt.toISOString(),
    resendAt: input.resendAt.toISOString(),
  });
