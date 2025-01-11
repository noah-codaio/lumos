import { StateField, StateEffect } from '@codemirror/state';

// Effect to update the custom rewrite text
export const setCustomRewrite = StateEffect.define<string>();

// State field to store the custom rewrite text
export const customRewriteState = StateField.define<string>({
  create() {
    return '';
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setCustomRewrite)) {
        return e.value;
      }
    }
    return value;
  }
}); 