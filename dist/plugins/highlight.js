// src/plugins/highlight.ts
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import go from "highlight.js/lib/languages/go";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import diff from "highlight.js/lib/languages/diff";
import lua from "highlight.js/lib/languages/lua";
import scss from "highlight.js/lib/languages/scss";
import csharp from "highlight.js/lib/languages/csharp";
import dart from "highlight.js/lib/languages/dart";
import r from "highlight.js/lib/languages/r";
import perl from "highlight.js/lib/languages/perl";
import scala from "highlight.js/lib/languages/scala";
import objectivec from "highlight.js/lib/languages/objectivec";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import ini from "highlight.js/lib/languages/ini";
import powershell from "highlight.js/lib/languages/powershell";
import makefile from "highlight.js/lib/languages/makefile";
import groovy from "highlight.js/lib/languages/groovy";
import elixir from "highlight.js/lib/languages/elixir";
import haskell from "highlight.js/lib/languages/haskell";
import protobuf from "highlight.js/lib/languages/protobuf";
import graphql from "highlight.js/lib/languages/graphql";
import latex from "highlight.js/lib/languages/latex";
import nginx from "highlight.js/lib/languages/nginx";
import shell from "highlight.js/lib/languages/shell";
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c", c);
hljs.registerLanguage("go", go);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rb", ruby);
hljs.registerLanguage("php", php);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("kt", kotlin);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("lua", lua);
hljs.registerLanguage("scss", scss);
hljs.registerLanguage("svelte", xml);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("cs", csharp);
hljs.registerLanguage("dart", dart);
hljs.registerLanguage("r", r);
hljs.registerLanguage("perl", perl);
hljs.registerLanguage("pl", perl);
hljs.registerLanguage("scala", scala);
hljs.registerLanguage("objectivec", objectivec);
hljs.registerLanguage("objc", objectivec);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("docker", dockerfile);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("toml", ini);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("ps", powershell);
hljs.registerLanguage("ps1", powershell);
hljs.registerLanguage("makefile", makefile);
hljs.registerLanguage("make", makefile);
hljs.registerLanguage("groovy", groovy);
hljs.registerLanguage("elixir", elixir);
hljs.registerLanguage("ex", elixir);
hljs.registerLanguage("haskell", haskell);
hljs.registerLanguage("hs", haskell);
hljs.registerLanguage("protobuf", protobuf);
hljs.registerLanguage("proto", protobuf);
hljs.registerLanguage("graphql", graphql);
hljs.registerLanguage("gql", graphql);
hljs.registerLanguage("latex", latex);
hljs.registerLanguage("tex", latex);
hljs.registerLanguage("nginx", nginx);
hljs.registerLanguage("nginxconf", nginx);
hljs.registerLanguage("shell", shell);
var highlightPluginKey = new PluginKey("moraya-syntax-highlight");
function scopeToClasses(scope) {
  const parts = scope.split(".");
  const classes = [`hljs-${parts[0]}`];
  for (let i = 1; i < parts.length; i++) {
    classes.push(`${parts[i]}_`);
  }
  return classes;
}
function flattenHljsTree(nodes, parentClasses = []) {
  const result = [];
  for (const node of nodes) {
    if (typeof node === "string") {
      if (node.length > 0) {
        result.push({ text: node, classes: parentClasses });
      }
    } else {
      const classes = node.scope ? [...parentClasses, ...scopeToClasses(node.scope)] : parentClasses;
      if (node.children) {
        result.push(...flattenHljsTree(node.children, classes));
      }
    }
  }
  return result;
}
var HLJS_CACHE_MAX = 100;
var hljsCache = /* @__PURE__ */ new Map();
function hljsCacheKey(language, code) {
  return language + "\0" + code;
}
function getDecorations(doc) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return;
    const language = node.attrs.language || "";
    const code = node.textContent;
    if (!code) return;
    if (!language) return;
    if (!hljs.getLanguage(language)) return;
    const cKey = hljsCacheKey(language, code);
    const blockStart = pos + 1;
    const cachedSpans = hljsCache.get(cKey);
    if (cachedSpans) {
      for (const span of cachedSpans) {
        const from = blockStart + span.relOffset;
        const to = from + span.length;
        if (from < to) {
          decorations.push(Decoration.inline(from, to, { class: span.classes }));
        }
      }
      return;
    }
    let result;
    try {
      result = hljs.highlight(code, { language, ignoreIllegals: true });
    } catch {
      return;
    }
    const emitter = result;
    const rootNode = emitter._emitter?.rootNode ?? emitter._emitter?.root;
    if (!rootNode?.children) return;
    const spans = flattenHljsTree(rootNode.children);
    const toCache = [];
    let offset = 0;
    for (const span of spans) {
      const relOffset = offset;
      const length = span.text.length;
      offset += length;
      if (span.classes.length > 0 && length > 0) {
        const classes = span.classes.join(" ");
        toCache.push({ relOffset, length, classes });
        decorations.push(
          Decoration.inline(blockStart + relOffset, blockStart + relOffset + length, { class: classes })
        );
      }
    }
    if (hljsCache.size >= HLJS_CACHE_MAX) {
      const oldest = hljsCache.keys().next().value;
      if (oldest !== void 0) hljsCache.delete(oldest);
    }
    hljsCache.set(cKey, toCache);
  });
  return DecorationSet.create(doc, decorations);
}
function createHighlightPlugin() {
  let debounceTimer = null;
  let needsRefresh = false;
  let currentView = null;
  return new Plugin({
    key: highlightPluginKey,
    state: {
      init(_, state) {
        return getDecorations(state.doc);
      },
      apply(tr, decorationSet, _oldState, newState) {
        if (!tr.docChanged) {
          if (needsRefresh) {
            needsRefresh = false;
            return getDecorations(newState.doc);
          }
          return decorationSet;
        }
        if (tr.getMeta("file-switch")) {
          if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          return getDecorations(newState.doc);
        }
        if (tr.getMeta("full-delete")) {
          if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          needsRefresh = false;
          return getDecorations(newState.doc);
        }
        const mapped = decorationSet.map(tr.mapping, newState.doc);
        let affectsCodeBlock = false;
        const docSize = newState.doc.content.size;
        tr.mapping.maps.forEach((stepMap) => {
          if (affectsCodeBlock) return;
          stepMap.forEach((from, to) => {
            if (affectsCodeBlock) return;
            newState.doc.nodesBetween(
              Math.max(0, from),
              Math.min(to, docSize),
              (node) => {
                if (node.type.name === "code_block") affectsCodeBlock = true;
                return !affectsCodeBlock;
              }
            );
          });
        });
        if (!affectsCodeBlock) return mapped;
        if (debounceTimer !== null) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          needsRefresh = true;
          try {
            if (currentView && !currentView.isDestroyed) {
              currentView.dispatch(currentView.state.tr.setMeta("highlight-refresh", true));
            }
          } catch {
          }
        }, 300);
        return mapped;
      }
    },
    props: {
      decorations(state) {
        return this.getState(state);
      }
    },
    view(editorView) {
      currentView = editorView;
      return {
        destroy() {
          currentView = null;
          if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
        }
      };
    }
  });
}
export {
  createHighlightPlugin
};
//# sourceMappingURL=highlight.js.map