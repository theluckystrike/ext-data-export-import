import { JSONExporter } from './formats/json';
import { CSVExporter } from './formats/csv';
import { XMLExporter } from './formats/xml';
import { YAMLExporter } from './formats/yaml';
import { SQLExporter } from './formats/sql';
import { HTMLExporter } from './formats/html';
import { ExcelExporter } from './formats/excel';
import { Importer } from './formats/importer';

export type ExportFormat = 'json' | 'csv' | 'xml' | 'yaml' | 'sql' | 'html' | 'excel';
export type ImportFormat = 'json' | 'csv' | 'xml' | 'yaml' | 'sql' | 'excel';

export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  pretty?: boolean;
  compression?: boolean;
  includeMetadata?: boolean;
  encoding?: string;
  delimiter?: string;
  headers?: boolean;
  sheetName?: string;
  tableName?: string;
}

export interface ImportOptions {
  format: ImportFormat;
  delimiter?: string;
  hasHeaders?: boolean;
  skipEmptyRows?: boolean;
  trimValues?: boolean;
  dateFormat?: string;
  encoding?: string;
  sheetIndex?: number;
}

export interface DataTransformation {
  type: 'map' | 'filter' | 'sort' | 'group' | 'aggregate' | 'transform';
  config: any;
}

export interface ExportResult {
  success: boolean;
  data?: string | Blob;
  filename?: string;
  mimeType?: string;
  size?: number;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  data?: any;
  rowCount?: number;
  columnCount?: number;
  errors?: string[];
  warnings?: string[];
}

export class DataExportImport {
  private jsonExporter: JSONExporter;
  private csvExporter: CSVExporter;
  private xmlExporter: XMLExporter;
  private yamlExporter: YAMLExporter;
  private sqlExporter: SQLExporter;
  private htmlExporter: HTMLExporter;
  private excelExporter: ExcelExporter;
  private importer: Importer;

  constructor() {
    this.jsonExporter = new JSONExporter();
    this.csvExporter = new CSVExporter();
    this.xmlExporter = new XMLExporter();
    this.yamlExporter = new YAMLExporter();
    this.sqlExporter = new SQLExporter();
    this.htmlExporter = new HTMLExporter();
    this.excelExporter = new ExcelExporter();
    this.importer = new Importer();
  }

