#!/usr/bin/env python3
"""Build the consolidated VAKA OS Master Programme Blueprint Markdown and PDF."""

from __future__ import annotations

import argparse
import html
import re
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Iterable

import reportlab
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    LongTable,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
BLUEPRINT = ROOT / "docs" / "06-master-programme-blueprint"
COMBINED_MD = BLUEPRINT / "VAKA-OS-MASTER-PROGRAMME-BLUEPRINT.md"
OUTPUT_PDF = ROOT / "output" / "pdf" / "VAKA-OS-MASTER-PROGRAMME-BLUEPRINT.pdf"

SOURCES = [
    "00-governance/DOCUMENT-CONTROL.md",
    "00-governance/STATUS-AND-CLAIM-LEGEND.md",
    "00-governance/ARCHITECTURE-FREEZE-REGISTER.md",
    "00-governance/CONTRADICTION-NORMALISATION-LOG.md",
    "books/01-executive-programme-definition/README.md",
    "books/02-platform-foundation/README.md",
    "books/03-enterprise-construction-master-plan/README.md",
    "books/04-engineering-execution-framework/README.md",
    "books/05-complete-capability-catalogue/README.md",
    "books/06-enterprise-data-model/README.md",
    "books/07-platform-services/README.md",
    "books/08-finance-and-accounting/README.md",
    "books/09-business-operations/README.md",
    "books/10-communications/README.md",
    "books/11-business-network/README.md",
    "books/12-ai-and-intelligence/README.md",
    "books/13-security/README.md",
    "books/14-integrations/README.md",
    "books/15-country-packs/README.md",
    "books/16-industry-packs/README.md",
    "books/17-ux-and-design-system/README.md",
    "books/18-devops-and-infrastructure/README.md",
    "books/19-testing-and-quality-assurance/README.md",
    "books/20-commercial-operations/README.md",
    "books/21-customer-success/README.md",
    "books/22-operations-manual/README.md",
    "books/23-product-roadmap/README.md",
    "books/24-engineering-mission-catalogue/README.md",
    "00-governance/REQUIREMENT-TRACEABILITY-MATRIX.md",
    "00-governance/PROFESSIONAL-REVIEW-REGISTER.md",
    "00-governance/BENCHMARK-METHOD.md",
]

NAVY = colors.HexColor("#14171F")
GOLD = colors.HexColor("#C9A227")
INK = colors.HexColor("#242832")
MUTED = colors.HexColor("#626A76")
LIGHT = colors.HexColor("#F2F4F6")
LINE = colors.HexColor("#D7DBE0")
REPORTLAB_FONTS = Path(reportlab.__file__).resolve().parent / "fonts"


