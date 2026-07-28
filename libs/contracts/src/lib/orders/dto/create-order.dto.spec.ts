import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

function validate(payload: unknown): string[] {
  const dto = plainToInstance(CreateOrderDto, payload);

  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...(error.children ?? []).flatMap((child) =>
      (child.children ?? []).flatMap((grandChild) =>
        Object.values(grandChild.constraints ?? {}),
      ),
    ),
  ]);
}

describe('CreateOrderDto', () => {
  it('accepts a well formed order', () => {
    expect(
      validate({
        customerId: 'cust-1',
        items: [{ sku: 'SKU-A', quantity: 2, unitCents: 500 }],
      }),
    ).toEqual([]);
  });

  it('rejects a blank customerId', () => {
    expect(validate({ customerId: '', items: [{ sku: 'A', quantity: 1, unitCents: 1 }] })).toContain(
      'customerId should not be empty',
    );
  });

  it('rejects an empty items array', () => {
    expect(validate({ customerId: 'cust-1', items: [] })).toContain('items should not be empty');
  });

  it('rejects a zero quantity', () => {
    const errors = validate({
      customerId: 'cust-1',
      items: [{ sku: 'A', quantity: 0, unitCents: 100 }],
    });

    expect(errors).toContain('quantity must not be less than 1');
  });

  it('rejects a negative unit price', () => {
    const errors = validate({
      customerId: 'cust-1',
      items: [{ sku: 'A', quantity: 1, unitCents: -1 }],
    });

    expect(errors).toContain('unitCents must not be less than 0');
  });

  it('rejects a client supplied total', () => {
    const errors = validate({
      customerId: 'cust-1',
      items: [{ sku: 'A', quantity: 1, unitCents: 100 }],
      totalCents: 999999,
    });

    expect(errors).toContain('property totalCents should not exist');
  });
});
