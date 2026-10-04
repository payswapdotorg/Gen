/**
 * editor-adapters domain — minimal XML build/parse for MLT-family formats.
 *
 * Pure string processing for the subset the adapters emit (elements,
 * attributes, text; no DTDs, no CDATA). Round-trip fidelity of THIS helper
 * is asserted in tests; anything outside the subset is rejected, never
 * guessed (lock P5).
 */

export interface XmlElement {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

export interface XmlText {
  readonly text: string;
}

export type XmlNode = XmlElement | XmlText;

export function isElement(node: XmlNode): node is XmlElement {
  return (node as XmlElement).tag !== undefined;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

export function el(tag: string, attrs: Readonly<Record<string, string>> = {}, children: readonly XmlNode[] = []): XmlElement {
  return { tag, attrs, children };
}

export function text(value: string): XmlText {
  return { text: value };
}

/** Canonical serializer: self-closing when empty, double-quoted attrs. */
export function serializeXml(node: XmlNode, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (!isElement(node)) return `${pad}${escapeXml(node.text)}`;
  const attrs = Object.entries(node.attrs)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join("");
  if (node.children.length === 0) return `${pad}<${node.tag}${attrs}/>`;
  const inner = node.children.map((child) => serializeXml(child, indent + 1)).join("\n");
  return `${pad}<${node.tag}${attrs}>\n${inner}\n${pad}</${node.tag}>`;
}

export type XmlParseIssue = { readonly problem: string; readonly at: number };

export type XmlParseResult =
  | { readonly ok: true; readonly root: XmlElement }
  | { readonly ok: false; readonly issues: readonly XmlParseIssue[] };

interface MutableElement {
  readonly tag: string;
  readonly attrs: Record<string, string>;
  readonly children: XmlNode[];
}

/** Parse exactly one root element; declarations and comments are skipped. */
export function parseXml(source: string): XmlParseResult {
  const issues: XmlParseIssue[] = [];
  const stack: MutableElement[] = [];
  const roots: XmlNode[] = [];

  const pushNode = (node: XmlNode): void => {
    const parent = stack[stack.length - 1];
    if (parent !== undefined) parent.children.push(node);
    else roots.push(node);
  };
  const pushText = (raw: string): void => {
    const trimmed = unescapeXml(raw.trim());
    if (trimmed.length > 0) pushNode(text(trimmed));
  };

  let index = 0;
  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open === -1) {
      pushText(source.slice(index));
      break;
    }
    if (open > index) pushText(source.slice(index, open));
    if (source.startsWith("<?", open)) {
      const close = source.indexOf("?>", open);
      if (close === -1) {
        issues.push({ problem: "unterminated declaration", at: open });
        break;
      }
      index = close + 2;
      continue;
    }
    if (source.startsWith("<!--", open)) {
      const close = source.indexOf("-->", open);
      if (close === -1) {
        issues.push({ problem: "unterminated comment", at: open });
        break;
      }
      index = close + 3;
      continue;
    }
    if (source.startsWith("<![", open)) {
      issues.push({ problem: "CDATA/doctype not supported", at: open });
      break;
    }
    const tagEnd = source.indexOf(">", open);
    if (tagEnd === -1) {
      issues.push({ problem: "unterminated tag", at: open });
      break;
    }
    let raw = source.slice(open + 1, tagEnd).trim();
    const isClose = raw.startsWith("/");
    const isSelfClose = raw.endsWith("/");
    if (isClose && isSelfClose) {
      issues.push({ problem: `malformed tag: <${raw}>`, at: open });
      break;
    }
    if (isSelfClose) raw = raw.slice(0, -1).trim();
    if (isClose) {
      const tag = raw.slice(1).trim();
      const top = stack.pop();
      if (top === undefined || top.tag !== tag) {
        issues.push({ problem: `unexpected closing tag </${tag}>`, at: open });
        break;
      }
      index = tagEnd + 1;
      continue;
    }
    const nameMatch = /^([a-zA-Z_][\w.:-]*)/.exec(raw);
    if (nameMatch === null || nameMatch[1] === undefined) {
      issues.push({ problem: `malformed tag: <${raw}>`, at: open });
      break;
    }
    const tag = nameMatch[1];
    const attrs = parseAttrs(raw.slice(tag.length), issues, open);
    const node: MutableElement = { tag, attrs, children: [] };
    pushNode(node);
    if (!isSelfClose) stack.push(node);
    index = tagEnd + 1;
  }

  if (stack.length > 0) {
    issues.push({ problem: `unclosed tag <${stack[stack.length - 1]?.tag ?? "?"}>`, at: source.length });
  }
  if (issues.length > 0) return { ok: false, issues };

  const rootElement = roots.find(isElement);
  if (rootElement === undefined) {
    return { ok: false, issues: [{ problem: "no root element found", at: 0 }] };
  }
  return { ok: true, root: rootElement };
}

function parseAttrs(source: string, issues: XmlParseIssue[], at: number): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_][\w.:-]*)\s*=\s*"([^"]*)"/g;
  let match = pattern.exec(source);
  while (match !== null) {
    const key = match[1];
    if (key !== undefined) attrs[key] = unescapeXml(match[2] ?? "");
    match = pattern.exec(source);
  }
  const leftover = source.replace(pattern, "").trim();
  if (leftover.length > 0) {
    issues.push({ problem: `unexpected attribute content: "${leftover}"`, at });
  }
  return attrs;
}

/** Find first descendant by tag (depth-first). */
export function findByTag(node: XmlElement, tag: string): XmlElement | undefined {
  for (const child of node.children) {
    if (!isElement(child)) continue;
    if (child.tag === tag) return child;
    const nested = findByTag(child, tag);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** Find all descendants by tag (depth-first, document order). */
export function findAllByTag(node: XmlElement, tag: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const child of node.children) {
    if (!isElement(child)) continue;
    if (child.tag === tag) out.push(child);
    out.push(...findAllByTag(child, tag));
  }
  return out;
}

/** Child element property lookup for MLT-style <property name="k">v</property>. */
export function mltProperty(node: XmlElement, name: string): string | undefined {
  for (const child of node.children) {
    if (!isElement(child) || child.tag !== "property") continue;
    if (child.attrs.name === name) {
      const first = child.children.find((item) => !isElement(item));
      return first === undefined ? undefined : (first as XmlText).text;
    }
  }
  return undefined;
}
