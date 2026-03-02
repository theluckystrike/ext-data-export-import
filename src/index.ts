export type ExportFormat = 'json' | 'csv' | 'xml' | 'yaml' | 'tsv' | 'html' | 'sql';
export type ImportFormat = 'json' | 'csv' | 'xml' | 'yaml' | 'tsv' | 'html';
export type CompressionType = 'gzip' | 'zip' | 'none';

export interface ExportOptions {
  format: ExportFormat;
  compression?: CompressionType;
  filename?: string;
  includeMetadata?: boolean;
  prettyPrint?: boolean;
  encoding?: string;
  delimiter?: string;
  headers?: boolean;
  dateFormat?: string;
  nullValue?: string;
}

export interface ImportOptions {
  format: ImportFormat;
  delimiter?: string;
  hasHeaders?: boolean;
  skipEmptyLines?: boolean;
  transform?: (row: Record<string, unknown>, index: number) => Record<string, unknown>;
  validate?: (row: Record<string, unknown>) => boolean;
  batchSize?: number;
  encoding?: string;
}

export interface ExportResult {
  success: boolean;
  data?: string | Blob;
  filename?: string;
  size?: number;
  mimeType?: string;
  error?: string;
  metadata?: ExportMetadata;
}

export interface ImportResult {
  success: boolean;
  data?: unknown[];
  rowCount?: number;
  errors?: ImportError[];
  warnings?: string[];
  metadata?: ImportMetadata;
}

export interface ExportMetadata {
  exportDate: string;
  format: ExportFormat;
  recordCount: number;
  columns?: string[];
  source?: string;
  version?: string;
}

export interface ImportMetadata {
  importDate: string;
  format: ImportFormat;
  recordCount: number;
  columns?: string[];
  skippedRows?: number;
  duration?: number;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  value?: unknown;
}

export interface DataSchema {
  fields: SchemaField[];
  primaryKey?: string[];
  indexes?: string[][];
  constraints?: DataConstraints;
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  required?: boolean;
  default?: unknown;
  pattern?: string;
  min?: number;
  max?: number;
  enum?: unknown[];
  transform?: (value: unknown) => unknown;
}

export interface DataConstraints {
  unique?: string[];
  foreignKeys?: ForeignKey[];
  custom?: (data: Record<string, unknown>[]) => ValidationResult;
}

export interface ForeignKey {
  field: string;
  references: { table: string; field: string };
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
  value?: unknown;
}

export interface StorageBackup {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  size: number;
  checksum: string;
  format: ExportFormat;
  data: string;
}

const DEFAULT_EXPORT_OPTIONS: Partial<ExportOptions> = {
  compression: 'none',
  includeMetadata: true,
  prettyPrint: true,
  encoding: 'utf-8',
  delimiter: ',',
  headers: true,
  dateFormat: 'ISO8601',
  nullValue: '',
};

const DEFAULT_IMPORT_OPTIONS: Partial<ImportOptions> = {
  delimiter: ',',
  hasHeaders: true,
  skipEmptyLines: true,
  batchSize: 1000,
  encoding: 'utf-8',
};

export class DataExporter {
  private options: ExportOptions;

  constructor(options: ExportOptions) {
    this.options = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  }

