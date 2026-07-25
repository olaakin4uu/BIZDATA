import { IsArray, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CandidateLoginDto {
  @IsString()
  @MinLength(4)
  accessCode!: string;
}

export class Part1Dto {
  /** Free-form personal-details map; keys are validated against PART1_FIELDS. */
  @IsOptional()
  details?: Record<string, string>;
}

export class AnswerDto {
  @IsString()
  questionId!: string;

  @IsInt()
  @Min(0)
  chosenIndex!: number;
}

export class AdminLoginDto {
  @IsString()
  username!: string;

  @IsString()
  password!: string;
}

export class CreateParticipantsDto {
  /** How many access codes to generate (when labels not supplied). */
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;

  /** Optional labels (candidate names / batch); one code per label. */
  @IsOptional()
  @IsArray()
  labels?: string[];
}

export class UpsertQuestionDto {
  @IsString() topic!: string;
  @IsOptional() @IsString() title?: string;
  @IsString() stem!: string;
  @IsArray() options!: string[];
  @IsInt() @Min(0) correctIndex!: number;
  @IsOptional() @IsString() competency?: string;
  @IsOptional() isCaseStudy?: boolean;
  @IsOptional() active?: boolean;
}

export class SetActiveDto {
  active!: boolean;
}
