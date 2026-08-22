import { describeImpact, groupByAuthor, isIncomingTransfer, type PendingEntry } from '../lib/approvalData';

const base: PendingEntry = {
  txnId: 't1', authorId: 'a', authorName: 'Aarav', groupName: 'Flat',
  category: 'Food', note: null, date: 0, arrivedAt: 100,
  kind: 'expense', total: 400000, myShare: 100000, myPaid: 0, recurFreq: null,
};

describe('describeImpact', () => {
  it('stays conditional — nothing here has happened yet', () => {
    const s = describeImpact(base);
    expect(s).toContain('would be');
    expect(s).not.toMatch(/\byou paid\b(?!.*would)/);
    // Exact, not rounded: this is a decision about a claim someone else made,
    // and being off by paise is exactly the kind of thing worth disputing.
    expect(s).toBe('Aarav added ₹4,000.00 for food in Flat. Your share would be ₹1,000.00.');
  });

  it('never leaves "it says you paid" implicit', () => {
    // Someone else claiming you paid is the only shape that can move your cash,
    // so it is always spelled out rather than inferred from the amount.
    const s = describeImpact({ ...base, myPaid: 400000 });
    expect(s).toContain('it says you paid ₹4,000.00');
  });

  it('says so plainly when none of it is mine', () => {
    expect(describeImpact({ ...base, myShare: 0 })).toContain('None of it is yours');
  });

  it('names a transfer as a transfer, not as a category', () => {
    // Outgoing: they say I paid THEM, so nothing is arriving and it reads like
    // any other entry.
    const outgoing = { ...base, kind: 'settlement' as const, myShare: 0, myPaid: 400000 };
    expect(describeImpact(outgoing)).toContain('for a transfer in Flat');
  });

  /**
   * The claim that needs its own sentence. "Aarav added ₹4,000 for a transfer"
   * reads like a cost; what is actually being asked is whether money reached you
   * — and approving it erases a real debt.
   */
  it('describes money arriving as a claim, and names what approving it costs', () => {
    const incoming = { ...base, kind: 'settlement' as const, myShare: 400000, total: 400000 };
    expect(isIncomingTransfer(incoming)).toBe(true);
    const s = describeImpact(incoming);
    expect(s).toContain('says they sent you ₹4,000.00');
    expect(s).toContain('clears ₹4,000.00 of what they owe you');
  });

  it('is not an arrival when they claim I paid them', () => {
    // My cash still moves on their say-so, so it still queues — but the question
    // is "did this happen", not "where did it land".
    expect(isIncomingTransfer({ ...base, kind: 'settlement', myShare: 0, myPaid: 400000 })).toBe(false);
  });

  it('says a rule is standing, before it is accepted rather than after', () => {
    const s = describeImpact({ ...base, recurFreq: 'monthly' });
    expect(s).toContain('every month');
    expect(s).toContain('accepts every one of these until you stop it');
  });
});

describe('groupByAuthor', () => {
  it('totals what accepting all of one person\'s entries would cost', () => {
    const g = groupByAuthor([base, { ...base, txnId: 't2', myShare: 50000 }]);
    expect(g).toHaveLength(1);
    expect(g[0].total).toBe(150000);
  });

  it('keeps the oldest unanswered person first, whatever the newcomer sends', () => {
    // A burst from someone new must not bury a request that has been waiting.
    const old = { ...base, authorId: 'old', authorName: 'Priya', arrivedAt: 10 };
    const recent = { ...base, authorId: 'new', authorName: 'Zoya', arrivedAt: 900 };
    const g = groupByAuthor([recent, { ...recent, txnId: 't3' }, old]);
    expect(g.map(x => x.authorName)).toEqual(['Priya', 'Zoya']);
  });

  it('groups per author rather than per entry', () => {
    const g = groupByAuthor([base, { ...base, txnId: 't2' }, { ...base, txnId: 't3', authorId: 'b', authorName: 'Bilal' }]);
    expect(g.map(x => x.entries.length)).toEqual([2, 1]);
  });
});