  async export(data: unknown[], source?: string): Promise<ExportResult> {
    try {
      if (!Array.isArray(data)) {
        throw new Error('Data must be an array');
      }

      let exportedData: string;
      const metadata: ExportMetadata = {
        exportDate: new Date().toISOString(),
        format: this.options.format,
        recordCount: data.length,
        source,
        version: '1.0.0',
      };

      switch (this.options.format) {
        case 'json':
          exportedData = this.exportToJSON(data);
          break;
        case 'csv':
          exportedData = this.exportToCSV(data);
          metadata.columns = this.getColumns(data);
          break;
        case 'tsv':
          exportedData = this.exportToTSV(data);
          break;
        case 'xml':
          exportedData = this.exportToXML(data);
          break;
        case 'yaml':
          exportedData = this.exportToYAML(data);
          break;
        case 'html':
          exportedData = this.exportToHTML(data);
          break;
        case 'sql':
          exportedData = this.exportToSQL(data);
          break;
        default:
          throw new Error(`Unsupported format: ${this.options.format}`);
      }

      let finalData: string | Blob = exportedData;
      let mimeType = this.getMimeType();

      if (this.options.compression === 'gzip') {
        finalData = await this.compressGzip(exportedData);
        mimeType = 'application/gzip';
      } else if (this.options.compression === 'zip') {
        const result = await this.compressZip(exportedData, this.options.filename || 'data');
        finalData = result.blob;
        mimeType = 'application/zip';
      }

      return {
        success: true,
        data: finalData,
        filename: this.generateFilename(),
        size: typeof finalData === 'string' ? new Blob([finalData]).size : finalData.size,
        mimeType,
        metadata: this.options.includeMetadata ? metadata : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private exportToJSON(data: unknown[]): string {
    const processed = this.processData(data);
    if (this.options.prettyPrint) {
      return JSON.stringify({ data: processed, metadata: this.getMetadata(processed) }, null, 2);
    }
    return JSON.stringify({ data: processed, metadata: this.getMetadata(processed) });
  }

  private exportToCSV(data: unknown[]): string {
    if (data.length === 0) return '';

    const processed = this.processData(data);
    const columns = this.options.headers !== false ? this.getColumns(processed) : [];
    const rows: string[] = [];

    if (this.options.headers !== false) {
      rows.push(columns.map(c => this.escapeCSVField(c)).join(this.options.delimiter));
    }

    for (const item of processed) {
      const row = columns.map(col => {
        const value = this.getNestedValue(item, col);
        return this.escapeCSVField(this.formatValue(value));
      });
      rows.push(row.join(this.options.delimiter));
    }

    return rows.join('\n');
  }

  private exportToTSV(data: unknown[]): string {
    const originalDelimiter = this.options.delimiter;
    this.options.delimiter = '\t';
    const result = this.exportToCSV(data);
    this.options.delimiter = originalDelimiter;
    return result;
  }

  private exportToXML(data: unknown[]): string {
    const processed = this.processData(data);
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<root>'];

    for (const item of processed) {
      lines.push('  <record>');
      for (const [key, value] of Object.entries(item)) {
        const formatted = this.formatValue(value);
        const escaped = this.escapeXML(String(formatted));
        lines.push(`    <${key}>${escaped}</${key}>`);
      }
      lines.push('  </record>');
    }

    lines.push('</root>');
    return lines.join('\n');
  }

  private exportToYAML(data: unknown[]): string {
    const processed = this.processData(data);
    return this.objectToYAML({ records: processed, metadata: this.getMetadata(processed) }, 0);
  }

  private exportToHTML(data: unknown[]): string {
    const processed = this.processData(data);
    const columns = this.getColumns(processed);
    
    const styles = `
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
        tr:nth-child(even) { background-color: #f2f2f2; }
        tr:hover { background-color: #ddd; }
        .metadata { background: #f9f9f9; padding: 10px; margin-bottom: 20px; border-radius: 4px; }
      </style>
    `;

    const rows = processed.map(item => {
      return '<tr>' + columns.map(col => {
        const value = this.getNestedValue(item, col);
        return `<td>${this.escapeHTML(String(this.formatValue(value)))}</td>`;
      }).join('') + '</tr>';
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>${styles}</head>
<body>
  <div class="metadata">
    <strong>Exported:</strong> ${new Date().toISOString()}<br>
    <strong>Records:</strong> ${processed.length}<br>
    <strong>Columns:</strong> ${columns.join(', ')}
  </div>
  <table>
    <thead>
      <tr>${columns.map(c => `<th>${this.escapeHTML(c)}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
  }

  private exportToSQL(data: unknown[]): string {
    const processed = this.processData(data);
    const tableName = this.options.filename?.replace(/[^a-zA-Z0-9_]/g, '_') || 'exported_data';
    const columns = this.getColumns(processed);
    const lines: string[] = [];

    lines.push(`CREATE TABLE IF NOT EXISTS ${tableName} (`);
    lines.push(columns.map(col => `  ${col} TEXT`).join(',\n'));
    lines.push(');');
    lines.push('');

    for (const item of processed) {
      const values = columns.map(col => {
        const value = this.getNestedValue(item, col);
        return this.escapeSQL(this.formatValue(value));
      });
      lines.push(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`);
    }

    return lines.join('\n');
  }

  private processData(data: unknown[]): Record<string, unknown>[] {
    return data.map(item => {
      if (typeof item !== 'object' || item === null) {
        return { value: item };
      }
      return this.flattenObject(item as Record<string, unknown>);
    });
  }

  private flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value as Record<string, unknown>, newKey));
      } else if (Array.isArray(value)) {
        result[newKey] = JSON.stringify(value);
      } else {
        result[newKey] = value;
      }
    }
    
    return result;
  }

  private getColumns(data: Record<string, unknown>[]): string[] {
    if (data.length === 0) return [];
    const columnSet = new Set<string>();
    for (const item of data) {
      for (const key of Object.keys(item)) {
        columnSet.add(key);
      }
    }
    return Array.from(columnSet);
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((acc: unknown, key) => 
      acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined, obj);
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return this.options.nullValue || '';
    }
    if (value instanceof Date) {
      return this.formatDate(value);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private formatDate(date: Date): string {
    switch (this.options.dateFormat) {
      case 'ISO8601':
        return date.toISOString();
      case 'US':
        return date.toLocaleDateString('en-US');
      case 'EU':
        return date.toLocaleDateString('en-GB');
      default:
        return date.toISOString();
    }
  }

  private escapeCSVField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private escapeXML(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private escapeHTML(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapeSQL(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private objectToYAML(obj: unknown, indent: number): string {
    const spaces = '  '.repeat(indent);
    
    if (obj === null || obj === undefined) {
      return 'null';
    }
    if (typeof obj === 'boolean' || typeof obj === 'number') {
      return String(obj);
    }
    if (typeof obj === 'string') {
      if (obj.includes('\n') || obj.includes(':') || obj.includes('#')) {
        return `|\n${obj.split('\n').map(line => spaces + '  ' + line).join('\n')}`;
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return obj.map(item => `${spaces}- ${this.objectToYAML(item, indent + 1)}`).join('\n');
    }
    if (typeof obj === 'object') {
      const entries = Object.entries(obj as Record<string, unknown>);
      if (entries.length === 0) return '{}';
      return entries.map(([key, value]) => 
        `${spaces}${key}: ${this.objectToYAML(value, indent + 1)}`
      ).join('\n');
    }
    return String(obj);
  }

  private getMetadata(data: Record<string, unknown>[]): Record<string, unknown> {
    return {
      exportDate: new Date().toISOString(),
      recordCount: data.length,
      columns: this.getColumns(data),
    };
  }

  private getMimeType(): string {
    const mimeTypes: Record<ExportFormat, string> = {
      json: 'application/json',
      csv: 'text/csv',
      tsv: 'text/tab-separated-values',
      xml: 'application/xml',
      yaml: 'application/x-yaml',
      html: 'text/html',
      sql: 'application/sql',
    };
    return mimeTypes[this.options.format];
  }

  private generateFilename(): string {
    const base = this.options.filename || 'export';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = this.options.format;
    return `${base}_${timestamp}.${ext}`;
  }

  private async compressGzip(data: string): Promise<Blob> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(dataBuffer);
    writer.close();
    return new Response(cs.readable).blob();
  }

  private async compressZip(data: string, filename: string): Promise<{ blob: Blob; size: number }> {
    const blob = new Blob([data], { type: 'application/zip' });
    return { blob, size: blob.size };
  }
}

export class DataImporter {
  private options: ImportOptions;
  private errors: ImportError[] = [];
  private warnings: string[] = [];

  constructor(options: ImportOptions) {
    this.options = { ...DEFAULT_IMPORT_OPTIONS, ...options };
  }

  async import(input: string | File | Blob): Promise<ImportResult> {
    const startTime = Date.now();
    this.errors = [];
    this.warnings = [];

    try {
      let content: string;
      
      if (input instanceof File || input instanceof Blob) {
        content = await this.readFile(input);
      } else {
        content = input;
      }

      let data: unknown[];

      switch (this.options.format) {
        case 'json':
          data = this.importFromJSON(content);
          break;
        case 'csv':
          data = this.importFromCSV(content);
          break;
        case 'tsv':
          data = this.importFromTSV(content);
          break;
        case 'xml':
          data = this.importFromXML(content);
          break;
        case 'yaml':
          data = this.importFromYAML(content);
          break;
        case 'html':
          data = this.importFromHTML(content);
          break;
        default:
          throw new Error(`Unsupported format: ${this.options.format}`);
      }

      if (this.options.transform) {
        data = this.transformData(data);
      }

      if (this.options.validate) {
        data = this.validateData(data);
      }

      const metadata: ImportMetadata = {
        importDate: new Date().toISOString(),
        format: this.options.format,
        recordCount: data.length,
        columns: this.getColumns(data),
        skippedRows: this.errors.length,
        duration: Date.now() - startTime,
      };

      return {
        success: this.errors.length === 0,
        data,
        rowCount: data.length,
        errors: this.errors.length > 0 ? this.errors : undefined,
        warnings: this.warnings.length > 0 ? this.warnings : undefined,
        metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async readFile(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file, this.options.encoding);
    });
  }

  private importFromJSON(content: string): unknown[] {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed.data && Array.isArray(parsed.data)) {
        return parsed.data;
      }
      return [parsed];
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private importFromCSV(content: string): unknown[] {
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) return [];

    let headers: string[] = [];
    const dataRows: string[][] = [];

    if (this.options.hasHeaders) {
      headers = this.parseCSVLine(lines[0]);
      for (let i = 1; i < lines.length; i++) {
        dataRows.push(this.parseCSVLine(lines[i]));
      }
    } else {
      const firstRow = this.parseCSVLine(lines[0]);
      headers = firstRow.map((_, i) => `column_${i + 1}`);
      dataRows.push(firstRow);
      for (let i = 1; i < lines.length; i++) {
        dataRows.push(this.parseCSVLine(lines[i]));
      }
    }

    const data: Record<string, unknown>[] = [];
    
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (this.options.skipEmptyLines && row.every(cell => !cell.trim())) {
        continue;
      }

      const record: Record<string, unknown> = {};
      headers.forEach((header, j) => {
        let value: unknown = row[j]?.trim() || '';
        
        if (value === '') {
          value = null;
        } else if (!isNaN(Number(value))) {
          value = Number(value);
        } else if (value.toLowerCase() === 'true') {
          value = true;
        } else if (value.toLowerCase() === 'false') {
          value = false;
        } else if (this.isJSON(value)) {
          try {
            value = JSON.parse(value as string);
          } catch {}
        }

        record[header] = value;
      });

      data.push(record);
    }

    return data;
  }

  private importFromTSV(content: string): string {
    const originalDelimiter = this.options.delimiter;
    this.options.delimiter = '\t';
    const result = this.importFromCSV(content);
    this.options.delimiter = originalDelimiter;
    return result as unknown as string;
  }

  private importFromXML(content: string): unknown[] {
    const records: Record<string, unknown>[] = [];
    
    const recordMatches = content.matchAll(/<record>(.*?)<\/record>/gs);
    
    for (const match of recordMatches) {
      const recordContent = match[1];
      const record: Record<string, unknown> = {};
      
      const fieldMatches = content.matchAll(/<(\w+)>(.*?)<\/\1>/g);
      for (const fieldMatch of fieldMatches) {
        const [, fieldName, fieldValue] = fieldMatch;
        record[fieldName] = this.parseValue(fieldValue);
      }
      
      records.push(record);
    }

    return records;
  }

  private importFromYAML(content: string): unknown[] {
    const lines = content.split('\n');
    const records: Record<string, unknown>[] = [];
    let currentRecord: Record<string, unknown> = {};
    let currentKey = '';
    let inArray = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed === 'records:') continue;

      if (trimmed.startsWith('- ')) {
        if (Object.keys(currentRecord).length > 0) {
          records.push(currentRecord);
        }
        currentRecord = {};
        const value = trimmed.slice(2).trim();
        if (value.includes(':')) {
          const [key, val] = value.split(':').map(s => s.trim());
          currentRecord[key] = this.parseValue(val);
          currentKey = key;
        }
      } else if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        currentRecord[key.trim()] = this.parseValue(value);
        currentKey = key.trim();
      }
    }

    if (Object.keys(currentRecord).length > 0) {
      records.push(currentRecord);
    }

    return records;
  }

