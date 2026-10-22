import { IMPORT_LIMITS, ImportError, parseCsv, toTable, type Table } from './flow-import';
import { readXlsxRows } from './flow-xlsx';

/** Reads an uploaded test-case file. Only .csv and .xlsx are accepted; the content is read as data and never run. */
export function parseUpload(fileName: string, bytes: Buffer): Table {
  if (bytes.length === 0) throw new ImportError('The file is empty.');
  if (bytes.length > IMPORT_LIMITS.maxBytes) throw new ImportError(`The file is larger than ${String(IMPORT_LIMITS.maxBytes / 1024 / 1024)} MB.`);
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (ext === 'csv') {
    if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) throw new ImportError('This file is a zip archive, not a CSV. Upload a .xlsx instead.');
    return toTable(parseCsv(bytes.toString('utf8')));
  }
  if (ext === 'xlsx') return toTable(readXlsxRows(bytes));
  if (ext === 'xlsm' || ext === 'xlsb' || ext === 'xls') throw new ImportError('Macro-enabled and old Excel formats are not accepted. Save a copy as .xlsx or .csv.');
  throw new ImportError('Upload a .csv or .xlsx file.');
}
