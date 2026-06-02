# n8n-nodes-filetopdf

This is an [n8n](https://n8n.io) community node. It lets you use [FileToPDF](https://filetopdf.dev) in your n8n workflows.

**FileToPDF** turns almost anything into a polished PDF, automatically. It converts
Word, Excel, PowerPoint, images and 130+ file formats; renders pixel-perfect HTML/CSS;
and styles Markdown — so you can automate invoices, reports, contracts and receipts end
to end. Fast, GDPR-compliant EU processing with zero data retention.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) · [Usage](#usage) · [Resources](#resources)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n docs.

In n8n, go to **Settings → Community Nodes**, select **Install**, and enter `n8n-nodes-filetopdf`.

## Operations

The **FileToPDF** node provides one node with four operations:

- **Convert a File** — Turn Word, Excel, PowerPoint, images and 130+ file formats into PDF, from
  an uploaded binary (mapped from a previous node) **or** a public URL.
- **Convert HTML** — Render HTML + CSS into a pixel-perfect PDF, with control over page size,
  margins and orientation.
- **Convert Markdown** — Convert Markdown into a clean, styled PDF — tables, code blocks and
  images included.
- **Custom API Call** — Call any FileToPDF endpoint directly for advanced or custom workflows.

Every conversion operation outputs the resulting PDF as **binary data** on the item (ready to
chain into Google Drive, Dropbox, OneDrive, or an Email node), plus JSON metadata
(`pages`, `fileSize`, `creditsRemaining`).

## Credentials

You need a FileToPDF API key. The fastest way is to grab a free key in one click on the
[filetopdf.dev](https://filetopdf.dev) home page — no account required, and it includes 10 free
conversions — or create one in your dashboard. Add a **FileToPDF API** credential in n8n with that
key. The key is sent as the `x-api-key` header and validated against the zero-cost `GET /account`
endpoint, which reports your plan and remaining credits.

## Usage

- **CSS applies to text mode only.** The optional CSS field is available on *Convert HTML* and
  *Convert Markdown*. To convert an existing `.html` or `.md` file (or a link to one), use
  *Convert a File* instead — its URL mode downloads and converts the file by its extension; it
  does not render a live web page.
- **File extensions matter.** In *Convert a File* (binary mode), the input binary's file name
  extension selects the converter and names the output PDF. Make sure upstream nodes pass a
  sensible file name.
- **Advanced options** (page size, margins, orientation, scale, page ranges, PDF/A archival,
  PDF/UA accessibility, and password protection) are available per operation under *Options*.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [FileToPDF API documentation](https://filetopdf.dev)

## License

[MIT](LICENSE.md)
