import type { AwsCall } from '../shared/aws';

/**
 * An in-memory DynamoDB for the sync handlers' tests: one table with a string
 * partition and sort key and number-sorted local secondary indexes. It
 * implements the operations and the expression grammar the handlers use, with
 * DynamoDB's semantics: conditions, all-or-nothing transactions that cancel
 * with `TransactionCanceledException`, paged queries and the item size limit.
 *
 * `before` runs ahead of each call, so a test can interleave a concurrent
 * write or inject a failure at an exact point.
 */
export interface FakeDynamoOptions {
  tableName: string;
  partitionKey: string;
  sortKey: string;
  /** Index name → its number sort key. */
  indexes?: Record<string, string>;
  /** Most items one Query page returns, standing in for the 1 MB page limit. */
  pageItems?: number;
  before?: (operation: string, input: Record<string, unknown>) => void | Promise<void>;
}

export type AttrValue = { S: string } | { N: string } | { BOOL: boolean };
export type Item = Record<string, AttrValue>;

export interface FakeDynamo {
  call: AwsCall;
  /** Every item, keyed by `partition\0sort`. Tests may read and edit it. */
  items: Map<string, Item>;
  /** Operation names in call order. */
  log: string[];
}

const MAX_ITEM_BYTES = 400 * 1024;

function failure(name: string, message = name, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { name }, extra);
}

