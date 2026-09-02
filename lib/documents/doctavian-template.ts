import { deflateRawSync, crc32 } from "node:zlib";

/**
 * The Emergency Supplier Transition Agreement, as a Doctavian template.
 *
 * Two reasons this is generated in code rather than checked in as a .docx:
 *
 * 1. Doctavian's demo storage treats an uploaded template as SINGLE-USE. The first
 *    generate consumes it; a second against the same URN answers
 *    FILE_MISSING_FROM_STORAGE. So the template is uploaded fresh on every
 *    generation, and the bytes have to come from somewhere the server can reach —
 *    memory is simpler and more reliable than a file on a serverless filesystem.
 *
 * 2. It cannot drift. The placeholders below and the Zod `ContractPayload` are
 *    edited in the same repo; a renamed field breaks the type check rather than
 *    silently rendering an empty clause.
 *
 * Element syntax is Doctavian's own, taken from their `mission-1-agreement.docx`:
 * `{!Agreement.field}` for a value, `{!$fn(...)}` for an expression, and
 * `<mdoc:repeater>` / `<mdoc:paragraph>` written as literal text. Verified against
 * the live API — values, currency formatting, both repeaters and the conditional
 * clause all render.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function p(text: string, opts: { bold?: boolean; size?: string } = {}): string {
  const rPr = [opts.bold ? "<w:b/>" : "", opts.size ? `<w:sz w:val="${opts.size}"/>` : ""].join("");
  return (
    `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>` +
    `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}` +
    `<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`
  );
}

function body(): string {
  return [
    p("EMERGENCY SUPPLIER TRANSITION AGREEMENT", { bold: true, size: "36" }),
    p("Agreement {!Agreement.agreementId} · generated {!Agreement.effectiveDate}"),

    p("PARTIES", { bold: true, size: "26" }),
    p("This Agreement is made between {!Agreement.buyer} (the “Buyer”) and {!Agreement.supplier} (the “Supplier”), effective {!Agreement.effectiveDate}."),
    p("It is entered into in response to a disruption affecting the {!Agreement.product}, and authorises an emergency transition of supply for that component."),

    p("ARTICLE 1 — GOODS AND PRICING", { bold: true, size: "26" }),
    p("The Supplier shall deliver {!Agreement.quantity} units of the {!Agreement.product} at a unit price of ${!$format(toDecimal(Agreement.unitPrice), 'number', '#,###.00')}."),
    p("TOTAL CONTRACT VALUE: ${!$format(toDecimal(Agreement.totalValue), 'number', '#,###.00')}", { bold: true }),

    p("ARTICLE 2 — DELIVERY AND SERVICE LEVEL", { bold: true, size: "26" }),
    p("Delivery shall be completed within {!Agreement.deliveryDeadlineDays} days of execution."),
    p("Service level: {!Agreement.sla}"),
    p("Contingency: {!Agreement.contingency}"),

    p("ARTICLE 3 — COMPLIANCE REQUIREMENTS", { bold: true, size: "26" }),
    p("The Supplier warrants conformance with each of the following:"),
    p('<mdoc:repeater name="compliance" value="{!Agreement.compliance}" variable="c" mode="standard">'),
    p("• {!#c#}"),
    p('</mdoc:repeater name="compliance">'),

    p("ARTICLE 4 — EVIDENCE POSITION AT EXECUTION", { bold: true, size: "26" }),
    p("This Agreement was prepared from an automated evidence review. At the moment of generation, {!Agreement.evidenceSummary.verified} supplier claims were independently verified and {!Agreement.evidenceSummary.conflicts} unresolved evidence conflict(s) were recorded, at an overall recommendation confidence of {!Agreement.evidenceSummary.confidence}%."),

    // Appears only when the recommendation carried an unresolved conflict.
    p('<mdoc:paragraph name="conflictNotice" hidden="{!$toDecimal(Agreement.evidenceSummary.conflicts) < 1}">'),
    p("NOTICE: One or more supplier claims relevant to this transition could not be verified against independent records. The Buyer executes this Agreement with that position disclosed on its face.", { bold: true }),
    p('</mdoc:paragraph name="conflictNotice">'),

    p("ARTICLE 5 — RISK CONDITIONS", { bold: true, size: "26" }),
    p("The following risks were identified during review and are acknowledged by both parties:"),
    p('<mdoc:repeater name="risks" value="{!Agreement.riskConditions}" variable="r" mode="standard">'),
    p("• {!#r#}"),
    p('</mdoc:repeater name="risks">'),

    p("ARTICLE 6 — AUTHORISATION", { bold: true, size: "26" }),
    p("This Agreement was prepared by an automated system. It is not binding until signed by an authorised representative of the Buyer. No automated process may execute it."),

    p(""),
    p("Signed for and on behalf of {!Agreement.buyer}:"),
    p(""),
    p("_______________________________          _______________________________"),
    p("Authorised signatory                                    Date"),
  ].join("");
}

const DOCUMENT_XML = () =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:body>${body()}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>` +
  `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>` +
  `</w:body></w:document>`;

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const DOC_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

/** Minimal ZIP writer — a .docx is a zip, and this avoids a dependency. */
function zip(files: Array<[string, string]>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of files) {
    const data = Buffer.from(content, "utf8");
    const compressed = deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const sum = crc32(data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, compressed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(0, 12);
    dir.writeUInt32LE(sum, 16);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

export const AGREEMENT_TEMPLATE_FILENAME = "emergency-supplier-transition-agreement.docx";

export function buildAgreementTemplateDocx(): Buffer {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", RELS],
    ["word/document.xml", DOCUMENT_XML()],
    ["word/_rels/document.xml.rels", DOC_RELS],
  ]);
}
