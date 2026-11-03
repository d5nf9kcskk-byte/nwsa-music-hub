import { ORG } from '../../org';

/** `features.bannerDrafter` (#banner-drafter). Off for every org today: with it
 *  off no Spanish box renders and no screen writes `changeNoteEs`. */
export const bannerDrafterOn = (): boolean => ORG.features.bannerDrafter === true;
