// Minimal `react-native` stand-in for the pure-logic suite.
//
// The real package ships Flow-typed ESM this config does not transform, so any
// module that touches it — even transitively, even for one API it never calls in
// the test — was unrunnable. That is why `lib/confirm.ts` and everything importing
// it (`confirmPayment`, `confirmSettlement`) had no coverage at all, despite both
// being money paths.
//
// `Alert.alert` records its calls instead of rendering, and answers by invoking one
// of the buttons it was handed. Default is **Cancel** — the safe answer, and the one
// a swipe-away gives. A test that wants the confirming branch says so explicitly:
//
//   const { Alert } = require('react-native');
//   Alert.__answerWith('confirm');
//
// Add APIs here as tests need them; deliberately not a full RN shim.
let answer = 'cancel';

const Alert = {
  calls: [],
  alert(title, message, buttons, options) {
    Alert.calls.push({ title, message, buttons, options });
    if (!Array.isArray(buttons) || buttons.length === 0) return;
    if (answer === 'dismiss') { options?.onDismiss?.(); return; }
    // Convention across the app's prompts: the confirming action is last, cancel first.
    const btn = answer === 'confirm' ? buttons[buttons.length - 1] : buttons[0];
    btn?.onPress?.();
  },
  /** 'cancel' (default) | 'confirm' | 'dismiss' */
  __answerWith(next) { answer = next; },
  __reset() { Alert.calls = []; answer = 'cancel'; },
};

module.exports = {
  Alert,
  Platform: { OS: 'ios', select: (o) => o.ios ?? o.default },
};