def normalize_text(value: str) -> str:
    replacements = {
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\u2192": "->",
        "\u2193": "v",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
        "\u00a0": " ",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def source_paths() -> list[Path]:
    paths = [BLUEPRINT / item for item in SOURCES]
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing manifest sources:\n" + "\n".join(missing))
    return paths


def build_combined_markdown(paths: Iterable[Path]) -> str:
    preface = """# VAKA OS Master Programme Blueprint

**The Operating System for African Business**  
**Designed in Zimbabwe. Built for Africa.**

**Edition:** 1.0  
**Effective:** 2026-07-11  
**Classification:** Internal engineering programme baseline

> This is a complete target blueprint, not a claim that every capability is implemented or available. Source authority and status rules are defined in the governance section.

---
"""
    sections: list[str] = [preface.strip()]
    for path in paths:
        content = normalize_text(path.read_text(encoding="utf-8").strip())
        sections.append(f"<!-- source: {path.relative_to(ROOT)} -->\n\n{content}")
    result = "\n\n<div style=\"page-break-after: always\"></div>\n\n".join(sections) + "\n"
    COMBINED_MD.write_text(result, encoding="utf-8")
    return result


def register_fonts() -> tuple[str, str, str]:
    candidates = [
        (str(REPORTLAB_FONTS / "Vera.ttf"), str(REPORTLAB_FONTS / "VeraBd.ttf"), str(REPORTLAB_FONTS / "Vera.ttf")),
        ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Courier New.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
    ]
    for regular, bold, mono in candidates:
        if all(Path(item).is_file() for item in (regular, bold, mono)):
            pdfmetrics.registerFont(TTFont("VakaSans", regular))
            pdfmetrics.registerFont(TTFont("VakaSansBold", bold))
            pdfmetrics.registerFont(TTFont("VakaMono", mono))
            return "VakaSans", "VakaSansBold", "VakaMono"
    return "Helvetica", "Helvetica-Bold", "Courier"


REGULAR_FONT, BOLD_FONT, MONO_FONT = register_fonts()


@lru_cache(maxsize=128)
def raster_label(text: str) -> tuple[bytes, int, int]:
    """Return a high-resolution transparent label for page furniture.

    The body remains real PDF text. Only the two running labels are rasterised
    because several headless PDF renderers clip Type 1/TrueType canvas text
    when no writable host font catalogue exists.
    """

    font = ImageFont.truetype(str(REPORTLAB_FONTS / "Vera.ttf"), 34)
    left, top, right, bottom = font.getbbox(text)
    width = right - left + 12
    height = bottom - top + 12
    # Opaque white avoids transparency-mask cache differences between PDF
    # renderers while remaining invisible in the white page margins.
    image = Image.new("RGB", (width, height), (255, 255, 255))
    drawer = ImageDraw.Draw(image)
    drawer.text((6 - left, 6 - top), text, font=font, fill=(98, 106, 118))
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue(), width, height


def draw_raster_label(canvas, text: str, x: float, y: float, target_height: float, *, right_aligned: bool = False) -> None:
    data, pixel_width, pixel_height = raster_label(text)
    target_width = target_height * pixel_width / pixel_height
    if right_aligned:
        x -= target_width
    canvas.drawImage(
        ImageReader(BytesIO(data)),
        x,
        y,
        width=target_width,
        height=target_height,
        preserveAspectRatio=True,
        mask=None,
    )


def inline_markup(value: str) -> str:
    value = normalize_text(value.strip())
    escaped = html.escape(value, quote=False)
    escaped = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<link href="\2" color="#7A641A">\1</link>', escaped)
    escaped = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"`([^`]+)`", r'<font name="VakaMono" color="#3D4653">\1</font>' if MONO_FONT == "VakaMono" else r'<font name="Courier" color="#3D4653">\1</font>', escaped)
    return escaped


def styles():
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle("Body", parent=base["BodyText"], fontName=REGULAR_FONT, fontSize=9.2, leading=13.1, textColor=INK, spaceAfter=5.5 * mm, allowWidows=0, allowOrphans=0),
        "meta": ParagraphStyle("Meta", parent=base["BodyText"], fontName=REGULAR_FONT, fontSize=8.3, leading=11.5, textColor=MUTED, spaceAfter=2.5 * mm),
        "h1": ParagraphStyle("H1", parent=base["Heading1"], fontName=BOLD_FONT, fontSize=22, leading=27, textColor=NAVY, spaceBefore=0, spaceAfter=8 * mm, keepWithNext=True),
        "h2": ParagraphStyle("H2", parent=base["Heading2"], fontName=BOLD_FONT, fontSize=14.5, leading=18, textColor=NAVY, spaceBefore=7 * mm, spaceAfter=3.5 * mm, keepWithNext=True),
        "h3": ParagraphStyle("H3", parent=base["Heading3"], fontName=BOLD_FONT, fontSize=11.5, leading=15, textColor=colors.HexColor("#5F5017"), spaceBefore=5 * mm, spaceAfter=2.5 * mm, keepWithNext=True),
        "bullet": ParagraphStyle("Bullet", parent=base["BodyText"], fontName=REGULAR_FONT, fontSize=9, leading=12.5, leftIndent=5 * mm, firstLineIndent=-3.2 * mm, textColor=INK, spaceAfter=1.8 * mm),
        "quote": ParagraphStyle("Quote", parent=base["BodyText"], fontName=REGULAR_FONT, fontSize=9.3, leading=13, leftIndent=7 * mm, rightIndent=4 * mm, borderColor=GOLD, borderWidth=1.4, borderPadding=(2 * mm, 3 * mm, 2 * mm, 4 * mm), backColor=colors.HexColor("#FAF8EF"), textColor=INK, spaceBefore=2 * mm, spaceAfter=5 * mm),
        "code": ParagraphStyle("Code", fontName=MONO_FONT, fontSize=7.4, leading=9.5, textColor=NAVY, backColor=LIGHT, borderColor=LINE, borderWidth=0.5, borderPadding=3 * mm, spaceAfter=4 * mm),
        "table": ParagraphStyle("TableCell", fontName=REGULAR_FONT, fontSize=7.4, leading=9.4, textColor=INK),
        "table_head": ParagraphStyle("TableHead", fontName=BOLD_FONT, fontSize=7.2, leading=9.2, textColor=colors.white),
        "toc_title": ParagraphStyle("TOCTitle", fontName=BOLD_FONT, fontSize=22, leading=27, textColor=NAVY, spaceAfter=7 * mm),
        "toc1": ParagraphStyle("TOC1", fontName=BOLD_FONT, fontSize=9.5, leading=13, textColor=NAVY, leftIndent=0, firstLineIndent=0, spaceBefore=1.4 * mm),
        "toc2": ParagraphStyle("TOC2", fontName=REGULAR_FONT, fontSize=8.2, leading=11, textColor=MUTED, leftIndent=7 * mm, firstLineIndent=0),
    }


