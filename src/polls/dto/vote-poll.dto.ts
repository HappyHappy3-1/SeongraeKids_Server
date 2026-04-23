import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class VotePollDto {
  @ApiProperty({
    example: '7c2f16a5-72ee-4ed4-97c2-d53d6e5e0d4b',
    description: 'poll_votes.voter_user_id 에 저장되는 사용자 ID입니다.',
  })
  @IsUUID()
  voterId: string;

  @ApiProperty({
    example: '8bd1df98-ccec-4d52-8ca6-ff83b57ab09f',
    description: '선택한 옵션 ID입니다. 현재 DB에는 저장되지 않고 유효성 검사용으로만 사용됩니다.',
  })
  @IsUUID()
  optionId: string;

  @ApiPropertyOptional({
    example: '홍길동',
    description: '현재 DB에는 저장되지 않는 호환용 필드입니다.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  voterName?: string;
}
