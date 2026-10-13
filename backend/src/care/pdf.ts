/**
 * Minimal single-page PDF writer (Helvetica, text lines only). Enough for invoices and
 * billing statements without a dependency.
 */

export interface PdfLine {
    text: string;
    size?: number;
    bold?: boolean;
    /** Extra space before this line, in points. */
    gap?: number;
    /** Right-aligned second column. */
    right?: string;
}

const esc = (s: string): string => s.replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\x7e]/g, '?');

export function renderPdf(lines: PdfLine[]): Buffer {
    const ops: string[] = [];
    let y = 800;
    for (const line of lines) {
        const size = line.size ?? 11;
        y -= (line.gap ?? 0) + size + 6;
        const font = line.bold ? 'F2' : 'F1';
        ops.push(`BT /${font} ${size} Tf 56 ${y} Td (${esc(line.text)}) Tj ET`);
        if (line.right !== undefined) {
            // Helvetica averages ~0.5em per character; good enough to right-align short amounts
            const x = 540 - esc(line.right).length * size * 0.5;
            ops.push(`BT /${font} ${size} Tf ${x.toFixed(1)} ${y} Td (${esc(line.right)}) Tj ET`);
        }
    }
    const content = ops.join('\n');
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
        `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    ];
    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((body, i) => {
        offsets.push(Buffer.byteLength(out, 'latin1'));
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}
