// src/types.ts
var NULL_MEDIA_RESOLVER_SENTINEL = /* @__PURE__ */ Symbol("@moraya/core:null-media-resolver");
function isNullMediaResolver(r) {
  return r[NULL_MEDIA_RESOLVER_SENTINEL] === true;
}
export {
  NULL_MEDIA_RESOLVER_SENTINEL,
  isNullMediaResolver
};
//# sourceMappingURL=types.js.map