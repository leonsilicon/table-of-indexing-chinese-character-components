# table-of-indexing-chinese-character-components

Machine-readable JSON of **GF 0011-2009《汉字部首表》** (*Table of Indexing Chinese Character Components*), the PRC national standard listing the radicals used to index Chinese characters.

The data covers:

- **201 main radicals** (主部首)
- **83 variant forms** (附形部首) — traditional, simplified-variant, and dependent forms
- **69 cross-reference groupings** (附形参照) — each main radical paired with its variant forms

The source is the plain-text file in `data/GF 0011-2009《汉字部首表》.txt`. Run `bun run parse` to regenerate `radicals.json`.

## Install

```bash
npm install table-of-indexing-chinese-character-components
```

## Usage

```js
import radicals from "table-of-indexing-chinese-character-components";

console.log(radicals.main.length);      // 201
console.log(radicals.variant.length);   // 83
console.log(radicals.reference.length); // 69

console.log(radicals.main[0]);
// { radical: "一", strokeCount: 1 }
```

The raw JSON is exposed as a subpath export if you'd rather import it directly:

```js
import radicals from "table-of-indexing-chinese-character-components/radicals.json" with { type: "json" };
```

## Shape

```ts
interface RadicalEntry {
  radical: string;       // e.g. "一", "亻", "邑"
  strokeCount: number;   // e.g. 1, 4, 8
  notes?: string;        // Chinese note from the source file (header explanation
                         // and/or inline positional qualifier, e.g. "在左", "在右")
}

interface ReferenceEntry extends RadicalEntry {
  variants: string[];    // variant forms grouped under this main radical
}

interface RadicalsData {
  source: "GF 0011-2009《汉字部首表》";
  main: RadicalEntry[];       // 201 main radicals (主部首)
  variant: RadicalEntry[];    // 83 variant forms (附形部首)
  reference: ReferenceEntry[];// 69 cross-reference groupings (附形参照)
}
```

`notes` are extracted verbatim from the source file — both the `# 说明` header block (e.g. `屮末笔改成竖撇`, `车字旁，车末笔改成提（暂未找到字）`) and the inline parenthetical qualifiers on reference rows (e.g. `在左`, `在右`).

## License

MIT
