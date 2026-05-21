/**
 * Parses `data/GF 0011-2009《汉字部首表》.txt` and exports the data as JSON
 * with English field names.
 *
 * Sections in the source file:
 *   - 主部首   → "main"      (201 entries)
 *   - 附形部首 → "variant"   (variant/alternate forms)
 *   - 附形参照 → "reference" (groupings of a main radical with its variants)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const inputPath = resolve(repoRoot, "data/GF 0011-2009《汉字部首表》.txt");
const outputPath = resolve(repoRoot, "radicals.json");

type Category = "main" | "variant" | "reference";

const CATEGORY_MAP: Record<string, Category> = {
  主部首: "main",
  附形部首: "variant",
  附形参照: "reference",
};

interface RadicalEntry {
  radical: string;
  strokeCount: number;
  notes?: string;
}

interface ReferenceEntry extends RadicalEntry {
  variants: string[];
}

interface RadicalsData {
  source: string;
  main: RadicalEntry[];
  variant: RadicalEntry[];
  reference: ReferenceEntry[];
}

/**
 * Pulls per-radical notes out of the source file's `# 说明` header block.
 *
 * The block has bullet lines like:
 *   - `屮(*)`：屮末笔改成竖撇
 *   - `车（*車）`：车字旁，车末笔改成提（暂未找到字）
 *   - `乛（*）`共 15 个附件：横折（𠃍）、...
 *
 * The radical we attach the note to is the character that appears *before*
 * the `(*)` / `（*…）` marker inside the backtick-quoted token.
 */
function parseSourceNotes(text: string): Record<string, string> {
  const notes: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  let inExplanationBlock = false;
  for (const line of lines) {
    if (!line.startsWith("#")) {
      if (inExplanationBlock && line.trim() === "") break;
      continue;
    }
    const body = line.replace(/^#\s?/, "");
    if (body.trim() === "说明") {
      inExplanationBlock = true;
      continue;
    }
    if (!inExplanationBlock) continue;
    if (body.startsWith("补充") || body.trim() === "") {
      if (body.startsWith("补充")) break;
      continue;
    }
    // Match a backtick-quoted token containing a `*` marker, e.g.
    // `屮(*)`, `车（*車）`, `乛（*）`. Capture the leading radical char.
    const tokenMatch = body.match(/`([^`]*[*][^`]*)`/);
    if (!tokenMatch) continue;
    const token = tokenMatch[1]!;
    const radicalMatch = token.match(/^(.)[（(]/);
    if (!radicalMatch) continue;
    const radical = radicalMatch[1]!;
    // Note text is whatever follows the backtick token on the same line,
    // stripped of the leading "：" / ":" separator if present.
    const afterToken = body.slice(
      (tokenMatch.index ?? 0) + tokenMatch[0].length,
    );
    const note = afterToken.replace(/^[:：]\s*/, "").trim();
    if (note !== "") notes[radical] = note;
  }
  return notes;
}

function parseStrokeCount(raw: string): number {
  const match = raw.match(/^(\d+)画$/);
  if (!match) {
    throw new Error(`Unrecognized stroke-count token: ${JSON.stringify(raw)}`);
  }
  return Number.parseInt(match[1]!, 10);
}

function parseCategory(raw: string): { category: Category; marked: boolean } {
  // The trailing `*` marker signals "this row has a note somewhere" — either
  // in the `# 说明` block or via cross-reference. We strip it for the
  // category lookup but pass the marker on so a later pass can backfill
  // notes that aren't in the header.
  const marked = raw.endsWith("*");
  const key = marked ? raw.slice(0, -1) : raw;
  const category = CATEGORY_MAP[key];
  if (!category) {
    throw new Error(`Unknown category: ${JSON.stringify(raw)}`);
  }
  return { category, marked };
}

/**
 * For "附形参照" rows the radical column looks like `人（亻入）` or
 * `邑（⻏，在右）`. Split it into the head radical, its variant characters,
 * and any trailing positional/qualifier note.
 */
function parseReferenceRadical(raw: string): {
  radical: string;
  variants: string[];
  notes?: string;
} {
  // Standard form `head（inner）` possibly followed by trailing characters.
  // The trailing form appears in row `丨（亅）乛` which bundles `丨` and `乛`
  // under one row.
  const match = raw.match(/^(.)（(.+)）(.*)$/);
  if (!match) {
    // e.g. `屮` — listed under 附形参照 with no parenthesised variants.
    return { radical: raw, variants: [] };
  }
  const head = match[1]!;
  const inner = match[2]!;
  const trailing = match[3]!;
  // Inner may contain a comma-separated note like `⻏，在右`. The comma used
  // is a fullwidth Chinese comma (，).
  const [variantsPart, ...noteParts] = inner.split("，");
  const variants = Array.from(variantsPart!).filter((ch) => ch.trim() !== "");
  const noteSegments: string[] = [];
  if (noteParts.length > 0) noteSegments.push(noteParts.join("，"));
  if (trailing !== "")
    noteSegments.push(`同行另含：${Array.from(trailing).join("")}`);
  const notes = noteSegments.length > 0 ? noteSegments.join("；") : undefined;
  return { radical: head, variants, notes };
}

function parse(text: string): RadicalsData {
  const data: RadicalsData = {
    source: "GF 0011-2009《汉字部首表》",
    main: [],
    variant: [],
    reference: [],
  };

  const headerNotes = parseSourceNotes(text);
  const markedVariants: RadicalEntry[] = [];

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line === "" || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length < 3) continue;
    const [radicalRaw, strokesRaw, categoryRaw] = cols as [
      string,
      string,
      string,
    ];

    const strokeCount = parseStrokeCount(strokesRaw);
    const { category, marked } = parseCategory(categoryRaw);

    if (category === "reference") {
      const {
        radical,
        variants,
        notes: inlineNotes,
      } = parseReferenceRadical(radicalRaw);
      const entry: ReferenceEntry = { radical, strokeCount, variants };
      const merged = mergeNotes(inlineNotes, headerNotes[radical]);
      if (merged !== undefined) entry.notes = merged;
      data.reference.push(entry);
    } else {
      const entry: RadicalEntry = { radical: radicalRaw, strokeCount };
      const note = headerNotes[radicalRaw];
      if (note !== undefined) entry.notes = note;
      data[category].push(entry);
      if (marked && note === undefined) markedVariants.push(entry);
    }
  }

  // Backfill: a variant row was marked with `*` but the header had no note
  // for it. Look it up in the reference groupings — if it appears as a
  // variant under some main radical, surface that linkage.
  for (const entry of markedVariants) {
    const owner = data.reference.find((ref) =>
      ref.variants.includes(entry.radical),
    );
    if (owner) {
      entry.notes = `参见附形参照：${owner.radical}（${owner.variants.join("")}）`;
    }
  }

  return data;
}

function mergeNotes(...parts: Array<string | undefined>): string | undefined {
  const filtered = parts.filter(
    (part): part is string => part !== undefined && part !== "",
  );
  return filtered.length === 0 ? undefined : filtered.join("；");
}

function main(): void {
  const text = readFileSync(inputPath, "utf8");
  const data = parse(text);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(data)}\n`, "utf8");

  console.log(
    `Wrote ${outputPath}: ${data.main.length} main, ${data.variant.length} variant, ${data.reference.length} reference`,
  );
}

main();
