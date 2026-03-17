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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@src/auth/guard/jwt-auth.guard';
import { CurrentUser } from '@src/common/decorator/current-user.decorator';
import { AuthUser } from '@src/common/decorator/auth-user.type';
import { RegisterCommand } from '@src/auth/command/register.command';
import { LoginCommand } from '@src/auth/command/login.command';
import { RefreshTokenCommand } from '@src/auth/command/refresh-token.command';
import { GetProfileQuery } from '@src/auth/query/get-profile.query';
import { RegisterRequestDto } from '@src/auth/dto/request/register.request.dto';
import { LoginRequestDto } from '@src/auth/dto/request/login.request.dto';
import { RefreshTokenRequestDto } from '@src/auth/dto/request/refresh-token.request.dto';
import { RegisterResponseDto } from '@src/auth/dto/response/register.response.dto';
import { AuthTokensResponseDto } from '@src/auth/dto/response/auth-tokens.response.dto';
import { ProfileResponseDto } from '@src/auth/dto/response/profile.response.dto';
import { AuthTokens } from '@src/auth/auth.types';

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
  @ApiOperation({ summary: '회원가입' })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiConflictResponse({ description: '중복된 이메일' })
  async register(
    @Body() dto: RegisterRequestDto,
  ): Promise<RegisterResponseDto> {
    const id = await this.commandBus.execute<RegisterCommand, number>(
      new RegisterCommand(dto.email, dto.password, dto.name),
    );
    return RegisterResponseDto.of(id);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
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
}