  async export(data: any[], options: ExportOptions): Promise<ExportResult> {
    try {
      const transformedData = this.applyTransformations(data, options);
      
      let result: string | Blob;
      let mimeType: string;
      let extension: string;

      switch (options.format) {
        case 'json':
          result = await this.jsonExporter.export(transformedData, options);
          mimeType = 'application/json';
          extension = 'json';
          break;

        case 'csv':
          result = await this.csvExporter.export(transformedData, options);
          mimeType = 'text/csv';
          extension = 'csv';
          break;

        case 'xml':
          result = await this.xmlExporter.export(transformedData, options);
          mimeType = 'application/xml';
          extension = 'xml';
          break;

        case 'yaml':
          result = await this.yamlExporter.export(transformedData, options);
          mimeType = 'application/x-yaml';
          extension = 'yaml';
          break;

        case 'sql':
          result = await this.sqlExporter.export(transformedData, options);
          mimeType = 'application/sql';
          extension = 'sql';
          break;

        case 'html':
          result = await this.htmlExporter.export(transformedData, options);
          mimeType = 'text/html';
          extension = 'html';
          break;

        case 'excel':
          result = await this.excelExporter.export(transformedData, options);
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          extension = 'xlsx';
          break;

        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }

      const filename = options.filename || `export_${Date.now()}.${extension}`;
      
      return {
        success: true,
        data: result,
        filename,
        mimeType,
        size: typeof result === 'string' ? result.length : result.size
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async import(source: string | File, options: ImportOptions): Promise<ImportResult> {
    try {
      let data: string;
      
      if (source instanceof File) {
        data = await this.readFile(source);
      } else {
        data = source;
      }

      let parsed: any;

      switch (options.format) {
        case 'json':
          parsed = await this.importer.parseJSON(data, options);
          break;
        case 'csv':
          parsed = await this.importer.parseCSV(data, options);
          break;
        case 'xml':
          parsed = await this.importer.parseXML(data, options);
          break;
        case 'yaml':
          parsed = await this.importer.parseYAML(data, options);
          break;
        case 'sql':
          parsed = await this.importer.parseSQL(data, options);
          break;
        case 'excel':
          parsed = await this.importer.parseExcel(source, options);
          break;
        default:
          throw new Error(`Unsupported import format: ${options.format}`);
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      if (options.skipEmptyRows) {
        parsed = this.removeEmptyRows(parsed, warnings);
      }

      if (options.trimValues) {
        parsed = this.trimValues(parsed);
      }

      const rowCount = Array.isArray(parsed) ? parsed.length : 1;
      const columnCount = Array.isArray(parsed) && parsed.length > 0 
        ? Object.keys(parsed[0]).length 
        : 0;

      return {
        success: true,
        data: parsed,
        rowCount,
        columnCount,
        errors,
        warnings
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async download(result: ExportResult): Promise<void> {
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Export failed');
    }

    const blob = result.data instanceof Blob 
      ? result.data 
      : new Blob([result.data as string], { type: result.mimeType });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename || 'export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async upload(options: ImportOptions): Promise<ImportResult> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = this.getMimeTypes(options.format).join(',');
      
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve({ success: false, error: 'No file selected' });
          return;
        }

        const result = await this.import(file, options);
        resolve(result);
      };

      input.click();
    });
  }

  private async readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  private applyTransformations(data: any[], options: ExportOptions & { transformations?: DataTransformation[] }): any[] {
    let result = [...data];
    
    if (options.transformations) {
      for (const transform of options.transformations) {
        result = this.applyTransform(result, transform);
      }
    }

    return result;
  }

  private applyTransform(data: any[], transformation: DataTransformation): any[] {
    switch (transformation.type) {
      case 'map':
        return data.map(item => transformation.config(item));
      case 'filter':
        return data.filter(item => transformation.config(item));
      case 'sort':
        return data.sort((a, b) => {
          const key = transformation.config.key;
          const order = transformation.config.order || 'asc';
          const aVal = a[key];
          const bVal = b[key];
          const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return order === 'desc' ? -cmp : cmp;
        });
      case 'group':
        return this.groupBy(data, transformation.config.key);
      case 'aggregate':
        return this.aggregate(data, transformation.config);
      case 'transform':
        return data.map(item => transformation.config(item));
      default:
        return data;
    }
  }

  private groupBy(data: any[], key: string): any[] {
    const groups: Record<string, any[]> = {};
    
    for (const item of data) {
      const groupKey = item[key];
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    }

    return Object.entries(groups).map(([key, items]) => ({
      key,
      items,
      count: items.length
    }));
  }

  private aggregate(data: any[], config: { key: string; operations: string[] }): any[] {
    const grouped = this.groupBy(data, config.key);
    
    return grouped.map(group => {
      const result: any = { [config.key]: group.key, count: group.count };
      
      for (const op of config.operations) {
        const values = group.items.map((item: any) => item[op]).filter((v: any) => v !== undefined);
        
        if (values.length === 0) continue;
        
        result[`${op}_sum`] = values.reduce((a: number, b: number) => a + b, 0);
        result[`${op}_avg`] = result[`${op}_sum`] / values.length;
        result[`${op}_min`] = Math.min(...values);
        result[`${op}_max`] = Math.max(...values);
      }
      
      return result;
    });
  }

  private removeEmptyRows(data: any[], warnings: string[]): any[] {
    const before = data.length;
    const filtered = data.filter(row => {
      if (typeof row === 'object' && row !== null) {
        return Object.values(row).some(v => v !== '' && v !== null && v !== undefined);
      }
      return row !== '' && row !== null && row !== undefined;
    });
    
    if (before !== filtered.length) {
      warnings.push(`Removed ${before - filtered.length} empty rows`);
    }
    
    return filtered;
  }

  private trimValues(data: any[]): any[] {
    return data.map(row => {
      if (typeof row === 'object' && row !== null) {
        const trimmed: any = {};
        for (const [key, value] of Object.entries(row)) {
          trimmed[key] = typeof value === 'string' ? value.trim() : value;
        }
        return trimmed;
      }
      return row;
    });
  }

  private getMimeTypes(format: ImportFormat): string[] {
    const mimeTypes: Record<ImportFormat, string[]> = {
      json: ['application/json'],
      csv: ['text/csv', 'text/plain'],
      xml: ['application/xml', 'text/xml'],
      yaml: ['application/x-yaml', 'text/yaml'],
      sql: ['application/sql', 'text/plain'],
      excel: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ]
    };
    return mimeTypes[format] || [];
  }

  validateData(data: any[], schema: Record<string, string>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      for (const [field, type] of Object.entries(schema)) {
        const value = row[field];
        
        if (value === undefined || value === null || value === '') {
          continue;
        }
        
        switch (type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`Row ${i + 1}: ${field} expected string, got ${typeof value}`);
            }
            break;
          case 'number':
            if (typeof value !== 'number' || isNaN(value)) {
              errors.push(`Row ${i + 1}: ${field} expected number, got ${typeof value}`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`Row ${i + 1}: ${field} expected boolean, got ${typeof value}`);
            }
            break;
          case 'date':
            if (isNaN(Date.parse(value))) {
              errors.push(`Row ${i + 1}: ${field} expected date, got invalid value`);
            }
            break;
          case 'email':
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              errors.push(`Row ${i + 1}: ${field} expected email format`);
            }
            break;
          case 'url':
            try {
              new URL(value);
            } catch {
              errors.push(`Row ${i + 1}: ${field} expected URL format`);
            }
            break;
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  mergeData(...datasets: any[]): any[] {
    if (datasets.length === 0) return [];
    if (datasets.length === 1) return datasets[0];
    
    const merged: any[] = [];
    const seen = new Set<string>();
    
    for (const dataset of datasets) {
      for (const row of dataset) {
        const key = JSON.stringify(row);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(row);
        }
      }
    }
    
    return merged;
  }
}

export const dataIO = new DataExportImport();
