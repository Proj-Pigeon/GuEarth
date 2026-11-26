const INT64_MIN = -(1n << 63n)
const INT64_MAX = (1n << 63n) - 1n

function encodeBinaryBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function serializeValue(value: unknown, seen: WeakSet<object>): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('HawDB 参数不支持 NaN 或 Infinity')
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError('超出安全整数范围的整数必须使用 bigint 传入')
    }
    return JSON.stringify(value)
  }
  if (typeof value === 'bigint') {
    if (value < INT64_MIN || value > INT64_MAX) {
      throw new RangeError('bigint 超出 64 位有符号整数范围')
    }
    return value.toString()
  }
  if (typeof value !== 'object') {
    throw new TypeError(`不支持的 HawDB 参数类型：${typeof value}`)
  }
  if (value instanceof Uint8Array) {
    return JSON.stringify({ $binary: encodeBinaryBase64(value) })
  }
  if (seen.has(value)) {
    throw new TypeError('HawDB 参数存在循环引用')
  }
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      const parts: string[] = []
      for (let i = 0; i < value.length; i += 1) {
        if (!Object.hasOwn(value, i)) {
          throw new TypeError('HawDB 不支持稀疏数组参数')
        }
        parts.push(serializeValue(value[i], seen))
      }
      return `[${parts.join(',')}]`
    }
    if (!isPlainObject(value)) {
      throw new TypeError('HawDB 仅支持普通对象参数')
    }
    const entries = Object.entries(value)
    const parts = entries.map(
      ([key, entryValue]) => `${JSON.stringify(key)}:${serializeValue(entryValue, seen)}`
    )
    return `{${parts.join(',')}}`
  } finally {
    seen.delete(value)
  }
}

export function stringifyParameters(value: unknown): string {
  return serializeValue(value, new WeakSet())
}

class LosslessJsonParser {
  private readonly text: string
  private index = 0

  constructor(text: string) {
    this.text = text
  }

  parse(): unknown {
    this.skipWhitespace()
    const value = this.parseValue()
    this.skipWhitespace()
    if (this.index !== this.text.length) {
      throw new SyntaxError(`HawDB JSON 解析存在多余字符，偏移 ${this.index}`)
    }
    return value
  }

  private skipWhitespace(): void {
    while (this.index < this.text.length) {
      const ch = this.text.charCodeAt(this.index)
      if (ch === 0x20 || ch === 0x0a || ch === 0x0d || ch === 0x09) {
        this.index += 1
      } else {
        break
      }
    }
  }

  private parseValue(): unknown {
    this.skipWhitespace()
    if (this.index >= this.text.length) {
      throw new SyntaxError(`HawDB JSON 意外结束，偏移 ${this.index}`)
    }
    const ch = this.text[this.index]
    if (ch === '"') {
      return this.parseString()
    }
    if (ch === '{') {
      return this.parseObject()
    }
    if (ch === '[') {
      return this.parseArray()
    }
    if (ch === 't') {
      return this.parseLiteral('true', true)
    }
    if (ch === 'f') {
      return this.parseLiteral('false', false)
    }
    if (ch === 'n') {
      return this.parseLiteral('null', null)
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      return this.parseNumber()
    }
    throw new SyntaxError(`HawDB JSON 遇到无效字符 ${ch}，偏移 ${this.index}`)
  }

  private parseLiteral<T>(literal: string, value: T): T {
    if (!this.text.startsWith(literal, this.index)) {
      throw new SyntaxError(`HawDB JSON 期望 ${literal}，偏移 ${this.index}`)
    }
    this.index += literal.length
    return value
  }

  private parseString(): string {
    const start = this.index
    this.index += 1
    while (this.index < this.text.length) {
      const ch = this.text[this.index]
      if (ch === '\\') {
        this.index += 2
        continue
      }
      if (ch === '"') {
        this.index += 1
        return JSON.parse(this.text.slice(start, this.index)) as string
      }
      this.index += 1
    }
    throw new SyntaxError(`HawDB JSON 字符串未闭合，偏移 ${start}`)
  }

