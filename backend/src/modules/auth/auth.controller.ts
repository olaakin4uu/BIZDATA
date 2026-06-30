import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { ProviderAuthGuard } from '../../common/guards/provider-auth.guard';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';
import { CurrentProviderUser } from '../../common/decorators/current-provider-user.decorator';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) password: string;
  @IsOptional() @IsString() totp?: string;
}

class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}

class MfaCodeDto {
  @IsString() @MinLength(6) token: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private service: AuthService) {}

  @Post('staff/login')
  @ApiOperation({ summary: 'Staff login' })
  staffLogin(@Body() dto: LoginDto, @Req() req: any) {
    return this.service.staffLogin(dto.email, dto.password, req.ip, req.headers?.['user-agent'], dto.totp);
  }

  @Post('staff/mfa/setup')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  mfaSetup(@CurrentStaff() u: any) {
    return this.service.mfaSetup(u.id);
  }

  @Post('staff/mfa/enable')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  mfaEnable(@CurrentStaff() u: any, @Body() dto: MfaCodeDto) {
    return this.service.mfaEnable(u.id, dto.token);
  }

  @Post('staff/mfa/disable')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  mfaDisable(@CurrentStaff() u: any, @Body() dto: MfaCodeDto) {
    return this.service.mfaDisable(u.id, dto.token);
  }

  @Post('provider/login')
  @ApiOperation({ summary: 'Provider user login' })
  providerLogin(@Body() dto: LoginDto, @Req() req: any) {
    return this.service.providerLogin(dto.email, dto.password, req.ip, req.headers?.['user-agent']);
  }

  @Get('staff/me')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  staffMe(@CurrentStaff() u: any) {
    return this.service.getStaffMe(u.id);
  }

  @Get('provider/me')
  @ApiBearerAuth()
  @UseGuards(ProviderAuthGuard)
  providerMe(@CurrentProviderUser() u: any) {
    return this.service.getProviderMe(u.id);
  }

  @Patch('staff/change-password')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  changeStaffPassword(@CurrentStaff() u: any, @Body() dto: ChangePasswordDto) {
    return this.service.changeStaffPassword(u.id, dto.currentPassword, dto.newPassword);
  }

  @Patch('provider/change-password')
  @ApiBearerAuth()
  @UseGuards(ProviderAuthGuard)
  changeProviderPassword(@CurrentProviderUser() u: any, @Body() dto: ChangePasswordDto) {
    return this.service.changeProviderPassword(u.id, dto.currentPassword, dto.newPassword);
  }
}
