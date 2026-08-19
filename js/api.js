// Thin client for the llama.cpp server's native API.

const DEFAULT_URL = "https://llama-gemma-4.cjbal.com";

export class LlamaClient {
  constructor() {
    this.baseUrl = localStorage.getItem("llm-explainer-server") || DEFAULT_URL;
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/+$/, "");
    localStorage.setItem("llm-explainer-server", this.baseUrl);
  }

  async _post(path, body, signal) {
    const res = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  }

  // Render the model's chat template server-side. Thinking is disabled by
  // closing the thought channel, so completions continue prose, not reasoning.
  async applyTemplate(messages, { enableThinking = false, tools } = {}) {
    const body = {
      messages,
      chat_template_kwargs: { enable_thinking: enableThinking },
    };
    if (tools) body.tools = tools;
    const r = await this._post("/apply-template", body);
    return r.prompt;
  }

  async props() {
    const res = await fetch(this.baseUrl + "/props");
    if (!res.ok) throw new Error(`/props → HTTP ${res.status}`);
    return res.json();
  }

  // → [{id, piece}] ; piece is a string, or a byte array for partial-UTF8 tokens
  async tokenize(content, { addSpecial = false } = {}) {
    const r = await this._post("/tokenize", {
      content,
      with_pieces: true,
      add_special: addSpecial,
    });
    return r.tokens;
  }

  // One step of the loop: real logits for the next position.
  // Returns { sampled: {token, id, logprob}, top: [{id, token, prob, logprob}],
  //           timings, stopType }
  async nextToken(prompt, { nProbs = 40, greedy = false, slot = 0, signal } = {}) {
    const body = {
      prompt,
      n_predict: 1,
      n_probs: nProbs,
      cache_prompt: true,
      // pin to one slot: otherwise consecutive steps round-robin across the
      // server's 3 slots and the KV-reuse numbers stop telling a clean story.
      // Scenes use distinct slots so their caches survive scene switches.
      id_slot: slot,
    };
    if (greedy) body.temperature = 0;
    const r = await this._post("/completion", body, signal);
    const cp = (r.completion_probabilities || [])[0];
    const top = (cp?.top_logprobs || []).map((t) => ({
      id: t.id,
      token: t.token,
      logprob: t.logprob,
      prob: Math.exp(t.logprob),
    }));
    return {
      sampled: cp
        ? { token: cp.token, id: cp.id, logprob: cp.logprob }
        : { token: r.content, id: null, logprob: null },
      top,
      timings: r.timings,
      stopType: r.stop_type,
    };
  }
}

// Streaming completion. Calls onToken(text) per generated piece; resolves with
// { content, stopType, stoppingWord, timings }. `stop` strings let the caller
// halt generation at markers (e.g. the end of a tool call).
export async function streamCompletion(
  client,
  prompt,
  { stop = [], slot = 0, nProbs = 0, greedy = false, signal, onToken } = {}
) {
  const body = {
    prompt,
    n_predict: 1024,
    cache_prompt: true,
    id_slot: slot,
    stream: true,
    stop,
  };
  if (nProbs) body.n_probs = nProbs;
  if (greedy) body.temperature = 0;
  const res = await fetch(client.baseUrl + "/completion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`/completion → HTTP ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  let final = {};
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop(); // keep incomplete tail
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const d = JSON.parse(line.slice(6));
      if (d.content) {
        content += d.content;
        // with nProbs, each chunk carries this token's chosen logprob + top-k
        onToken?.(d.content, d.completion_probabilities?.[0]);
      }
      if (d.stop) final = d;
    }
  }
  return {
    content,
    stopType: final.stop_type,
    stoppingWord: final.stopping_word || "",
    timings: final.timings,
  };
}

// Entropy (bits) of the next-token distribution, from the top-k probs with the
// unreturned tail lumped as one residual outcome. Exact when the tail is tiny;
// a mild underestimate when the true tail is spread wide.
export function entropyBits(top) {
  let sum = 0;
  let h = 0;
  for (const t of top) {
    if (t.prob > 0) {
      h -= t.prob * Math.log2(t.prob);
      sum += t.prob;
    }
  }
  const tail = 1 - sum;
  if (tail > 1e-6) h -= tail * Math.log2(tail);
  return h;
}