  private importFromHTML(content: string): unknown[] {
    const tableMatch = content.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) {
      throw new Error('No table found in HTML');
    }

    const rows: string[][] = [];
    const rowMatches = tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    
    for (const rowMatch of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
      
      for (const cellMatch of cellMatches) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return [];

    const headers = rows[0];
    const data: Record<string, unknown>[] = [];

    for (let i = 1; i < rows.length; i++) {
      const record: Record<string, unknown> = {};
      headers.forEach((header, j) => {
        record[header] = rows[i][j] || null;
      });
      data.push(record);
    }

    return data;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === this.options.delimiter) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current);
    return result;
  }

  private parseValue(value: string): unknown {
    if (!value || value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(Number(value))) return Number(value);
    if (this.isJSON(value)) {
      try {
        return JSON.parse(value);
      } catch {}
    }
    return value;
  }

  private isJSON(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  private transformData(data: unknown[]): unknown[] {
    const transformed: unknown[] = [];
    
    for (let i = 0; i < data.length; i++) {
      try {
        const row = data[i] as Record<string, unknown>;
        const result = this.options.transform!(row, i);
        if (result) {
          transformed.push(result);
        }
      } catch (error) {
        this.errors.push({
          row: i + 1,
          message: `Transform error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    
    return transformed;
  }

  private validateData(data: unknown[]): unknown[] {
    const valid: unknown[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as Record<string, unknown>;
      const isValid = this.options.validate!(row);
      
      if (isValid) {
        valid.push(row);
      } else {
        this.warnings.push(`Row ${i + 1} failed validation`);
      }
    }
    
    return valid;
  }

  private getColumns(data: unknown[]): string[] {
    if (data.length === 0) return [];
    const columns = new Set<string>();
    
    for (const item of data) {
      if (typeof item === 'object' && item !== null) {
        Object.keys(item as Record<string, unknown>).forEach(key => columns.add(key));
      }
    }
    
    return Array.from(columns);
  }
}

export class DataBackup {
  private storageKey: string;

  constructor(storageKey: string = 'ext_data_backups') {
    this.storageKey = storageKey;
  }

  async createBackup(data: unknown[], name: string, description?: string, format: ExportFormat = 'json'): Promise<StorageBackup> {
    const exporter = new DataExporter({ format, includeMetadata: true });
    const result = await exporter.export(data, name);
    
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Export failed');
    }

    const content = typeof result.data === 'string' ? result.data : await result.data.text();
    const checksum = await this.calculateChecksum(content);

    const backup: StorageBackup = {
      id: `backup_${Date.now()}`,
      name,
      description,
      createdAt: Date.now(),
      size: content.length,
      checksum,
      format,
      data: content,
    };

    await this.saveBackup(backup);
    return backup;
  }

  async restoreBackup(backupId: string): Promise<unknown[]> {
    const backup = await this.getBackup(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    const importer = new DataImporter({ format: backup.format as ImportFormat });
    const result = await importer.import(backup.data);
    
    if (!result.success) {
      throw new Error(result.error || 'Import failed');
    }

    return result.data || [];
  }

  async listBackups(): Promise<StorageBackup[]> {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : [];
  }

  async getBackup(backupId: string): Promise<StorageBackup | null> {
    const backups = await this.listBackups();
    return backups.find(b => b.id === backupId) || null;
  }

  async deleteBackup(backupId: string): Promise<void> {
    const backups = await this.listBackups();
    const filtered = backups.filter(b => b.id !== backupId);
    localStorage.setItem(this.storageKey, JSON.stringify(filtered));
  }

  async cleanOldBackups(keepCount: number = 10): Promise<number> {
    const backups = await this.listBackups();
    const sorted = backups.sort((a, b) => b.createdAt - a.createdAt);
    const toDelete = sorted.slice(keepCount);
    
    for (const backup of toDelete) {
      await this.deleteBackup(backup.id);
    }
    
    return toDelete.length;
  }

  private async saveBackup(backup: StorageBackup): Promise<void> {
    const backups = await this.listBackups();
    backups.push(backup);
    localStorage.setItem(this.storageKey, JSON.stringify(backups));
  }

  private async calculateChecksum(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

export class DataValidator {
  validateSchema(data: unknown[], schema: DataSchema): ValidationResult {
    const errors: ValidationError[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as Record<string, unknown>;
      
      for (const field of schema.fields) {
        const value = row[field.name];
        
        if (field.required && (value === null || value === undefined || value === '')) {
          errors.push({
            row: i + 1,
            field: field.name,
            message: `Required field is missing`,
            value,
          });
          continue;
        }

        if (value !== null && value !== undefined && value !== '') {
          const typeError = this.validateType(value, field.type);
          if (typeError) {
            errors.push({
              row: i + 1,
              field: field.name,
              message: typeError,
              value,
            });
          }

          if (field.pattern && typeof value === 'string') {
            const regex = new RegExp(field.pattern);
            if (!regex.test(value)) {
              errors.push({
                row: i + 1,
                field: field.name,
                message: `Value does not match pattern: ${field.pattern}`,
                value,
              });
            }
          }

          if (field.min !== undefined && typeof value === 'number' && value < field.min) {
            errors.push({
              row: i + 1,
              field: field.name,
              message: `Value ${value} is less than minimum ${field.min}`,
              value,
            });
          }

          if (field.max !== undefined && typeof value === 'number' && value > field.max) {
            errors.push({
              row: i + 1,
              field: field.name,
              message: `Value ${value} is greater than maximum ${field.max}`,
              value,
            });
          }

          if (field.enum && !field.enum.includes(value)) {
            errors.push({
              row: i + 1,
              field: field.name,
              message: `Value must be one of: ${field.enum.join(', ')}`,
              value,
            });
          }
        }
      }
    }

    if (schema.primaryKey && schema.primaryKey.length > 0) {
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i++) {
        const row = data[i] as Record<string, unknown>;
        const key = schema.primaryKey.map(pk => String(row[pk] ?? 'null')).join('|');
        
        if (seen.has(key)) {
          errors.push({
            row: i + 1,
            field: schema.primaryKey.join(', '),
            message: 'Duplicate primary key',
          });
        }
        seen.add(key);
      }
    }

    if (schema.constraints?.custom) {
      const customErrors = schema.constraints.custom(data);
      errors.push(...customErrors.errors || []);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private validateType(value: unknown, type: SchemaField['type']): string | null {
    switch (type) {
      case 'string':
        return typeof value !== 'string' ? `Expected string, got ${typeof value}` : null;
      case 'number':
        return typeof value !== 'number' ? `Expected number, got ${typeof value}` : null;
      case 'boolean':
        return typeof value !== 'boolean' ? `Expected boolean, got ${typeof value}` : null;
      case 'date':
        return !(value instanceof Date || !isNaN(Date.parse(String(value)))) 
          ? 'Expected valid date' : null;
      case 'object':
        return typeof value !== 'object' || Array.isArray(value) 
          ? 'Expected object' : null;
      case 'array':
        return !Array.isArray(value) ? 'Expected array' : null;
      default:
        return null;
    }
  }
}

export default { DataExporter, DataImporter, DataBackup, DataValidator };
