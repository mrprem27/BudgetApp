// Pins the clock to FAKE_TODAY before any test module loads, so the suite can be
// re-run "on" a chosen calendar day. Written in plain ES5 on purpose: setupFiles
// runs outside rootDir's babel transform, so class syntax and spread break here.
//
// This exists because date-dependent bugs are invisible on the day you write the
// test. Two real ones surfaced this way: a saved-view id collision, and a fixture
// that only failed in January (setMonth(0) IS the current month then).
//
// Usage: npm run test:calendar   (sweeps a set of awkward dates)
var iso = process.env.FAKE_TODAY;
if (iso) {
  var fixed = new Date(iso).getTime();
  var RealDate = Date;

  function FakeDate(a, b, c, d, e, f, g) {
    if (!(this instanceof FakeDate)) return new RealDate(fixed).toString();
    switch (arguments.length) {
      case 0: return new RealDate(fixed);
      case 1: return new RealDate(a);
      case 2: return new RealDate(a, b);
      case 3: return new RealDate(a, b, c);
      case 4: return new RealDate(a, b, c, d);
      case 5: return new RealDate(a, b, c, d, e);
      case 6: return new RealDate(a, b, c, d, e, f);
      default: return new RealDate(a, b, c, d, e, f, g);
    }
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return fixed; };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;

  global.Date = FakeDate;
}
