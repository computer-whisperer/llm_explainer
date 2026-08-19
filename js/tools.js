// The "harness side" of tool calling: definitions the model is told about,
// plus the local implementations that actually run. The whole point of the
// demo is that this is ordinary software watching the token stream for an
// agreed-upon format — no special machinery inside the model.

// Safe arithmetic evaluator: + - * / ^ % ( ) and numbers. No eval().
function calc(expr) {
  const tokens = expr.match(/\d+\.?\d*|[+\-*/^%()]|\S/g) || [];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function primary() {
    const t = next();
    if (t === "(") {
      const v = addsub();
      if (next() !== ")") throw new Error("missing )");
      return v;
    }
    if (t === "-") return -primary();
    if (t === "+") return primary();
    if (/^\d/.test(t ?? "")) return parseFloat(t);
    throw new Error(`unexpected "${t ?? "end"}"`);
  }
  function power() {
    const base = primary();
    if (peek() === "^") { next(); return base ** power(); }
    return base;
  }
  function muldiv() {
    let v = power();
    while (peek() !== undefined && "*/%".includes(peek())) {
      const op = next(), r = power();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function addsub() {
    let v = muldiv();
    while (peek() === "+" || peek() === "-") {
      const op = next(), r = muldiv();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const v = addsub();
  if (pos !== tokens.length) throw new Error(`unexpected "${peek()}"`);
  return v;
}

const CONDITIONS = ["clear skies", "light rain", "overcast", "scattered clouds", "fog", "drizzle"];

export const TOOLS = [
  {
    name: "calculator",
    describe: (a) => `calculator(${a.expression})`,
    definition: {
      type: "function",
      function: {
        name: "calculator",
        description: "Evaluate an arithmetic expression and return the numeric result.",
        parameters: {
          type: "object",
          properties: { expression: { type: "string", description: "e.g. 2*(3+4)" } },
          required: ["expression"],
        },
      },
    },
    run: (args) => {
      try {
        return String(calc(args.expression ?? ""));
      } catch (e) {
        return `error: ${e.message}`;
      }
    },
  },
  {
    name: "get_current_time",
    describe: () => "get_current_time()",
    definition: {
      type: "function",
      function: {
        name: "get_current_time",
        description: "Get the current local date and time.",
        parameters: { type: "object", properties: {} },
      },
    },
    run: () => new Date().toString(),
  },
  {
    name: "get_weather",
    describe: (a) => `get_weather(${a.city})`,
    definition: {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get the current weather for a city.",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    },
    // Canned: the harness can hand the model anything, and the model just
    // believes the document. (Deterministic per city so re-rolls match.)
    run: (args) => {
      const city = args.city || "somewhere";
      let h = 0;
      for (const c of city) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const temp = 4 + (h % 26);
      return `${temp}°C, ${CONDITIONS[h % CONDITIONS.length]}`;
    },
  },
];

export function getTool(name) {
  return TOOLS.find((t) => t.name === name);
}

// Parse the model's call text, e.g.:  call:calculator{expression:<|"|>374*4498<|"|>}
export function parseToolCall(text) {
  const m = text.match(/call:([\w.-]+)\s*\{(.*)\}\s*$/s);
  if (!m) return null;
  const args = {};
  const argRe = /([\w.-]+)\s*:\s*(?:<\|"\|>(.*?)<\|"\|>|([^,{}]+))/gs;
  for (const a of m[2].matchAll(argRe)) args[a[1]] = (a[2] ?? a[3] ?? "").trim();
  return { name: m[1], args, raw: text };
}

// Render a result in the format the template uses for tool responses.
export function formatToolResponse(name, result) {
  return `<|tool_response>response:${name}{value:<|"|>${result}<|"|>}<tool_response|>`;
}
