# -*- coding: utf-8 -*-
"""单文件转 Markdown，供上传接口调用。

用法: python convert_file.py <输入文件> <输出.md>
支持: .docx .doc .xmind .drawio .xls .md .txt
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_knowledge import (  # noqa: E402
    docx_to_md,
    convert_doc_with_word,
    xmind_to_md,
    drawio_to_md,
    xls_to_md,
)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: convert_file.py <input> <output.md>", file=sys.stderr)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    ext = os.path.splitext(src)[1].lower()

    if ext == ".docx":
        body = docx_to_md(src)
    elif ext == ".doc":
        with tempfile.TemporaryDirectory() as t:
            body = convert_doc_with_word(src, t)
    elif ext == ".xmind":
        body = xmind_to_md(src)
    elif ext == ".drawio":
        body = drawio_to_md(src)
    elif ext == ".xls":
        body = xls_to_md(src)
    elif ext in (".md", ".txt"):
        body = open(src, encoding="utf-8", errors="replace").read()
    else:
        print(f"unsupported format: {ext}", file=sys.stderr)
        return 3

    if not body.strip():
        print("file content is empty", file=sys.stderr)
        return 4

    with open(dst, "w", encoding="utf-8") as f:
        f.write(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
