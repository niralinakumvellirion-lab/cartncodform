const { requirePaidPlan } = require('../middleware/requireOwner');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requirePaidPlan', () => {
  test('calls next() when store plan is pro', () => {
    const req = { store: { plan: 'pro' } };
    const res = mockRes();
    const next = jest.fn();

    requirePaidPlan(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 402 when store plan is free', () => {
    const req = { store: { plan: 'free' } };
    const res = mockRes();
    const next = jest.fn();

    requirePaidPlan(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ upgradeRequired: true })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 500 when req.store is missing (middleware ordering bug)', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    requirePaidPlan(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 402 when store.plan is undefined', () => {
    const req = { store: {} };
    const res = mockRes();
    const next = jest.fn();

    requirePaidPlan(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
  });
});
