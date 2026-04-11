import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { CurrentUser } from '@app/shared';
import { AuthUser } from '@app/shared';
import { RegisterCommand } from './command/register.command';
import { LoginCommand } from './command/login.command';
import { RefreshTokenCommand } from './command/refresh-token.command';
import { LogoutCommand } from './command/logout.command';
import { GetProfileQuery } from './query/get-profile.query';
import { RegisterRequestDto } from './dto/request/register.request.dto';
import { LoginRequestDto } from './dto/request/login.request.dto';
import { RefreshTokenRequestDto } from './dto/request/refresh-token.request.dto';
import { RegisterResponseDto } from './dto/response/register.response.dto';
import { AuthTokensResponseDto } from './dto/response/auth-tokens.response.dto';
import { ProfileResponseDto } from './dto/response/profile.response.dto';
import { AuthTokens } from '@app/shared';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 프로필 조회' })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiUnauthorizedResponse({ description: '인증되지 않은 요청' })
  @ApiNotFoundResponse({ description: '사용자를 찾을 수 없음' })
  async getProfile(@CurrentUser() user: AuthUser): Promise<ProfileResponseDto> {
    return this.queryBus.execute(new GetProfileQuery(user.id));
  }

  @Post('register')
  @Throttle({ short: { ttl: 1000, limit: 2 }, long: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '회원가입' })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiConflictResponse({ description: '중복된 이메일' })
  @ApiTooManyRequestsResponse({ description: '요청 횟수 초과' })
  async register(
    @Body() dto: RegisterRequestDto,
  ): Promise<RegisterResponseDto> {
    const id = await this.commandBus.execute<RegisterCommand, number>(
      new RegisterCommand(dto.email, dto.password, dto.name),
    );
    return RegisterResponseDto.of(id);
  }

  @Post('login')
  @Throttle({ short: { ttl: 1000, limit: 2 }, long: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  @ApiTooManyRequestsResponse({ description: '요청 횟수 초과' })
  async login(@Body() dto: LoginRequestDto): Promise<AuthTokensResponseDto> {
    const tokens = await this.commandBus.execute<LoginCommand, AuthTokens>(
      new LoginCommand(dto.email, dto.password),
    );
    return AuthTokensResponseDto.of(tokens);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '토큰 갱신' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiUnauthorizedResponse({ description: '유효하지 않은 리프레시 토큰' })
  async refresh(
    @Body() dto: RefreshTokenRequestDto,
  ): Promise<AuthTokensResponseDto> {
    const tokens = await this.commandBus.execute<
      RefreshTokenCommand,
      AuthTokens
    >(new RefreshTokenCommand(dto.refreshToken));
    return AuthTokensResponseDto.of(tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '로그아웃' })
  @ApiNoContentResponse({ description: '로그아웃 성공' })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.commandBus.execute(new LogoutCommand(user.id));
  }
}