export function fakeDynamo(options: FakeDynamoOptions): FakeDynamo {
  const { tableName, partitionKey: pk, sortKey: sk } = options;
  const indexes = options.indexes ?? {};
  const items = new Map<string, Item>();
  const log: string[] = [];

  const keyOf = (key: Record<string, unknown>): string => {
    const p = key[pk] as { S?: string } | undefined;
    const s = key[sk] as { S?: string } | undefined;
    if (typeof p?.S !== 'string' || typeof s?.S !== 'string') {
      throw failure('ValidationException', 'The key is missing or not a string');
    }
    return `${p.S}\u0000${s.S}`;
  };
  const checkTable = (input: Record<string, unknown>) => {
    if (input.TableName !== tableName) throw failure('ResourceNotFoundException');
  };
  const checkItem = (item: Item) => {
    if (JSON.stringify(item).length > MAX_ITEM_BYTES) {
      throw failure('ValidationException', 'Item size has exceeded the maximum allowed size');
    }
    for (const attr of Object.values(indexes)) {
      if (item[attr] && !('N' in item[attr])) throw failure('ValidationException');
    }
  };
  const ctx = (input: Record<string, unknown>): ExprContext => ({
    names: (input.ExpressionAttributeNames ?? {}) as Record<string, string>,
    values: (input.ExpressionAttributeValues ?? {}) as Record<string, AttrValue>,
  });
  const conditionHolds = (input: Record<string, unknown>, item: Item | undefined): boolean =>
    typeof input.ConditionExpression !== 'string' ||
    evaluate(parse(input.ConditionExpression), item ?? {}, ctx(input));

  /** One write, checked but not applied: returns how to apply it. */
  const prepare = (kind: string, input: Record<string, unknown>): [string, () => void] => {
    checkTable(input);
    if (kind === 'Put') {
      const item = input.Item as Item;
      const key = keyOf(item);
      if (!conditionHolds(input, items.get(key))) return [key, failed];
      checkItem(item);
      return [key, () => items.set(key, structuredClone(item))];
    }
    const key = keyOf(input.Key as Record<string, unknown>);
    const current = items.get(key);
    if (!conditionHolds(input, current)) return [key, failed];
    if (kind === 'Delete') return [key, () => items.delete(key)];
    if (kind === 'ConditionCheck') return [key, () => {}];
    const next = applyUpdate(
      structuredClone(current ?? (input.Key as Item)),
      String(input.UpdateExpression),
      ctx(input),
    );
    checkItem(next);
    return [key, () => items.set(key, next)];
  };

  const operations: Record<string, (input: Record<string, unknown>) => unknown> = {
    GetItem(input) {
      checkTable(input);
      const item = items.get(keyOf(input.Key as Record<string, unknown>));
      return item ? { Item: structuredClone(item) } : {};
    },
    PutItem: (input) => single('Put', input),
    UpdateItem: (input) => single('Update', input),
    DeleteItem: (input) => single('Delete', input),
    TransactGetItems(input) {
      const gets = input.TransactItems as { Get: Record<string, unknown> }[];
      if (gets.length > 100) throw failure('ValidationException', 'Too many items');
      return {
        Responses: gets.map(({ Get }) => {
          checkTable(Get);
          const item = items.get(keyOf(Get.Key as Record<string, unknown>));
          return item ? { Item: structuredClone(item) } : {};
        }),
      };
    },
    TransactWriteItems(input) {
      const writes = input.TransactItems as Record<string, Record<string, unknown>>[];
      if (writes.length > 100) throw failure('ValidationException', 'Too many items');
      const seen = new Set<string>();
      const prepared = writes.map((w) => {
        const [kind, body] = Object.entries(w)[0]!;
        const [key, apply] = prepare(kind, body);
        if (seen.has(key)) {
          throw failure('ValidationException', 'Transaction has more than one op on an item');
        }
        seen.add(key);
        return apply;
      });
      if (prepared.includes(failed)) {
        throw failure('TransactionCanceledException', 'Transaction cancelled', {
          CancellationReasons: prepared.map((p) => ({
            Code: p === failed ? 'ConditionalCheckFailed' : 'None',
          })),
        });
      }
      for (const apply of prepared) apply();
      return {};
    },
    BatchWriteItem(input) {
      const requests = Object.entries(
        input.RequestItems as Record<string, Record<string, { Key?: Item; Item?: Item }>[]>,
      );
      if (requests.flatMap(([, r]) => r).length > 25) throw failure('ValidationException');
      for (const [table, rs] of requests) {
        for (const r of rs) {
          const [kind, body] = Object.entries(r)[0]!;
          if (kind === 'DeleteRequest') single('Delete', { TableName: table, Key: body.Key });
          else single('Put', { TableName: table, Item: body.Item });
        }
      }
      return { UnprocessedItems: {} };
    },
    Query(input) {
      checkTable(input);
      const index = input.IndexName as string | undefined;
      const sortAttr = index ? indexes[index] : sk;
      if (!sortAttr) throw failure('ValidationException', `No index ${index}`);
      const c = ctx(input);
      const condition = parse(String(input.KeyConditionExpression));
      const sortValue = (item: Item) => {
        const v = item[sortAttr]!;
        return 'N' in v ? Number(v.N) : 'S' in v ? v.S : '';
      };
      let matched = [...items.values()]
        .filter((item) => item[sortAttr] && evaluate(condition, item, c))
        .sort((a, b) => compare(sortValue(a), sortValue(b)));
      if (input.ScanIndexForward === false) matched.reverse();
      const start = input.ExclusiveStartKey as Item | undefined;
      if (start) {
        const at = matched.findIndex((item) => keyOf(item) === keyOf(start));
        matched = matched.slice(at + 1);
      }
      const limit = Number(input.Limit ?? Infinity);
      const page = matched.slice(0, Math.min(limit, options.pageItems ?? Infinity));
      const last = page.at(-1);
      const projection =
        typeof input.ProjectionExpression === 'string'
          ? input.ProjectionExpression.split(',').map((p) => resolveName(p.trim(), c))
          : undefined;
      const project = (item: Item): Item =>
        projection
          ? Object.fromEntries(Object.entries(item).filter(([k]) => projection.includes(k)))
          : structuredClone(item);
      return {
        Items: page.map(project),
        Count: page.length,
        // A key when the page was cut short, and whenever it stopped at `Limit`,
        // even at the end, as DynamoDB does.
        ...(last && (page.length < matched.length || page.length === limit)
          ? {
              LastEvaluatedKey: {
                [pk]: last[pk],
                [sk]: last[sk],
                ...(index ? { [sortAttr]: last[sortAttr] } : {}),
              },
            }
          : {}),
      };
    },
  };

  function single(kind: string, input: Record<string, unknown>): unknown {
    const [, apply] = prepare(kind, input);
    if (apply === failed) throw failure('ConditionalCheckFailedException');
    apply();
    return {};
  }

  return {
    items,
    log,
    async call(operation, input) {
      log.push(operation);
      await options.before?.(operation, input);
      const op = operations[operation];
      if (!op) throw new Error(`fakeDynamo has no ${operation}`);
      return structuredClone(op(structuredClone(input)));
    },
  };
}

function failed(): void {}

// --- Expressions ---------------------------------------------------------------

interface ExprContext {
  names: Record<string, string>;
  values: Record<string, AttrValue>;
}

type Expr =
  | { op: 'or' | 'and'; left: Expr; right: Expr }
  | { op: 'not'; inner: Expr }
  | { op: 'exists' | 'not_exists'; path: string }
  | { op: 'cmp'; cmp: string; left: string; right: string }
  | { op: 'between'; subject: string; low: string; high: string };

const TOKEN = /\s*(<>|<=|>=|[=<>(),]|[#:]?[A-Za-z_][\w]*)/y;

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.trimEnd().length) {
    const m = TOKEN.exec(text);
    if (!m) throw failure('ValidationException', `Bad expression: ${text}`);
    tokens.push(m[1]!);
  }
  return tokens;
}

