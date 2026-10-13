// src/source-history.ts
import { Step, StepMap, StepResult } from "prosemirror-transform";
var attempts = [];
function failActiveHistoryAttempts() {
  for (const attempt of attempts) attempt.failed = true;
}
function withSourceHistoryAttempt(fn) {
  const attempt = { failed: false };
  attempts.push(attempt);
  try {
    const value = fn();
    return { value, failed: attempt.failed };
  } finally {
    attempts.pop();
  }
}
function invalid() {
  throw new RangeError("Invalid source history payload");
}
function object(value, required, optional = []) {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (required.some((k) => !keys.includes(k))) invalid();
  for (const key of keys) {
    if (typeof key !== "string" || !required.includes(key) && !optional.includes(key)) invalid();
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d.enumerable || !("value" in d)) invalid();
  }
  return value;
}
function array(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) invalid();
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !("value" in d)) invalid();
  }
  return value;
}
function integer(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function string(value) {
  if (typeof value !== "string") invalid();
  return value;
}
function nonempty(value) {
  const s = string(value);
  if (!s.length) invalid();
  return s;
}
function hash(value) {
  const s = string(value);
  if (!/^[a-f0-9]{64}$/.test(s)) invalid();
  return s;
}
function edits(value, invertible) {
  const result = [];
  let previous, shift = 0, lastInverse = -1;
  for (const item of array(value)) {
    const e = object(item, ["from", "to", "removed", "text"]), from = integer(e.from), to = integer(e.to), removed = string(e.removed), text = string(e.text);
    if (to < from || removed.length !== to - from || removed === text || previous && (from <= previous.from || from < previous.to)) invalid();
    const inverseFrom = integer(from + shift);
    integer(inverseFrom + text.length);
    if (invertible && inverseFrom <= lastInverse) invalid();
    lastInverse = inverseFrom;
    shift += text.length - removed.length;
    previous = Object.freeze({ from, to, removed, text });
    result.push(previous);
  }
  return Object.freeze(result);
}
function binding(value) {
  const image = object(value, ["sourceHash", "roots"]), roots = [], ids = /* @__PURE__ */ new Set();
  let last = -1;
  for (const value2 of array(image.roots)) {
    const row = object(value2, ["rootOrdinal", "id"]), rootOrdinal = integer(row.rootOrdinal), id = nonempty(row.id);
    if (rootOrdinal <= last || ids.has(id)) invalid();
    last = rootOrdinal;
    ids.add(id);
    roots.push(Object.freeze({ rootOrdinal, id }));
  }
  return Object.freeze({ sourceHash: hash(image.sourceHash), roots: Object.freeze(roots) });
}
function rawDeltas(value) {
  const result = [];
  for (const item of array(value)) {
    const d = object(item, ["beforeLineage", "afterLineage", "beforeHash", "afterHash", "edits"], ["bindings"]);
    const beforeLineage = nonempty(d.beforeLineage), afterLineage = nonempty(d.afterLineage), beforeHash = hash(d.beforeHash), afterHash = hash(d.afterHash), changes = edits(d.edits, true);
    if (beforeLineage === afterLineage || !changes.length) invalid();
    let bindings;
    if ("bindings" in d) {
      const b = object(d.bindings, ["before", "after"]);
      bindings = Object.freeze({ before: binding(b.before), after: binding(b.after) });
      if (bindings.before.sourceHash !== beforeHash || bindings.after.sourceHash !== afterHash) invalid();
    }
    let removed = "", text = "", end = -1;
    for (const e of changes) {
      if (e.from !== end) {
        if (end >= 0 && removed === text) invalid();
        removed = "";
        text = "";
      }
      removed += e.removed;
      text += e.text;
      end = e.to;
    }
    if (removed === text) invalid();
    result.push(Object.freeze({ beforeLineage, afterLineage, beforeHash, afterHash, edits: changes, ...bindings ? { bindings } : {} }));
  }
  if (!result.length) invalid();
  return Object.freeze(result);
}
function tableImage(value) {
  if (value === null) return null;
  const image = object(value, ["position", "columns", "widths"]), position = integer(image.position), columns = integer(image.columns), widths = [];
  if (!columns) invalid();
  for (const width of array(image.widths)) {
    if (width !== null && (typeof width !== "number" || !Number.isFinite(width) || width <= 0)) invalid();
    widths.push(width);
  }
  if (widths.length !== columns) invalid();
  return Object.freeze({ position, columns, widths: Object.freeze(widths) });
}
function tableDeltas(value) {
  const result = [], ids = /* @__PURE__ */ new Set();
  for (const item of array(value)) {
    const d = object(item, ["id", "before", "after"]), id = nonempty(d.id), before = tableImage(d.before), after = tableImage(d.after);
    if (ids.has(id) || JSON.stringify(before) === JSON.stringify(after)) invalid();
    ids.add(id);
    result.push(Object.freeze({ id, before, after }));
  }
  if (!result.length) invalid();
  return Object.freeze(result);
}
function envelope(value, stepType) {
  const json = object(value, ["stepType", "v", "deltas"]);
  if (json.stepType !== stepType || json.v !== 1) invalid();
  return json.deltas;
}
var SourceHistoryStep = class _SourceHistoryStep extends Step {
  deltas;
  constructor(deltas) {
    super();
    this.deltas = rawDeltas(deltas);
    Object.freeze(this);
  }
  static canonicalEdits(input) {
    const result = [];
    let group;
    for (const e of edits(input, false)) {
      if (group && group.to === e.from) group = { from: group.from, to: e.to, removed: group.removed + e.removed, text: group.text + e.text };
      else {
        if (group && group.removed !== group.text) result.push(Object.freeze(group));
        group = { ...e };
      }
    }
    if (group && group.removed !== group.text) result.push(Object.freeze(group));
    return Object.freeze(result);
  }
  static invertEdits(input) {
    const result = [];
    let shift = 0;
    for (const e of edits(input, true)) {
      result.push(Object.freeze({ from: e.from + shift, to: e.from + shift + e.text.length, removed: e.text, text: e.removed }));
      shift += e.text.length - e.removed.length;
    }
    return Object.freeze(result);
  }
  apply(doc) {
    try {
      rawDeltas(this.deltas);
      return StepResult.ok(doc);
    } catch {
      failActiveHistoryAttempts();
      return StepResult.fail("Invalid source history payload");
    }
  }
  invert(_doc) {
    const result = [];
    for (let i = this.deltas.length - 1; i >= 0; i--) {
      const d = this.deltas[i];
      result.push({ beforeLineage: d.afterLineage, afterLineage: d.beforeLineage, beforeHash: d.afterHash, afterHash: d.beforeHash, edits: _SourceHistoryStep.invertEdits(d.edits), ...d.bindings ? { bindings: { before: d.bindings.after, after: d.bindings.before } } : {} });
    }
    return new _SourceHistoryStep(result);
  }
  getMap() {
    return StepMap.empty;
  }
  map(_mapping) {
    return new _SourceHistoryStep(this.deltas);
  }
  merge(_other) {
    return null;
  }
  toJSON() {
    return { stepType: "morayaSourceHistoryV1", v: 1, deltas: rawDeltas(this.deltas) };
  }
  static fromJSON(_schema, json) {
    return new _SourceHistoryStep(rawDeltas(envelope(json, "morayaSourceHistoryV1")));
  }
};
var TableLayoutStep = class _TableLayoutStep extends Step {
  deltas;
  constructor(deltas) {
    super();
    this.deltas = tableDeltas(deltas);
    Object.freeze(this);
  }
  apply(doc) {
    try {
      tableDeltas(this.deltas);
      return StepResult.ok(doc);
    } catch {
      failActiveHistoryAttempts();
      return StepResult.fail("Invalid table layout payload");
    }
  }
  invert(_doc) {
    const result = [];
    for (let i = this.deltas.length - 1; i >= 0; i--) {
      const d = this.deltas[i];
      result.push({ id: d.id, before: d.after, after: d.before });
    }
    return new _TableLayoutStep(result);
  }
  getMap() {
    return StepMap.empty;
  }
  map(_mapping) {
    return new _TableLayoutStep(this.deltas);
  }
  merge(_other) {
    return null;
  }
  toJSON() {
    return { stepType: "morayaTableLayoutV1", v: 1, deltas: tableDeltas(this.deltas) };
  }
  static fromJSON(_schema, json) {
    return new _TableLayoutStep(tableDeltas(envelope(json, "morayaTableLayoutV1")));
  }
};
Step.jsonID("morayaSourceHistoryV1", SourceHistoryStep);
Step.jsonID("morayaTableLayoutV1", TableLayoutStep);
export {
  SourceHistoryStep,
  TableLayoutStep,
  failActiveHistoryAttempts,
  withSourceHistoryAttempt
};
//# sourceMappingURL=source-history.js.map