STYLES = styles()


class BlueprintDocTemplate(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            if style in {"H1", "H2"}:
                level = 0 if style == "H1" else 1
                text_value = flowable.getPlainText()
                key = f"heading-{self.page}-{abs(hash(text_value))}"
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(text_value, key, level=level, closed=level > 0)
                self.notify("TOCEntry", (level, text_value, self.page, key))


def draw_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    if doc.page == 1:
        canvas.restoreState()
        return
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(20 * mm, height - 15 * mm, width - 20 * mm, height - 15 * mm)
    draw_raster_label(canvas, "VAKA OS Master Programme Blueprint", 20 * mm, height - 12.2 * mm, 3.3 * mm)
    draw_raster_label(
        canvas,
        f"Internal programme baseline | Page {doc.page}",
        width - 20 * mm,
        8.3 * mm,
        3.1 * mm,
        right_aligned=True,
    )
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1.1)
    canvas.line(20 * mm, 14 * mm, 58 * mm, 14 * mm)
    canvas.restoreState()


def cover_story() -> list:
    width, height = A4
    spacer = (height - 80 * mm) / 4
    return [
        Spacer(1, spacer),
        Table([["VAKA"]], colWidths=[45 * mm], rowHeights=[17 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
            ("FONTNAME", (0, 0), (-1, -1), BOLD_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 18),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOX", (0, 0), (-1, -1), 2, GOLD),
        ]), hAlign="CENTER"),
        Spacer(1, 15 * mm),
        Paragraph("VAKA OS", ParagraphStyle("CoverKicker", fontName=BOLD_FONT, fontSize=15, leading=18, alignment=TA_CENTER, textColor=GOLD, spaceAfter=4 * mm)),
        Paragraph("MASTER PROGRAMME<br/>BLUEPRINT", ParagraphStyle("CoverTitle", fontName=BOLD_FONT, fontSize=30, leading=35, alignment=TA_CENTER, textColor=NAVY, spaceAfter=8 * mm)),
        Paragraph("The Operating System for African Business", ParagraphStyle("CoverSub", fontName=REGULAR_FONT, fontSize=13, leading=18, alignment=TA_CENTER, textColor=INK, spaceAfter=2 * mm)),
        Paragraph("Designed in Zimbabwe. Built for Africa.", ParagraphStyle("CoverLine", fontName=BOLD_FONT, fontSize=10, leading=14, alignment=TA_CENTER, textColor=MUTED, spaceAfter=16 * mm)),
        Table([
            ["Edition", "1.0"],
            ["Effective", "11 July 2026"],
            ["Classification", "Internal engineering programme baseline"],
            ["Status", "Architecture and programme baseline"],
        ], colWidths=[38 * mm, 85 * mm], style=TableStyle([
            ("FONTNAME", (0, 0), (0, -1), BOLD_FONT),
            ("FONTNAME", (1, 0), (1, -1), REGULAR_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("TEXTCOLOR", (0, 0), (-1, -1), INK),
            ("BACKGROUND", (0, 0), (0, -1), LIGHT),
            ("GRID", (0, 0), (-1, -1), 0.5, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]), hAlign="CENTER"),
        Spacer(1, 10 * mm),
        Paragraph("A complete target blueprint is not a claim that every capability is implemented, verified, certified or available.", ParagraphStyle("CoverNote", fontName=REGULAR_FONT, fontSize=8.5, leading=12, alignment=TA_CENTER, textColor=MUTED, leftIndent=20 * mm, rightIndent=20 * mm)),
        PageBreak(),
    ]


def table_widths(columns: int, available: float) -> list[float]:
    ratios = {
        2: [0.31, 0.69],
        3: [0.20, 0.34, 0.46],
        4: [0.13, 0.24, 0.36, 0.27],
        5: [0.10, 0.18, 0.28, 0.22, 0.22],
    }.get(columns, [1 / columns] * columns)
    return [available * ratio for ratio in ratios]


def make_table(rows: list[list[str]], available_width: float):
    max_cols = max(len(row) for row in rows)
    normalized = [row + [""] * (max_cols - len(row)) for row in rows]
    data = []
    for row_index, row in enumerate(normalized):
        style = STYLES["table_head"] if row_index == 0 else STYLES["table"]
        data.append([Paragraph(inline_markup(cell), style) for cell in row])
    table = LongTable(data, colWidths=table_widths(max_cols, available_width), repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def markdown_to_story(markdown: str, available_width: float) -> list:
    lines = normalize_text(markdown).splitlines()
    story: list = []
    paragraph_parts: list[str] = []
    table_rows: list[list[str]] = []
    code_lines: list[str] = []
    in_code = False
    first_h1 = True

    def flush_paragraph():
        nonlocal paragraph_parts
        if paragraph_parts:
            text_value = " ".join(part.strip() for part in paragraph_parts).strip()
            if text_value:
                style = STYLES["meta"] if text_value.startswith("**") and text_value.count("**") >= 2 else STYLES["body"]
                story.append(Paragraph(inline_markup(text_value), style))
            paragraph_parts = []

    def flush_table():
        nonlocal table_rows
        if table_rows:
            rows = [row for row in table_rows if not all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in row)]
            if rows:
                story.append(make_table(rows, available_width))
                story.append(Spacer(1, 4 * mm))
            table_rows = []

    def flush_code():
        nonlocal code_lines
        if code_lines:
            story.append(Preformatted("\n".join(code_lines), STYLES["code"] , maxLineLength=110))
            code_lines = []

    for raw_line in lines:
        hard_break = raw_line.endswith("  ")
        line = raw_line.rstrip()
        if line.startswith("<!--") or line.startswith("<div"):
            continue
        if line.strip().startswith("```"):
            flush_paragraph()
            flush_table()
            if in_code:
                flush_code()
                in_code = False
            else:
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue
        if line.startswith("|") and line.endswith("|"):
            flush_paragraph()
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            table_rows.append(cells)
            continue
        flush_table()
        if not line.strip():
            flush_paragraph()
            continue
        heading = re.match(r"^(#{1,3})\s+(.+)$", line)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            title = heading.group(2).strip()
            if level == 1:
                if not first_h1:
                    story.append(PageBreak())
                first_h1 = False
                story.append(Paragraph(inline_markup(title), STYLES["h1"]))
            elif level == 2:
                story.append(Paragraph(inline_markup(title), STYLES["h2"]))
            else:
                story.append(Paragraph(inline_markup(title), STYLES["h3"]))
            continue
        if re.fullmatch(r"-{3,}", line.strip()):
            flush_paragraph()
            story.append(Spacer(1, 2 * mm))
            continue
        if line.lstrip().startswith(">"):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line.lstrip()[1:].strip()), STYLES["quote"]))
            continue
        bullet = re.match(r"^\s*[-*]\s+(.+)$", line)
        numbered = re.match(r"^\s*(\d+)\.\s+(.+)$", line)
        if bullet or numbered:
            flush_paragraph()
            marker = "-" if bullet else f"{numbered.group(1)}."
            value = bullet.group(1) if bullet else numbered.group(2)
            story.append(Paragraph(f"{marker} {inline_markup(value)}", STYLES["bullet"]))
            continue
        paragraph_parts.append(line)
        if hard_break:
            flush_paragraph()

    flush_paragraph()
    flush_table()
    flush_code()
    return story


