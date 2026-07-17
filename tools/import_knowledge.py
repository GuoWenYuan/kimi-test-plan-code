# -*- coding: utf-8 -*-
"""将桌面「工作内容」目录中的非图片文件转换为 Markdown，导入知识库 data/knowledge/工作内容/。

支持：.docx/.doc（经 Word COM 转 docx）、.xmind、.drawio、.xls、.md
跳过：图片（png 等）、drawio 备份/临时文件（.bkp/.dtmp）、Office 锁文件（~$ 前缀）
"""
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET

SRC = r"C:\Users\guowenyuan\Desktop\工作内容"
DST = os.path.join("data", "knowledge", "工作内容")

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp"}
SKIP_EXT = {".bkp", ".dtmp"}


def md_escape(s: str) -> str:
    return s.replace("|", "\\|").strip()


def docx_to_md(path: str) -> str:
    import docx

    d = docx.Document(path)
    lines = []
    for block in d.element.body:
        tag = block.tag.rsplit("}", 1)[-1]
        if tag == "p":
            from docx.text.paragraph import Paragraph

            p = Paragraph(block, d)
            text = p.text.strip()
            if not text:
                continue
            style = (p.style.name or "") if p.style else ""
            m = re.match(r"Heading (\d)", style)
            if m:
                lines.append("#" * min(int(m.group(1)) + 1, 6) + " " + text)
            else:
                lines.append(text)
        elif tag == "tbl":
            from docx.table import Table

            t = Table(block, d)
            rows = [[md_escape(c.text) for c in r.cells] for r in t.rows]
            if not rows:
                continue
            lines.append("| " + " | ".join(rows[0]) + " |")
            lines.append("|" + "|".join(["---"] * len(rows[0])) + "|")
            for r in rows[1:]:
                lines.append("| " + " | ".join(r) + " |")
        lines.append("")
    return "\n".join(lines)


def convert_doc_with_word(src: str, tmpdir: str) -> str:
    """用 Word COM 把 .doc 另存为 .docx，再走 docx_to_md"""
    import win32com.client

    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    try:
        doc = word.Documents.Open(src, ReadOnly=True, ConfirmConversions=False)
        out = os.path.join(tmpdir, "converted.docx")
        doc.SaveAs2(out, FileFormat=12)  # wdFormatXMLDocument
        doc.Close(False)
    finally:
        word.Quit()
    return docx_to_md(out)


def xmind_topic_to_md(node: dict, depth: int, lines: list) -> None:
    title = node.get("title", "").strip()
    if title:
        lines.append("  " * depth + "- " + title)
    for child in node.get("children", {}).get("attached", []):
        xmind_topic_to_md(child, depth + 1, lines)


def xmind_to_md(path: str) -> str:
    lines = []
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        if "content.json" in names:
            sheets = json.loads(z.read("content.json").decode("utf-8"))
            for sheet in sheets:
                root = sheet.get("rootTopic", {})
                lines.append(f"## {root.get('title', '未命名')}")
                xmind_topic_to_md(root, 0, lines)
                lines.append("")
        elif "content.xml" in names:
            ns = {"x": "urn:xmind:xmap:xmlns:content:2.0"}
            root = ET.fromstring(z.read("content.xml"))
            for topic in root.iter("{urn:xmind:xmap:xmlns:content:2.0}topic"):
                title = topic.find("x:title", ns)
                if title is not None and title.text:
                    lines.append("- " + title.text.strip())
    return "\n".join(lines)


def drawio_to_md(path: str) -> str:
    """提取 drawio 图中所有文本标签"""
    text = open(path, encoding="utf-8", errors="replace").read()
    texts = []
    try:
        root = ET.fromstring(text)
        for cell in root.iter("mxCell"):
            v = cell.get("value", "").strip()
            if v:
                v = re.sub(r"<[^>]+>", " ", v)
                v = re.sub(r"\s+", " ", v).strip()
                if v and v not in texts:
                    texts.append(v)
    except ET.ParseError:
        pass
    if not texts:
        return ""
    lines = ["## 图中包含的文本节点", ""]
    lines += ["- " + t for t in texts]
    return "\n".join(lines)


def xls_to_md(path: str) -> str:
    import xlrd

    wb = xlrd.open_workbook(path)
    lines = []
    for sheet in wb.sheets():
        lines.append(f"## {sheet.name}")
        rows = []
        for r in range(sheet.nrows):
            rows.append([md_escape(str(sheet.cell_value(r, c))) for c in range(sheet.ncols)])
        if not rows:
            continue
        lines.append("| " + " | ".join(rows[0]) + " |")
        lines.append("|" + "|".join(["---"] * len(rows[0])) + "|")
        for r in rows[1:]:
            lines.append("| " + " | ".join(r) + " |")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    os.makedirs(DST, exist_ok=True)
    files = sorted(os.listdir(SRC))
    ok, empty, failed = [], [], []

    with tempfile.TemporaryDirectory() as tmpdir:
        for fname in files:
            src = os.path.join(SRC, fname)
            if not os.path.isfile(src):
                continue
            if fname.startswith(("~$", ".$")):
                continue
            name, ext = os.path.splitext(fname)
            ext = ext.lower()
            if ext in IMAGE_EXT or ext in SKIP_EXT:
                continue

            try:
                if ext == ".docx":
                    body = docx_to_md(src)
                elif ext == ".doc":
                    body = convert_doc_with_word(src, tmpdir)
                elif ext == ".xmind":
                    body = xmind_to_md(src)
                elif ext == ".drawio":
                    body = drawio_to_md(src)
                elif ext == ".xls":
                    body = xls_to_md(src)
                elif ext == ".md":
                    body = open(src, encoding="utf-8", errors="replace").read()
                else:
                    continue

                if not body.strip():
                    empty.append(fname)
                    continue

                header = f"# {name}\n\n> 来源：工作内容/{fname}\n\n---\n\n"
                out = os.path.join(DST, f"{name}.md")
                with open(out, "w", encoding="utf-8") as f:
                    f.write(header + body)
                ok.append(fname)
            except Exception as e:  # noqa: BLE001
                failed.append((fname, str(e)[:100]))

    print(f"converted: {len(ok)}")
    for f in ok:
        print("  +", f)
    if empty:
        print(f"empty (skipped): {len(empty)}")
        for f in empty:
            print("  -", f)
    if failed:
        print(f"failed: {len(failed)}")
        for f, e in failed:
            print("  !", f, "->", e)


if __name__ == "__main__":
    sys.exit(main())
