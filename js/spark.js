// Shared entropy sparkline: 2px line, hairline gridlines at whole bits,
// end-dot with a surface ring.
export function drawSpark(svg, values, { color = "#199e70", minMax = 4 } = {}) {
  const w = svg.clientWidth || 300;
  const h = svg.clientHeight || 72;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.replaceChildren();
  const ns = "http://www.w3.org/2000/svg";
  const yMax = Math.max(minMax, ...values) * 1.08;
  const pad = 6;
  const y = (v) => h - pad - (v / yMax) * (h - 2 * pad);
  const x = (i) => (values.length > 1 ? pad + (i / (values.length - 1)) * (w - 2 * pad) : w / 2);

  for (let g = 0; g <= yMax; g += 1) {
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", 0);
    line.setAttribute("x2", w);
    line.setAttribute("y1", y(g));
    line.setAttribute("y2", y(g));
    line.setAttribute("stroke", g === 0 ? "#383835" : "#2c2c2a");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);
  }
  if (!values.length) return;

  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("points", values.map((v, i) => `${x(i)},${y(v)}`).join(" "));
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linejoin", "round");
  line.setAttribute("stroke-linecap", "round");
  svg.appendChild(line);

  const dot = document.createElementNS(ns, "circle");
  dot.setAttribute("cx", x(values.length - 1));
  dot.setAttribute("cy", y(values[values.length - 1]));
  dot.setAttribute("r", "4.5");
  dot.setAttribute("fill", color);
  dot.setAttribute("stroke", "#1a1a19");
  dot.setAttribute("stroke-width", "2");
  svg.appendChild(dot);
}