def build_pdf(markdown: str):
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    page_width, page_height = A4
    left = 20 * mm
    right = 20 * mm
    top = 22 * mm
    bottom = 19 * mm
    frame = Frame(left, bottom, page_width - left - right, page_height - top - bottom, id="normal", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc = BlueprintDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        rightMargin=right,
        leftMargin=left,
        topMargin=top,
        bottomMargin=bottom,
        title="VAKA OS Master Programme Blueprint",
        author="VAKA",
        subject="Architecture, product, engineering and launch programme baseline",
    )
    # Paint running furniture after the body. Some multi-page tables and the
    # generated TOC legitimately use clipping while they draw; placing the
    # header/footer in ``onPageEnd`` prevents that body state from obscuring
    # otherwise valid page furniture in the rendered PDF.
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPageEnd=draw_page)])

    toc = TableOfContents()
    toc.levelStyles = [STYLES["toc1"], STYLES["toc2"]]
    story = cover_story()
    story.extend([
        Paragraph("Contents", STYLES["toc_title"]),
        toc,
        PageBreak(),
    ])
    available_width = page_width - left - right
    # The combined Markdown contains a generated cover heading. Skip its preface
    # because the PDF cover already presents it; start at Document Control.
    start = markdown.find("# Document control")
    body = markdown[start:] if start >= 0 else markdown
    story.extend(markdown_to_story(body, available_width))
    doc.multiBuild(story)


