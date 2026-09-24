"""Offline regression for the independently authored office plugin preflights."""
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent
FORMATS = {
    "docx": ("documents", "word/document.xml", "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "document"),
    "pptx": ("presentations", "ppt/presentation.xml", "http://schemas.openxmlformats.org/presentationml/2006/main", "presentation"),
    "xlsx": ("spreadsheets", "xl/workbook.xml", "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "workbook"),
}


def load(plugin, skill):
    script = ROOT / "apps/cli/packages" / (plugin + "-plugin") / "skills" / skill / "scripts/inspect.py"
    spec = importlib.util.spec_from_file_location("knorvia_" + skill, script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class OfficeInspectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="knorvia-office-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def package(self, extension, extras=None, main=None):
        _, part, namespace, tag = FORMATS[extension]
        path = self.root / ("sample." + extension)
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
            archive.writestr("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')
            archive.writestr(part, main or f'<{tag} xmlns="{namespace}"/>')
            for name, value in (extras or {}).items():
                archive.writestr(name, value)
        return path

    def test_supported_containers_and_input_preservation(self):
        for extension, (plugin, _, _, _) in FORMATS.items():
            with self.subTest(extension=extension):
                path = self.package(extension)
                before = path.read_bytes()
                result = load(plugin, extension).inspect(path)
                self.assertTrue(result["ok"])
                self.assertEqual(result["visualVerification"], "not-performed")
                self.assertEqual(before, path.read_bytes())

    def test_text_and_features(self):
        namespace = FORMATS["docx"][2]
        path = self.package("docx", main=f'<document xmlns="{namespace}"><body><p><r><t>你好 Knorvia</t></r></p><tbl/><ins/><del/></body></document>')
        result = load("documents", "docx").inspect(path)
        self.assertIn("你好 Knorvia", result["text"])
        self.assertEqual(result["tables"], 1)
        self.assertEqual(result["revisions"], 2)

    def test_formula_errors_and_missing_cache_are_visible(self):
        ns = FORMATS["xlsx"][2]
        sheet = f'<worksheet xmlns="{ns}"><sheetData><row><c r="A1"><f>1+1</f></c><c r="B1" t="e"><v>#REF!</v></c></row></sheetData></worksheet>'
        path = self.package("xlsx", {"xl/worksheets/sheet1.xml": sheet})
        result = load("spreadsheets", "xlsx").inspect(path)
        sheet_result = result["sheetsByPart"][0]
        self.assertEqual(sheet_result["formulaCachesMissing"], 1)
        self.assertEqual(sheet_result["storedErrorCells"], ["B1"])
        self.assertEqual(result["formulaEvaluation"], "not-performed")

    def test_external_relationships_are_counted_without_fetch(self):
        rels = '<Relationships><Relationship TargetMode="External" Target="https://example.invalid/never-fetch"/></Relationships>'
        path = self.package("pptx", {"ppt/_rels/extra.rels": rels})
        self.assertEqual(load("presentations", "pptx").inspect(path)["externalRelationships"], 1)

    def test_dangerous_xml_and_package_paths_are_rejected(self):
        for extension, (plugin, _, _, _) in FORMATS.items():
            inspector = load(plugin, extension)
            for payload in [b'<!DOCTYPE x><x/>', '<!DOCTYPE x><x/>'.encode("utf-16"), b'<!ENTITY x "test"><x/>']:
                with self.subTest(extension=extension, payload=payload):
                    path = self.package(extension, {"extra.xml": payload})
                    with self.assertRaisesRegex(ValueError, "declarations"):
                        inspector.inspect(path)
            path = self.package(extension, {"../escape.txt": "unused"})
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                inspector.inspect(path)

    def test_corrupt_and_wrong_format_inputs_fail(self):
        for extension, (plugin, _, _, _) in FORMATS.items():
            inspector = load(plugin, extension)
            path = self.root / ("bad." + extension)
            path.write_bytes(b"not a zip")
            with self.assertRaises(zipfile.BadZipFile):
                inspector.inspect(path)
            path = self.package(extension)
            wrong = path.with_suffix(".txt")
            wrong.write_bytes(path.read_bytes())
            with self.assertRaisesRegex(ValueError, "extension"):
                inspector.inspect(wrong)

    def test_expanded_size_guard(self):
        inspector = load("documents", "docx")
        path = self.package("docx", {"large.txt": "x" * 1024})
        with patch.object(inspector, "MAX_PART", 512):
            with self.assertRaisesRegex(ValueError, "part exceeds"):
                inspector.inspect(path)

    def test_pdf_uses_local_tool_with_literal_path_and_visible_failures(self):
        inspector = load("pdf", "pdf")
        path = self.root / "name with spaces & symbols.pdf"
        path.write_bytes(b"%PDF-1.7\n")
        with patch.object(inspector.shutil, "which", return_value=None):
            with self.assertRaisesRegex(ValueError, "unavailable"):
                inspector.inspect(path)
        response = SimpleNamespace(returncode=0, stdout="Pages: 2\nEncrypted: no\n")
        with patch.object(inspector.shutil, "which", return_value="local-pdfinfo"), patch.object(inspector.subprocess, "run", return_value=response) as run:
            result = inspector.inspect(path)
            self.assertEqual(result["metadata"]["Pages"], "2")
            self.assertEqual(run.call_args.args[0], ["local-pdfinfo", str(path.resolve())])
            self.assertNotIn("shell", run.call_args.kwargs)
        response.returncode = 1
        with patch.object(inspector.shutil, "which", return_value="local-pdfinfo"), patch.object(inspector.subprocess, "run", return_value=response):
            with self.assertRaisesRegex(ValueError, "encrypted or damaged"):
                inspector.inspect(path)


if __name__ == "__main__":
    unittest.main()
