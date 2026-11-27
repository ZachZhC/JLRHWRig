/**
 * 每页一份的 DBC（运行时导入）
 *
 * SWM / SWS / WDCM 用的不是同一份 DBC，所以按页面各存一份：
 *   - 导入的文件存 localStorage（key: hmi.dbc.v1.<page>），刷新/重启不丢
 *   - 没导入时尝试加载随包发布在 public/dbc/<page>.dbc 的默认 DBC
 *   - 文件过大（localStorage 放不下）只在内存里用，并提示刷新后需重新导入
 *
 * 注意：这里只负责「拿到一份能用的 DBC」，解码/点亮在后续阶段接。
 */
import { parseDbc, type DbcDatabase } from './dbc';
import { createFileStore, type ParsedFile, type RuntimeFileStore } from './fileStore';

export type DbcPage = 'swm' | 'sws' | 'wdcm';

function parse(text: string, fileName: string): ParsedFile<DbcDatabase> {
  const db = parseDbc(text, fileName);
  if (db.messages.length === 0) return { error: `No message (BO_) found in ${fileName}` };
  return {
    data: db,
    counts: [
      { n: db.messages.length, label: 'msg' },
      { n: db.signalCount, label: 'sig' },
    ],
    warnings: db.warnings,
    warningOverflow: db.warningOverflow,
  };
}

const stores = new Map<DbcPage, RuntimeFileStore<DbcDatabase>>();

export function getDbcStore(page: DbcPage): RuntimeFileStore<DbcDatabase> {
  let s = stores.get(page);
  if (!s) {
    s = createFileStore<DbcDatabase>({
      storageKey: `hmi.dbc.v1.${page}`,
      defaultPath: `dbc/${page}.dbc`,
      parse,
    });
    stores.set(page, s);
  }
  return s;
}