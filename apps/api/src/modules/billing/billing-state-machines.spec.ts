import { SubscriptionStateMachine } from './subscription-state-machine.service';
import { PaymentIntentStateMachine } from './payment-intent-state-machine.service';
import { InvoiceNumberGenerator } from './invoice-number.generator';
import { ForbiddenException } from '@nestjs/common';

describe('Billing Engine Core State Machines & Invoice Generator', () => {
  let subStateMachine: SubscriptionStateMachine;
  let intentStateMachine: PaymentIntentStateMachine;
  let invoiceGenerator: InvoiceNumberGenerator;
  let mockSupabase: any;

  beforeEach(() => {
    subStateMachine = new SubscriptionStateMachine();
    intentStateMachine = new PaymentIntentStateMachine();

    mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockResolvedValue({ count: 4, error: null }),
        }),
      }),
    };

    invoiceGenerator = new InvoiceNumberGenerator(mockSupabase);
  });

  describe('SubscriptionStateMachine', () => {
    it('should allow valid transition trialing -> active', () => {
      expect(subStateMachine.validateTransition('trialing', 'active')).toBe(true);
    });

    it('should allow valid transition active -> past_due', () => {
      expect(subStateMachine.validateTransition('active', 'past_due')).toBe(true);
    });

    it('should allow valid transition past_due -> suspended', () => {
      expect(subStateMachine.validateTransition('past_due', 'suspended')).toBe(true);
    });

    it('should throw ForbiddenException on illegal transition canceled -> active', () => {
      expect(() => subStateMachine.validateTransition('canceled', 'active')).toThrow(ForbiddenException);
    });
  });

  describe('PaymentIntentStateMachine', () => {
    it('should allow valid transition created -> processing', () => {
      expect(intentStateMachine.validateTransition('created', 'processing')).toBe(true);
    });

    it('should allow valid transition processing -> succeeded', () => {
      expect(intentStateMachine.validateTransition('processing', 'succeeded')).toBe(true);
    });

    it('should allow valid transition succeeded -> refunded', () => {
      expect(intentStateMachine.validateTransition('succeeded', 'refunded')).toBe(true);
    });

    it('should throw ForbiddenException on illegal transition failed -> succeeded', () => {
      expect(() => intentStateMachine.validateTransition('failed', 'succeeded')).toThrow(ForbiddenException);
    });
  });

  describe('InvoiceNumberGenerator', () => {
    it('should generate valid invoice number with prefix INV-YYYYMM-00005', async () => {
      const invoiceNum = await invoiceGenerator.generateNextInvoiceNumber();
      const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');
      expect(invoiceNum).toBe(`INV-${yearMonth}-00005`);
    });
  });
});
