import {
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { CurrentUser } from './decorator/current-user.decorator';
import { AuthUser } from './decorator/auth-user.type';
import { GoogleLoginCommand } from './command/google-login.command';
import { UnlinkGoogleAccountCommand } from './command/unlink-google-account.command';
import { GoogleProfilePayload } from './strategy/google-profile.type';
import { AuthTokens } from '@app/shared';

@ApiTags('Auth')
@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('google'))
  @Throttle({ short: { ttl: 1000, limit: 2 }, long: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary: 'Google OAuth 로그인 시작 (Google 동의 화면으로 redirect)',
  })
  @ApiTooManyRequestsResponse({ description: '요청 횟수 초과' })
  googleLogin(): void {
    /* passport-google-oauth20이 자동으로 Google로 redirect */
  }

  @Get('callback')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const profile = req.user as GoogleProfilePayload;
    const frontUrl = this.configService.getOrThrow<string>(
      'GOOGLE_FRONTEND_REDIRECT_URL',
    );

    try {
      const tokens = await this.commandBus.execute<
        GoogleLoginCommand,
        AuthTokens
      >(new GoogleLoginCommand(profile));
      res.redirect(
        `${frontUrl}#accessToken=${encodeURIComponent(tokens.accessToken)}&refreshToken=${encodeURIComponent(tokens.refreshToken)}`,
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        res.redirect(
          `${frontUrl}#error=email_already_exists&email=${encodeURIComponent(profile.email)}`,
        );
        return;
      }
      if (error instanceof UnauthorizedException) {
        res.redirect(`${frontUrl}#error=email_not_verified`);
        return;
      }
      throw error;
    }
  }

  @Delete('unlink')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Google 계정 연결 해제' })
  @ApiNoContentResponse({ description: '연결 해제 성공' })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  @ApiNotFoundResponse({ description: '연결된 Google 계정이 없음' })
  async googleUnlink(@CurrentUser() user: AuthUser): Promise<void> {
    await this.commandBus.execute(new UnlinkGoogleAccountCommand(user.id));
  }
}
