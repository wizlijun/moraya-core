// src/plugins/definition-list.ts
import { wrappingInputRule } from "prosemirror-inputrules";
function createDefListInputRule(schema) {
  return wrappingInputRule(
    /^:\s{3}$/,
    schema.nodes.defListDescription
  );
}
export {
  createDefListInputRule
};
//# sourceMappingURL=definition-list.js.map