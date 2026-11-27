/**
 * 每页一份的 LDF（运行时导入）—— LIN 的两个 Trace 页（Windows / CWCM）共用这套
 *
 * 与 DBC 的 DbcStore 行为一致：导入的存 localStorage（hmi.ldf.v1.<page>），
 * 没导入时试默认文件；CWCM 的默认是 public/ldf/cwcm.ldf，Windows 页没有默认。
 */
import { createFileStore, type ParsedFile, type RuntimeFileStore } from './fileStore';
import { parseLdf, type LdfDatabase } from './ldf';

export type LdfPage = 'window' | 'cwcm';

function parse(text: string, fileName: string): ParsedFile<LdfDatabase> {
  const db = parseLdf(text, fileName);
  if (db.frames.length === 0) {
    return { error: `No frame found in ${fileName} — is this a LIN description file?` };
  }
  return {
    data: db,
    counts: [
      { n: db.frames.length, label: 'frames' },
      { n: db.signals.size, label: 'signals' },
    ],
    warnings: db.warnings,
    warningOverflow: db.warningOverflow,
  };
}

const stores = new Map<LdfPage, RuntimeFileStore<LdfDatabase>>();

export function getLdfStore(page: LdfPage): RuntimeFileStore<LdfDatabase> {
  let s = stores.get(page);
  if (!s) {
    s = createFileStore<LdfDatabase>({
      storageKey: `hmi.ldf.v1.${page}`,
      // Windows 页暂无默认 LDF；cwcm.ldf 是 CWCM 的默认
      defaultPath: page === 'cwcm' ? 'ldf/cwcm.ldf' : 'ldf/window.ldf',
      parse,
    });
    stores.set(page, s);
  }
  return s;
}