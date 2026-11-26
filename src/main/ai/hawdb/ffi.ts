import koffi from 'koffi'
import { parseLosslessJson, stringifyParameters } from './jsonCodec'

export interface HawdbOpenOptions {
  readOnly?: boolean
  durability?: 'sync_on_every_write' | 'sync_on_checkpoint'
  maxReadResultRows?: number
  maxReadIntermediateRows?: number
  maxReadResultPayloadBytes?: number
  relationalMonotonicAppendFastPath?: boolean
}

export class HawdbError extends Error {
  readonly kind: string
  readonly details?: unknown

  constructor(kind: string, message: string, details?: unknown) {
    super(message)
    this.name = 'HawdbError'
    this.kind = kind
    this.details = details
  }
}

export class HawdbQueryResult {
  readonly columns: string[]
  readonly rows: unknown[][]

  constructor(columns: string[], rows: unknown[][]) {
    this.columns = columns
    this.rows = rows
  }

  dicts(): Record<string, unknown>[] {
    return this.rows.map((row) => {
      const record: Record<string, unknown> = {}
      for (let i = 0; i < this.columns.length; i += 1) {
        record[this.columns[i]] = row[i]
      }
      return record
    })
  }
}

interface RawHawdbBuffer {
  ptr: unknown
  len: number | bigint
}

