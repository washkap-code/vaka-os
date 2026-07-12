import { useMemo, useState } from "react";
import guideMarkdown from "../../docs/16-training/SUPER-ADMIN-USER-GUIDE.md?raw";

type GuideSection = {
  id: string;
  title: string;
  lines: string[];
};

const slug = (value: string): string => value.toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

const parseGuide = (source: string): GuideSection[] => {
  const sections: GuideSection[] = [];
  let current: GuideSection = { id: "guide-start", title: "Start here", lines: [] };
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("# ")) continue;
    if (line.startsWith("## ")) {
      if (current.lines.some((item) => item.trim())) sections.push(current);
      const title = line.slice(3).trim();
      current = { id: `guide-${slug(title)}`, title, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.some((item) => item.trim())) sections.push(current);
  return sections;
};

const renderLine = (line: string, index: number) => {
  if (!line.trim()) return null;
  if (line.startsWith("### ")) return <h3 key={index}>{line.slice(4)}</h3>;
  if (line.startsWith("- ")) return <p className="guide-list-item" key={index}><span aria-hidden="true">•</span>{line.slice(2)}</p>;
  if (/^\d+\.\s/.test(line)) return <p className="guide-list-item numbered" key={index}>{line}</p>;
  if (line.startsWith("> ")) return <aside className="guide-note" key={index}>{line.slice(2)}</aside>;
  return <p key={index}>{line}</p>;
};

export function PlatformAdminGuide() {
  const [query, setQuery] = useState("");
  const sections = useMemo(() => parseGuide(guideMarkdown), []);
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sections;
    return sections.filter((section) =>
      `${section.title}\n${section.lines.join("\n")}`.toLowerCase().includes(normalized));
  }, [query, sections]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([guideMarkdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "VAKA-OS-SUPER-ADMIN-USER-GUIDE.md";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="guide-shell">
      <div className="panel guide-toolbar">
        <div>
          <h2>Super Admin User Guide</h2>
          <p>Controlled operating guidance bundled from the repository Markdown source.</p>
        </div>
        <div className="guide-actions">
          <label htmlFor="guide-search">Search the guide</label>
          <div className="row">
            <input id="guide-search" type="search" value={query}
              onChange={(event) => setQuery(event.target.value)} placeholder="Billing, incidents, audit, launch…" />
            <button className="btn ghost" onClick={download}>Download Markdown</button>
            <button className="btn ghost" onClick={() => window.print()}>Print or save PDF</button>
          </div>
        </div>
      </div>
      <div className="guide-layout">
        <nav className="panel guide-toc" aria-label="User guide contents">
          <h2>Contents</h2>
          {visible.map((section) => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}
          {!visible.length && <p>No section matches that search.</p>}
        </nav>
        <article className="panel guide-document">
          {visible.map((section) => (
            <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.lines.map(renderLine)}
            </section>
          ))}
          {!visible.length && <div className="guide-empty">Try a broader word such as tenant, billing, security or release.</div>}
        </article>
      </div>
    </div>
  );
}
