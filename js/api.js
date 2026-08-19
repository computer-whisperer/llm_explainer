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
  async applyTemplate(messages, { enableThinking = false } = {}) {
    const r = await this._post("/apply-template", {
      messages,
      chat_template_kwargs: { enable_thinking: enableThinking },
    });
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
  async nextToken(prompt, { nProbs = 40, greedy = false, signal } = {}) {
    const body = {
      prompt,
      n_predict: 1,
      n_probs: nProbs,
      cache_prompt: true,
      // pin to one slot: otherwise consecutive steps round-robin across the
      // server's 3 slots and the KV-reuse numbers stop telling a clean story
      id_slot: 0,
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