interface NativeSymbols {
  hawdb_open: (path: Buffer, pathLen: number, options: Buffer, optionsLen: number, errOut: RawHawdbBuffer) => unknown
  hawdb_open_in_memory: (errOut: RawHawdbBuffer) => unknown
  hawdb_close: (db: unknown) => void
  hawdb_query: (db: unknown, cypher: Buffer, cypherLen: number, params: Buffer, paramsLen: number, resultOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_query_sql: (db: unknown, sql: Buffer, sqlLen: number, params: Buffer, paramsLen: number, resultOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_begin_transaction: (db: unknown, errOut: RawHawdbBuffer) => boolean
  hawdb_transaction_query: (db: unknown, cypher: Buffer, cypherLen: number, params: Buffer, paramsLen: number, resultOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_transaction_query_sql: (db: unknown, sql: Buffer, sqlLen: number, params: Buffer, paramsLen: number, resultOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_commit_transaction: (db: unknown, resultOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_rollback_transaction: (db: unknown, errOut: RawHawdbBuffer) => boolean
  hawdb_export: (db: unknown, dest: Buffer, destLen: number, reportOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_import: (src: Buffer, srcLen: number, dest: Buffer, destLen: number, reportOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_verify_dump: (path: Buffer, pathLen: number, reportOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_confirm_dump_publication: (dest: Buffer, destLen: number, errOut: RawHawdbBuffer) => boolean
  hawdb_backup: (db: unknown, dest: Buffer, destLen: number, reportOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_restore: (src: Buffer, srcLen: number, dest: Buffer, destLen: number, reportOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_scrub: (db: unknown, reportOut: RawHawdbBuffer, errOut: RawHawdbBuffer) => boolean
  hawdb_format_version: () => number
  hawdb_dump_format_version: () => number
  hawdb_version: (out: RawHawdbBuffer) => void
  hawdb_buffer_free: (buf: RawHawdbBuffer) => void
}

let bufferStructRegistered = false

function ensureBufferStruct(): void {
  if (bufferStructRegistered) {return}
  koffi.struct('HawdbBuffer', {
    ptr: 'void *',
    len: 'size_t'
  })
  bufferStructRegistered = true
}

const EMPTY_BYTES = Buffer.alloc(1)
const utf8Decoder = new TextDecoder()

function encodeUtf8(value: string): { buf: Buffer; len: number } {
  if (value.length === 0) {return { buf: EMPTY_BYTES, len: 0 }}
  const buf = Buffer.from(value, 'utf8')
  return { buf, len: buf.length }
}

function emptyBuffer(): RawHawdbBuffer {
  return { ptr: null, len: 0 }
}

function serializeOpenOptions(options?: HawdbOpenOptions): string {
  if (!options) {return '{}'}
  const payload: Record<string, unknown> = {}
  if (options.readOnly !== undefined) {payload.read_only = options.readOnly}
  if (options.durability !== undefined) {payload.durability = options.durability}
  if (options.maxReadResultRows !== undefined) {payload.max_read_result_rows = options.maxReadResultRows}
  if (options.maxReadIntermediateRows !== undefined) {payload.max_read_intermediate_rows = options.maxReadIntermediateRows}
  if (options.maxReadResultPayloadBytes !== undefined) {payload.max_read_result_payload_bytes = options.maxReadResultPayloadBytes}
  if (options.relationalMonotonicAppendFastPath !== undefined) {
    payload.relational_monotonic_append_fast_path = options.relationalMonotonicAppendFastPath
  }
  return stringifyParameters(payload)
}

function decodeResultPayload(text: string | null): HawdbQueryResult {
  if (!text) {return new HawdbQueryResult([], [])}
  const parsed = parseLosslessJson(text)
  if (typeof parsed !== 'object' || parsed === null) {return new HawdbQueryResult([], [])}
  const record = parsed as Record<string, unknown>
  const columns = Array.isArray(record.columns) ? record.columns.map((item) => String(item)) : []
  const rows = Array.isArray(record.rows) ? (record.rows as unknown[][]) : []
  return new HawdbQueryResult(columns, rows)
}

export class HawdbTransaction {
  private readonly library: HawdbLibrary
  private readonly handle: unknown
  private active = true

  constructor(library: HawdbLibrary, handle: unknown) {
    this.library = library
    this.handle = handle
  }

  invalidate(): void {
    this.active = false
  }

  private assertActive(): void {
    if (!this.active) {throw new HawdbError('transaction_expired', '事务已结束，不可继续使用')}
  }

  query(cypher: string, params?: Record<string, unknown>): HawdbQueryResult {
    this.assertActive()
    return this.library.runQuery(this.handle, cypher, params ?? {}, true, false)
  }

  querySQL(sql: string, params?: unknown[]): HawdbQueryResult {
    this.assertActive()
    return this.library.runQuery(this.handle, sql, params ?? [], true, true)
  }

  exec(cypher: string, params?: Record<string, unknown>): void {
    this.query(cypher, params)
  }
}

export class HawdbDatabase {
  private readonly library: HawdbLibrary
  private readonly handle: unknown
  private closed = false
  private inTransaction = false

  constructor(library: HawdbLibrary, handle: unknown) {
    this.library = library
    this.handle = handle
  }

  private assertOpen(): void {
    if (this.closed) {throw new HawdbError('database_closed', 'HawDB 数据库句柄已关闭')}
  }

  query(cypher: string, params?: Record<string, unknown>): HawdbQueryResult {
    this.assertOpen()
    if (this.inTransaction) {throw new HawdbError('active_transaction', '事务进行中请使用事务句柄执行查询')}
    return this.library.runQuery(this.handle, cypher, params ?? {}, false, false)
  }

  querySQL(sql: string, params?: unknown[]): HawdbQueryResult {
    this.assertOpen()
    if (this.inTransaction) {throw new HawdbError('active_transaction', '事务进行中请使用事务句柄执行查询')}
    return this.library.runQuery(this.handle, sql, params ?? [], false, true)
  }

  exec(cypher: string, params?: Record<string, unknown>): void {
    this.query(cypher, params)
  }

  transaction<T>(body: (tx: HawdbTransaction) => T): T {
    this.assertOpen()
    if (this.inTransaction) {throw new HawdbError('nested_transaction', 'HawDB 不支持嵌套事务')}
    this.library.beginTransaction(this.handle)
    this.inTransaction = true
    const tx = new HawdbTransaction(this.library, this.handle)
    let value: T
    try {
      value = body(tx)
      if (value && typeof (value as unknown as { then?: unknown }).then === 'function') {
        throw new TypeError('HawDB 事务回调必须为同步函数，不支持返回 Promise')
      }
    } catch (error) {
      tx.invalidate()
      this.inTransaction = false
      try {
        this.library.rollbackTransaction(this.handle)
      } catch {
        void 0
      }
      throw error
    }
    tx.invalidate()
    this.inTransaction = false
    this.library.commitTransaction(this.handle)
    return value
  }

  export(destination: string): Record<string, unknown> {
    this.assertOpen()
    return this.library.exportDatabase(this.handle, destination)
  }

  backup(destination: string): Record<string, unknown> {
    this.assertOpen()
    return this.library.backupDatabase(this.handle, destination)
  }

  scrub(): Record<string, unknown> {
    this.assertOpen()
    return this.library.scrubDatabase(this.handle)
  }

  close(): void {
    if (this.closed) {return}
    if (this.inTransaction) {throw new HawdbError('active_transaction', '事务未结束前不可关闭数据库')}
    this.closed = true
    this.library.closeHandle(this.handle)
  }
}

export class HawdbLibrary {
  private readonly lib: ReturnType<typeof koffi.load>
  private readonly symbols: NativeSymbols
  private readonly handles = new Set<unknown>()
  private closed = false

  constructor(libraryPath: string) {
    ensureBufferStruct()
    this.lib = koffi.load(libraryPath)
    this.symbols = {
      hawdb_open: this.lib.func('void * hawdb_open(const uint8_t *path, size_t path_len, const uint8_t *options_json, size_t options_len, _Inout_ HawdbBuffer *err_out)'),
      hawdb_open_in_memory: this.lib.func('void * hawdb_open_in_memory(_Inout_ HawdbBuffer *err_out)'),
      hawdb_close: this.lib.func('void hawdb_close(void *db)'),
      hawdb_query: this.lib.func('bool hawdb_query(void *db, const uint8_t *cypher, size_t cypher_len, const uint8_t *params_json, size_t params_len, _Inout_ HawdbBuffer *result_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_query_sql: this.lib.func('bool hawdb_query_sql(void *db, const uint8_t *sql, size_t sql_len, const uint8_t *params_json, size_t params_len, _Inout_ HawdbBuffer *result_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_begin_transaction: this.lib.func('bool hawdb_begin_transaction(void *db, _Inout_ HawdbBuffer *err_out)'),
      hawdb_transaction_query: this.lib.func('bool hawdb_transaction_query(void *db, const uint8_t *cypher, size_t cypher_len, const uint8_t *params_json, size_t params_len, _Inout_ HawdbBuffer *result_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_transaction_query_sql: this.lib.func('bool hawdb_transaction_query_sql(void *db, const uint8_t *sql, size_t sql_len, const uint8_t *params_json, size_t params_len, _Inout_ HawdbBuffer *result_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_commit_transaction: this.lib.func('bool hawdb_commit_transaction(void *db, _Inout_ HawdbBuffer *result_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_rollback_transaction: this.lib.func('bool hawdb_rollback_transaction(void *db, _Inout_ HawdbBuffer *err_out)'),
      hawdb_export: this.lib.func('bool hawdb_export(void *db, const uint8_t *dest, size_t dest_len, _Inout_ HawdbBuffer *report_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_import: this.lib.func('bool hawdb_import(const uint8_t *src, size_t src_len, const uint8_t *dest, size_t dest_len, _Inout_ HawdbBuffer *report_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_verify_dump: this.lib.func('bool hawdb_verify_dump(const uint8_t *path, size_t path_len, _Inout_ HawdbBuffer *report_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_confirm_dump_publication: this.lib.func('bool hawdb_confirm_dump_publication(const uint8_t *dest, size_t dest_len, _Inout_ HawdbBuffer *err_out)'),
      hawdb_backup: this.lib.func('bool hawdb_backup(void *db, const uint8_t *dest, size_t dest_len, _Inout_ HawdbBuffer *report_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_restore: this.lib.func('bool hawdb_restore(const uint8_t *src, size_t src_len, const uint8_t *dest, size_t dest_len, _Inout_ HawdbBuffer *report_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_scrub: this.lib.func('bool hawdb_scrub(void *db, _Inout_ HawdbBuffer *report_out, _Inout_ HawdbBuffer *err_out)'),
      hawdb_format_version: this.lib.func('uint32_t hawdb_format_version()'),
      hawdb_dump_format_version: this.lib.func('uint32_t hawdb_dump_format_version()'),
      hawdb_version: this.lib.func('void hawdb_version(_Inout_ HawdbBuffer *out)'),
      hawdb_buffer_free: this.lib.func('void hawdb_buffer_free(_Inout_ HawdbBuffer *buf)')
    }
  }

  private takeBuffer(buffer: RawHawdbBuffer): string | null {
    const length = Number(buffer.len)
    if (!buffer.ptr) {
      if (length !== 0) {throw new TypeError('HawDB 返回了空指针但长度非零的缓冲区')}
      return null
    }
    try {
      if (length === 0) {return ''}
      const bytes = koffi.decode(buffer.ptr, 'uint8_t', length) as Uint8Array
      return utf8Decoder.decode(bytes)
    } finally {
      this.symbols.hawdb_buffer_free(buffer)
    }
  }

  private errorFrom(errorBuffer: RawHawdbBuffer, fallback: string): HawdbError {
    const text = this.takeBuffer(errorBuffer)
    if (!text) {return new HawdbError('ffi', fallback)}
    try {
      const parsed = parseLosslessJson(text)
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as Record<string, unknown>
        const kind = typeof record.kind === 'string' ? record.kind : 'ffi'
        const message = typeof record.message === 'string' ? record.message : text
        return new HawdbError(kind, message, record.details)
      }
    } catch {
      return new HawdbError('ffi', text)
    }
    return new HawdbError('ffi', text)
  }

  private assertOpen(): void {
    if (this.closed) {throw new HawdbError('library_closed', 'HawDB 动态库已卸载，不可继续调用')}
  }

  version(): string {
    this.assertOpen()
    const out = emptyBuffer()
    this.symbols.hawdb_version(out)
    const text = this.takeBuffer(out)
    if (text === null) {throw new HawdbError('ffi', '无法读取 HawDB 版本号')}
    return text
  }

  formatVersion(): number {
    this.assertOpen()
    return this.symbols.hawdb_format_version()
  }

  dumpFormatVersion(): number {
    this.assertOpen()
    return this.symbols.hawdb_dump_format_version()
  }

  open(path: string, options?: HawdbOpenOptions): HawdbDatabase {
    this.assertOpen()
    const pathBytes = encodeUtf8(path)
    const optionBytes = encodeUtf8(serializeOpenOptions(options))
    const errOut = emptyBuffer()
    const handle = this.symbols.hawdb_open(pathBytes.buf, pathBytes.len, optionBytes.buf, optionBytes.len, errOut)
    if (!handle) {throw this.errorFrom(errOut, `无法打开 HawDB 数据库：${path}`)}
    const stray = this.takeBuffer(errOut)
    if (stray !== null) {
      this.symbols.hawdb_close(handle)
      throw new HawdbError('ffi', stray)
    }
    this.handles.add(handle)
    return new HawdbDatabase(this, handle)
  }

  openInMemory(): HawdbDatabase {
    this.assertOpen()
    const errOut = emptyBuffer()
    const handle = this.symbols.hawdb_open_in_memory(errOut)
    if (!handle) {throw this.errorFrom(errOut, '无法创建内存 HawDB 数据库')}
    const stray = this.takeBuffer(errOut)
    if (stray !== null) {
      this.symbols.hawdb_close(handle)
      throw new HawdbError('ffi', stray)
    }
    this.handles.add(handle)
    return new HawdbDatabase(this, handle)
  }

  closeHandle(handle: unknown): void {
    if (!this.handles.has(handle)) {return}
    this.handles.delete(handle)
    if (!this.closed) {this.symbols.hawdb_close(handle)}
  }

  runQuery(handle: unknown, statement: string, params: unknown, inTransaction: boolean, sql: boolean): HawdbQueryResult {
    this.assertOpen()
    const stmtBytes = encodeUtf8(statement)
    const paramBytes = encodeUtf8(stringifyParameters(params))
    const resultOut = emptyBuffer()
    const errOut = emptyBuffer()
    const ok = sql
      ? (inTransaction
        ? this.symbols.hawdb_transaction_query_sql(handle, stmtBytes.buf, stmtBytes.len, paramBytes.buf, paramBytes.len, resultOut, errOut)
        : this.symbols.hawdb_query_sql(handle, stmtBytes.buf, stmtBytes.len, paramBytes.buf, paramBytes.len, resultOut, errOut))
      : (inTransaction
        ? this.symbols.hawdb_transaction_query(handle, stmtBytes.buf, stmtBytes.len, paramBytes.buf, paramBytes.len, resultOut, errOut)
        : this.symbols.hawdb_query(handle, stmtBytes.buf, stmtBytes.len, paramBytes.buf, paramBytes.len, resultOut, errOut))
    if (!ok) {
      this.takeBuffer(resultOut)
      throw this.errorFrom(errOut, sql ? 'HawDB SQL 执行失败' : 'HawDB Cypher 执行失败')
    }
    const payload = this.takeBuffer(resultOut)
    const stray = this.takeBuffer(errOut)
    if (stray !== null) {throw new HawdbError('ffi', stray)}
    return decodeResultPayload(payload)
  }

  beginTransaction(handle: unknown): void {
    this.assertOpen()
    const errOut = emptyBuffer()
    if (!this.symbols.hawdb_begin_transaction(handle, errOut)) {
      throw this.errorFrom(errOut, '无法开启 HawDB 事务')
    }
    const stray = this.takeBuffer(errOut)
    if (stray !== null) {throw new HawdbError('ffi', stray)}
  }

  commitTransaction(handle: unknown): void {
    this.assertOpen()
    const resultOut = emptyBuffer()
    const errOut = emptyBuffer()
    const ok = this.symbols.hawdb_commit_transaction(handle, resultOut, errOut)
    this.takeBuffer(resultOut)
    if (!ok) {throw this.errorFrom(errOut, '提交 HawDB 事务失败')}
    const stray = this.takeBuffer(errOut)
    if (stray !== null) {throw new HawdbError('ffi', stray)}
  }

  rollbackTransaction(handle: unknown): void {
    this.assertOpen()
    const errOut = emptyBuffer()
    const ok = this.symbols.hawdb_rollback_transaction(handle, errOut)
    if (!ok) {throw this.errorFrom(errOut, '回滚 HawDB 事务失败')}
    const stray = this.takeBuffer(errOut)
    if (stray !== null) {throw new HawdbError('ffi', stray)}
  }

  private parseReport(reportOut: RawHawdbBuffer, errOut: RawHawdbBuffer, ok: boolean, fallback: string): Record<string, unknown> {
    this.assertOpen()
    if (!ok) {
      this.takeBuffer(reportOut)
      throw this.errorFrom(errOut, fallback)
    }
    const payload = this.takeBuffer(reportOut)
    const stray = this.takeBuffer(errOut)
    if (stray !== null) {throw new HawdbError('ffi', stray)}
    if (!payload) {return {}}
    const parsed = parseLosslessJson(payload)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  }

  exportDatabase(handle: unknown, destination: string): Record<string, unknown> {
    const destBytes = encodeUtf8(destination)
    const reportOut = emptyBuffer()
    const errOut = emptyBuffer()
    const ok = this.symbols.hawdb_export(handle, destBytes.buf, destBytes.len, reportOut, errOut)
    return this.parseReport(reportOut, errOut, ok, '导出 HawDB 转储失败')
  }

  importDump(source: string, destination: string): Record<string, unknown> {
    const srcBytes = encodeUtf8(source)
    const destBytes = encodeUtf8(destination)
    const reportOut = emptyBuffer()
    const errOut = emptyBuffer()
    const ok = this.symbols.hawdb_import(srcBytes.buf, srcBytes.len, destBytes.buf, destBytes.len, reportOut, errOut)
    return this.parseReport(reportOut, errOut, ok, '导入 HawDB 转储失败')
  }

  verifyDump(path: string): Record<string, unknown> {
    const pathBytes = encodeUtf8(path)
    const reportOut = emptyBuffer()
    const errOut = emptyBuffer()
    const ok = this.symbols.hawdb_verify_dump(pathBytes.buf, pathBytes.len, reportOut, errOut)
    return this.parseReport(reportOut, errOut, ok, '校验 HawDB 转储失败')
  }

  backupDatabase(handle: unknown, destination: string): Record<string, unknown> {
    const destBytes = encodeUtf8(destination)
    const reportOut = emptyBuffer()
    const errOut = emptyBuffer()
    const ok = this.symbols.hawdb_backup(handle, destBytes.buf, destBytes.len, reportOut, errOut)
    return this.parseReport(reportOut, errOut, ok, '备份 HawDB 数据库失败')
  }

  scrubDatabase(handle: unknown): Record<string, unknown> {
    const reportOut = emptyBuffer()
    const errOut = emptyBuffer()
    const ok = this.symbols.hawdb_scrub(handle, reportOut, errOut)
    return this.parseReport(reportOut, errOut, ok, '校验 HawDB 数据库失败')
  }

  close(): void {
    if (this.closed) {return}
    if (this.handles.size > 0) {
      throw new HawdbError('open_handles', '关闭 HawDB 动态库前必须先关闭全部数据库句柄')
    }
    this.closed = true
    this.lib.unload()
  }
}