/** Conditions: OR, AND, NOT, parentheses, comparisons, BETWEEN and attribute_(not_)exists. */
function parse(text: string): Expr {
  const tokens = tokenize(text);
  let i = 0;
  const peek = () => tokens[i]?.toUpperCase();
  const take = (expected?: string) => {
    const t = tokens[i++];
    if (t === undefined || (expected && t.toUpperCase() !== expected)) {
      throw failure('ValidationException', `Bad expression: ${text}`);
    }
    return t;
  };
  const or = (): Expr => {
    let left = and();
    while (peek() === 'OR') {
      take();
      left = { op: 'or', left, right: and() };
    }
    return left;
  };
  const and = (): Expr => {
    let left = factor();
    while (peek() === 'AND') {
      take();
      left = { op: 'and', left, right: factor() };
    }
    return left;
  };
  const factor = (): Expr => {
    const t = peek();
    if (t === 'NOT') {
      take();
      return { op: 'not', inner: factor() };
    }
    if (t === '(') {
      take();
      const inner = or();
      take(')');
      return inner;
    }
    if (t === 'ATTRIBUTE_EXISTS' || t === 'ATTRIBUTE_NOT_EXISTS') {
      take();
      take('(');
      const path = take();
      take(')');
      return { op: t === 'ATTRIBUTE_EXISTS' ? 'exists' : 'not_exists', path };
    }
    const left = take();
    if (peek() === 'BETWEEN') {
      take();
      const low = take();
      take('AND');
      return { op: 'between', subject: left, low, high: take() };
    }
    const cmp = take();
    return { op: 'cmp', cmp, left, right: take() };
  };
  const expr = or();
  if (i !== tokens.length) throw failure('ValidationException', `Bad expression: ${text}`);
  return expr;
}

function resolveName(token: string, c: ExprContext): string {
  if (!token.startsWith('#')) return token;
  const name = c.names[token];
  if (name === undefined) throw failure('ValidationException', `Unknown name ${token}`);
  return name;
}

function operand(token: string, item: Item, c: ExprContext): AttrValue | undefined {
  if (token.startsWith(':')) {
    const value = c.values[token];
    if (value === undefined) throw failure('ValidationException', `Unknown value ${token}`);
    return value;
  }
  return item[resolveName(token, c)];
}

function scalar(value: AttrValue | undefined): string | number | boolean | undefined {
  if (!value) return undefined;
  if ('N' in value) return Number(value.N);
  if ('S' in value) return value.S;
  return value.BOOL;
}

function compare(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function evaluate(expr: Expr, item: Item, c: ExprContext): boolean {
  switch (expr.op) {
    case 'or':
      return evaluate(expr.left, item, c) || evaluate(expr.right, item, c);
    case 'and':
      return evaluate(expr.left, item, c) && evaluate(expr.right, item, c);
    case 'not':
      return !evaluate(expr.inner, item, c);
    case 'exists':
      return item[resolveName(expr.path, c)] !== undefined;
    case 'not_exists':
      return item[resolveName(expr.path, c)] === undefined;
    case 'between': {
      const v = scalar(operand(expr.subject, item, c));
      const lo = scalar(operand(expr.low, item, c));
      const hi = scalar(operand(expr.high, item, c));
      if (v === undefined || typeof v === 'boolean') return false;
      return compare(v, lo as number) >= 0 && compare(v, hi as number) <= 0;
    }
    case 'cmp': {
      const a = scalar(operand(expr.left, item, c));
      const b = scalar(operand(expr.right, item, c));
      if (a === undefined || b === undefined) return expr.cmp === '<>';
      if (expr.cmp === '=') return a === b;
      if (expr.cmp === '<>') return a !== b;
      if (typeof a !== typeof b || typeof a === 'boolean') return false;
      const order = compare(a as number, b as number);
      return { '<': order < 0, '<=': order <= 0, '>': order > 0, '>=': order >= 0 }[expr.cmp]!;
    }
  }
}

/** `SET a = :x, #b = :y` and `REMOVE c, d` clauses. */
function applyUpdate(item: Item, text: string, c: ExprContext): Item {
  const clauses = text.split(/\b(SET|REMOVE)\b/i).map((s) => s.trim());
  for (let i = 1; i < clauses.length; i += 2) {
    const action = clauses[i]!.toUpperCase();
    for (const part of clauses[i + 1]!.split(',')) {
      if (action === 'REMOVE') {
        delete item[resolveName(part.trim(), c)];
        continue;
      }
      const [path, value] = part.split('=').map((s) => s.trim());
      const v = operand(value!, item, c);
      if (!v) throw failure('ValidationException', `Bad update: ${text}`);
      item[resolveName(path!, c)] = v;
    }
  }
  return item;
}