  private parseNumber(): number | bigint {
    const start = this.index
    if (this.text[this.index] === '-') {
      this.index += 1
    }
    if (this.index >= this.text.length) {
      throw new SyntaxError(`HawDB JSON 数字无效，偏移 ${start}`)
    }
    if (this.text[this.index] === '0') {
      this.index += 1
      const next = this.text[this.index]
      if (next && next >= '0' && next <= '9') {
        throw new SyntaxError(`HawDB JSON 不允许前导零，偏移 ${start}`)
      }
    } else if (this.text[this.index] >= '1' && this.text[this.index] <= '9') {
      while (
        this.index < this.text.length &&
        this.text[this.index] >= '0' &&
        this.text[this.index] <= '9'
      ) {
        this.index += 1
      }
    } else {
      throw new SyntaxError(`HawDB JSON 数字无效，偏移 ${start}`)
    }
    let isFloat = false
    if (this.text[this.index] === '.') {
      isFloat = true
      this.index += 1
      const fracStart = this.index
      while (
        this.index < this.text.length &&
        this.text[this.index] >= '0' &&
        this.text[this.index] <= '9'
      ) {
        this.index += 1
      }
      if (this.index === fracStart) {
        throw new SyntaxError(`HawDB JSON 小数部分为空，偏移 ${start}`)
      }
    }
    if (this.text[this.index] === 'e' || this.text[this.index] === 'E') {
      isFloat = true
      this.index += 1
      if (this.text[this.index] === '+' || this.text[this.index] === '-') {
        this.index += 1
      }
      const expStart = this.index
      while (
        this.index < this.text.length &&
        this.text[this.index] >= '0' &&
        this.text[this.index] <= '9'
      ) {
        this.index += 1
      }
      if (this.index === expStart) {
        throw new SyntaxError(`HawDB JSON 指数部分为空，偏移 ${start}`)
      }
    }
    const token = this.text.slice(start, this.index)
    if (isFloat) {
      return Number(token)
    }
    const big = BigInt(token)
    if (big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(big)
    }
    return big
  }

  private parseArray(): unknown[] {
    this.index += 1
    const result: unknown[] = []
    this.skipWhitespace()
    if (this.text[this.index] === ']') {
      this.index += 1
      return result
    }
    while (true) {
      result.push(this.parseValue())
      this.skipWhitespace()
      const ch = this.text[this.index]
      if (ch === ']') {
        this.index += 1
        return result
      }
      if (ch !== ',') {
        throw new SyntaxError(`HawDB JSON 数组缺少逗号或右括号，偏移 ${this.index}`)
      }
      this.index += 1
    }
  }

  private parseObject(): Record<string, unknown> {
    this.index += 1
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    this.skipWhitespace()
    if (this.text[this.index] === '}') {
      this.index += 1
      return result
    }
    while (true) {
      this.skipWhitespace()
      if (this.text[this.index] !== '"') {
        throw new SyntaxError(`HawDB JSON 对象键必须为字符串，偏移 ${this.index}`)
      }
      const key = this.parseString()
      this.skipWhitespace()
      if (this.text[this.index] !== ':') {
        throw new SyntaxError(`HawDB JSON 对象缺少冒号，偏移 ${this.index}`)
      }
      this.index += 1
      result[key] = this.parseValue()
      this.skipWhitespace()
      const ch = this.text[this.index]
      if (ch === '}') {
        this.index += 1
        return result
      }
      if (ch !== ',') {
        throw new SyntaxError(`HawDB JSON 对象缺少逗号或右花括号，偏移 ${this.index}`)
      }
      this.index += 1
    }
  }
}

export function parseLosslessJson(text: string): unknown {
  return new LosslessJsonParser(text).parse()
}
