# Camera Scanner Validation Notes

The camera-scanner component uses a dedicated media-stream decoder and never registers keyboard events. The existing `useBarcodeScanner` hook remains mounted separately in the POS, so USB keyboard-wedge scanners continue to send rapid key sequences while the camera dialog is open.

The application has been type-checked and its scanner permission recovery messages are unit-tested. A real barcode scan and permission grant cannot be simulated by the sandbox preview because it has no physical mobile camera. On a phone, open **Mobile Scanner** in POS or the camera icon beside an invoice barcode field, approve browser camera access, then point the rear camera at a retail barcode. In invoice staging, the non-continuous mode should fill the active row and close. In POS, enable **Continuous** and verify that consecutive scans add items without closing the feed.
