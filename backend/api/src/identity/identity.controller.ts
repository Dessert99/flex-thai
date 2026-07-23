/** 사전 준비 계정의 로그인·TOTP·refresh·logout HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  HttpCode,
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
  loginRequestSchema,
  loginResponseSchema,
  type MeResponse,
  totpChallengeRequestSchema,
  totpSetupResponseSchema,
  totpSetupVerifyRequestSchema,
  type LoginInput,
  type LoginResponse,
  type TotpChallengeInput,
  type TotpSetupResponse,
  type TotpSetupVerifyInput,
} from '@flex-thia/contracts';
import {
  IdentityAuthenticationService,
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
  LoginRequestDto,
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
  constructor(private readonly identity: IdentityAuthenticationService) {}

  /** 이메일·비밀번호 인증 결과를 token 또는 TOTP challenge로 반환한다 */
  @ApiOperation({ summary: '이메일과 비밀번호로 로그인한다' })
  @ApiBody({ type: LoginRequestDto })
  @ApiAuthenticationResponse()
  @ApiCsrfProtection()
  @ApiProblemResponse(400, '요청 body가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, '자격 증명이 올바르지 않음')
  @ApiProblemResponse(403, '계정 상태 또는 CSRF 조건이 요청을 허용하지 않음')
  @ApiProblemResponse(429, '로그인 요청 제한을 초과함')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('login')
  @UseGuards(CsrfGuard)
  async login(
    @Body() body: LoginInput,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<LoginResponse> {
    const input = loginRequestSchema.parse(body);
    return this.finish(
      this.identity.login(input.email, input.password),
      response,
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
