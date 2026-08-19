# American Woodworker Archive

A static, browser-based replacement for the Flash-era navigation used by the
American Woodworker DVD archive.

This project does not distribute American Woodworker content. It contains only
the HTML, CSS, JavaScript, and Python tooling needed to build a modern local
archive from DVD files that you already own.

## What This Solves

The original American Woodworker DVD archive depends on older DVD-era
navigation and Flash-style presentation. This project builds a local static web
archive that can be opened directly in a browser.

After generation, the archive provides:

- Chronological issue browsing for the 1985-2010 archive.
- Cover-based issue cards.
- A page reader using the original magazine page images.
- Direct issue/page links such as `reader.html?issue=1999_04&page=27`.
- Table-of-contents navigation for each issue.
- Thumbnail navigation for each issue.
- Full archive search using the OCR text in each issue's `DocumentText.xml`.
- Ctrl+P printing of only the currently displayed magazine page.
- Print Article support based on the issue table of contents.
- Direct `file://` operation in Chrome; no server is required.

## What Is Not Included

This repository must not contain and does not intentionally include:

- Magazine page images.
- Covers.
- PDFs.
- SWF files.
- EXE files.
- Original DVD directories.
- Generated full-text OCR/search data.
- Any other American Woodworker magazine content.

The generated `assets/js/archive-data.js` and `assets/js/search-data.js` files
are created locally from your own DVD files and are ignored by Git.

## Requirements

- Python 3.10 or newer.
- A modern browser such as Chrome.
- The original American Woodworker DVD content extracted to disk.

No Python packages are required; the generator uses only the Python standard
library.

## Expected Directory Layout

The default layout puts this repository beside the two original DVD extraction
folders:

```text
some-folder/
  american-woodworker-archive/
    index.html
    reader.html
    assets/
    tools/
  American Woodworker 1/
    disc1/
      issues/
      images/
  American Woodworker 2/
    disc2/
      issues/
      images/
```

The source folder names must be exactly:

```text
American Woodworker 1
American Woodworker 2
```

Each must contain the corresponding `disc1` or `disc2` directory from the
original DVDs.

## Build The Archive

From the repository directory:

```bash
python3 tools/build_archive.py
```

If your DVD source folders are somewhere else, pass the directory that contains
`American Woodworker 1` and `American Woodworker 2`:

```bash
python3 tools/build_archive.py --source-root "/path/to/DVD Content"
```

For slow NAS or external-drive storage, the generator can process multiple
issues concurrently:

```bash
python3 tools/build_archive.py --source-root "/path/to/DVD Content" --jobs 8
```

The default is up to 4 jobs. Use `--jobs 1` for single-threaded processing if
you want the simplest possible disk access pattern.

To run a quick validation against one issue without scanning the full archive
tree:

```bash
python3 tools/build_archive.py --source-root "/path/to/DVD Content" --issue 1985_01
```

The generator writes:

```text
assets/js/archive-data.js
assets/js/search-data.js
```

Those generated files are intentionally local-only. They include references to
your own DVD files and OCR/search text derived from your own DVD files.

## Open The Archive

After running the generator, open `index.html` directly in Chrome.

On Linux/macOS this looks like:

```text
file:///path/to/american-woodworker-archive/index.html
```

On Windows this looks like:

```text
file:///C:/path/to/american-woodworker-archive/index.html
```

No web server is required. The generated data files are plain JavaScript files
loaded by the static pages, which keeps the archive compatible with direct
`file://` browsing.

## Build-Time XML Repairs

The original DVD XML contains a small amount of malformed XML. The generator
repairs this only in memory while reading the files. It never writes corrected
XML back to the DVD source folders.

The current repairs are:

- Read XML with UTF-8 BOM handling.
- Replace the malformed comment sequence `<!--<!---->-->` with `<!---->`.
- Escape unescaped ampersands that are not already valid XML entities.

If the original XML parses successfully, no repair is applied.

## Source Files Are Read-Only

The generator reads from:

```text
American Woodworker 1/disc1/issues
American Woodworker 2/disc2/issues
American Woodworker 1/disc1/images/sub/covers
American Woodworker 2/disc2/images/sub/covers
```

It does not copy page images or covers into this repository. The generated
archive data points back to the original files using relative paths. The source
DVD folders are never modified.

## Validation Performed By The Generator

The generator checks:

- 157 issues are emitted by default.
- Issue IDs are unique.
- Page models are contiguous.
- Cover paths resolve.
- Page image paths resolve.
- Thumbnail paths resolve.
- Table-of-contents page targets are valid.
- Search records reference valid issue/page combinations.

If validation fails, the script exits with an error instead of writing a
silently broken archive.

## Repository Hygiene

`.gitignore` excludes generated data, source DVD folders, DVD-owned assets, XML
content, PDFs, images, SWF files, EXE files, videos, and archive images. This is
intentional: users should generate their own local data from the DVDs they own.

Before publishing changes, a useful local check is:

```bash
find . -type f | sort
find . -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.pdf' -o -iname '*.swf' -o -iname '*.exe' -o -iname '*.xml' \)
```

The second command should print nothing for the committed repository.
