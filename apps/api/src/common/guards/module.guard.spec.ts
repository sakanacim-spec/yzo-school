import { ModuleGuard } from './module.guard';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';

describe('ModuleGuard', () => {
  let guard: ModuleGuard;
  let reflector: jest.Mocked<Reflector>;
  let supabaseService: jest.Mocked<SupabaseService>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    supabaseService = {
      admin: {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      },
    } as any;

    guard = new ModuleGuard(reflector, supabaseService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access if no module is required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { tenantId: '123' } }),
      }),
    } as any;

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });
});
