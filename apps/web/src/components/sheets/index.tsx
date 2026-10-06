import { createPushModal } from 'pushmodal'

// Register future sheets as { Component: YourSheet, Wrapper: SheetWrapper }
// using SheetWrapper from ../overlays/pushmodal-wrappers.
export const {
  pushModal: pushSheet,
  popModal: popSheet,
  ModalProvider: SheetProvider,
} = createPushModal({ modals: {} })