def verify_pdf(paths: Iterable[Path]) -> None:
    """Fail the build if the consolidated PDF loses a book or text glyph."""

    reader = PdfReader(str(OUTPUT_PDF))
    extracted = " ".join((page.extract_text() or "") for page in reader.pages)
    flattened = re.sub(r"\s+", " ", extracted)
    book_paths = [path for path in paths if "books" in path.parts]
    titles: list[str] = []
    for path in book_paths:
        match = re.search(r"^# (.+)$", path.read_text(encoding="utf-8"), re.MULTILINE)
        if not match:
            raise RuntimeError(f"Book source has no H1 title: {path}")
        titles.append(normalize_text(match.group(1)))
    missing = [title for title in titles if title not in flattened]
    errors: list[str] = []
    if len(titles) != 24:
        errors.append(f"expected 24 books, found {len(titles)}")
    if len(reader.pages) < len(titles):
        errors.append(f"expected at least {len(titles)} pages, found {len(reader.pages)}")
    if missing:
        errors.append("missing book titles: " + ", ".join(missing))
    if "\ufffd" in extracted:
        errors.append("replacement glyphs found in extracted PDF text")
    if errors:
        raise RuntimeError("PDF verification failed: " + "; ".join(errors))
    print(f"Verified PDF: {len(reader.pages)} pages, {len(titles)} books, no replacement glyphs")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--markdown-only", action="store_true")
    args = parser.parse_args()
    paths = source_paths()
    markdown = build_combined_markdown(paths)
    if not args.markdown_only:
        build_pdf(markdown)
        verify_pdf(paths)
    print(f"Built {COMBINED_MD.relative_to(ROOT)}")
    if not args.markdown_only:
        print(f"Built {OUTPUT_PDF.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
