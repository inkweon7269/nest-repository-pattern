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
import { AdminJwtAuthGuard } from './guard/admin-jwt-auth.guard';
import { CurrentAdmin } from './decorator/current-admin.decorator';
import { AuthAdmin } from './decorator/auth-admin.type';
import { AdminRole } from '@app/shared';
import { AdminRegisterCommand } from './command/admin-register.command';
import { AdminLoginCommand } from './command/admin-login.command';
import { AdminRefreshTokenCommand } from './command/admin-refresh-token.command';
import { AdminLogoutCommand } from './command/admin-logout.command';
import { GetAdminProfileQuery } from './query/get-admin-profile.query';
import { AdminRegisterRequestDto } from './dto/request/admin-register.request.dto';
import { AdminLoginRequestDto } from './dto/request/admin-login.request.dto';
import { AdminRefreshTokenRequestDto } from './dto/request/admin-refresh-token.request.dto';
import { AdminRegisterResponseDto } from './dto/response/admin-register.response.dto';
import { AdminAuthTokensResponseDto } from './dto/response/admin-auth-tokens.response.dto';
import { AdminProfileResponseDto } from './dto/response/admin-profile.response.dto';
import { AuthTokens } from '@app/shared';

@ApiTags('Admin Auth')
@Controller('back-office/auth')
export class AdminAuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('profile')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '관리자 프로필 조회' })
  @ApiOkResponse({ type: AdminProfileResponseDto })
  @ApiUnauthorizedResponse({ description: '인증되지 않은 요청' })
  @ApiNotFoundResponse({ description: '관리자를 찾을 수 없음' })
  async getProfile(
    @CurrentAdmin() admin: AuthAdmin,
  ): Promise<AdminProfileResponseDto> {
    return this.queryBus.execute(new GetAdminProfileQuery(admin.id));
  }

  @Post('register')
  @Throttle({ short: { ttl: 1000, limit: 2 }, long: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '관리자 등록' })
  @ApiCreatedResponse({ type: AdminRegisterResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiConflictResponse({ description: '중복된 이메일' })
  @ApiTooManyRequestsResponse({ description: '요청 횟수 초과' })
  async register(
    @Body() dto: AdminRegisterRequestDto,
  ): Promise<AdminRegisterResponseDto> {
    const id = await this.commandBus.execute<AdminRegisterCommand, number>(
      new AdminRegisterCommand(
        dto.email,
        dto.password,
        dto.name,
        AdminRole.MANAGER,
      ),
    );
    return AdminRegisterResponseDto.of(id);
  }

  @Post('login')
  @Throttle({ short: { ttl: 1000, limit: 2 }, long: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '관리자 로그인' })
  @ApiOkResponse({ type: AdminAuthTokensResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  @ApiTooManyRequestsResponse({ description: '요청 횟수 초과' })
  async login(
    @Body() dto: AdminLoginRequestDto,
  ): Promise<AdminAuthTokensResponseDto> {
    const tokens = await this.commandBus.execute<AdminLoginCommand, AuthTokens>(
      new AdminLoginCommand(dto.email, dto.password),
    );
    return AdminAuthTokensResponseDto.of(tokens);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '관리자 토큰 갱신' })
  @ApiOkResponse({ type: AdminAuthTokensResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiUnauthorizedResponse({ description: '유효하지 않은 리프레시 토큰' })
  @ApiTooManyRequestsResponse({ description: '요청 횟수 초과' })
  async refresh(
    @Body() dto: AdminRefreshTokenRequestDto,
  ): Promise<AdminAuthTokensResponseDto> {
    const tokens = await this.commandBus.execute<
      AdminRefreshTokenCommand,
      AuthTokens
    >(new AdminRefreshTokenCommand(dto.refreshToken));
    return AdminAuthTokensResponseDto.of(tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '관리자 로그아웃' })
  @ApiNoContentResponse({ description: '로그아웃 성공' })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  async logout(@CurrentAdmin() admin: AuthAdmin): Promise<void> {
    await this.commandBus.execute(new AdminLogoutCommand(admin.id));
  }
}
