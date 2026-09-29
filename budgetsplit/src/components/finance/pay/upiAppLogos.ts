import type { ImageSourcePropType } from 'react-native';
import { UpiApp } from '../../../lib/upiIntent';

/**
 * Each app's own icon, bundled (no network call at runtime). The artwork is the publishers' App Store
 * icon, fetched from Apple's listing for each bundle id and resized to 144px — see
 * `docs/SYSTEM.md` (UPI) for provenance. These are the apps' trademarks, shown only to say which app
 * a payment opens; `UpiAppIcon` falls back to a monogram for any app without one.
 */
export const UPI_APP_LOGOS: Partial<Record<UpiApp, ImageSourcePropType>> = {
  [UpiApp.PhonePe]: require('../../../assets/upi/phonepe.png'),
  [UpiApp.GooglePay]: require('../../../assets/upi/googlepay.png'),
  [UpiApp.Paytm]: require('../../../assets/upi/paytm.png'),
  [UpiApp.Bhim]: require('../../../assets/upi/bhim.png'),
  [UpiApp.Cred]: require('../../../assets/upi/cred.png'),
  [UpiApp.AmazonPay]: require('../../../assets/upi/amazonpay.png'),
  [UpiApp.WhatsApp]: require('../../../assets/upi/whatsapp.png'),
  [UpiApp.Navi]: require('../../../assets/upi/navi.png'),
  [UpiApp.Mobikwik]: require('../../../assets/upi/mobikwik.png'),
  [UpiApp.Airtel]: require('../../../assets/upi/airtel.png'),
  [UpiApp.SuperMoney]: require('../../../assets/upi/supermoney.png'),
  [UpiApp.Kiwi]: require('../../../assets/upi/kiwi.png'),
};
