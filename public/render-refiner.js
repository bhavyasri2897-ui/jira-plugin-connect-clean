// public/render-refiner.js
(() => {
  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  const issueKey = qs("issueKey");

  const btn = document.getElementById("btnRefine");
  const statusEl = document.getElementById("status");
  const outputEl = document.getElementById("output");

  if (!btn || !statusEl || !outputEl) {
    console.error("Missing UI elements");
    return;
  }

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function setLoading(v) {
    btn.disabled = v;
    btn.textContent = v ? "⏳ Working..." : "✨ Refine with Gemini";
  }

  // ✅ Convert Jira ADF → plain text
  function adfToText(node) {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(adfToText).join("");

    if (node.type === "text") return node.text || "";
    if (node.type === "hardBreak") return "\n";

    return adfToText(node.content || []);
  }

  // ✅ Fetch Jira issue summary + description
  function getIssue(issueKey) {
    return new Promise((resolve, reject) => {
      if (!window.AP) return reject(new Error("AP not available (open inside Jira)."));

      AP.request({
        url: `/rest/api/3/issue/${issueKey}?fields=summary,description`,
        type: "GET",
        success: (resText) => {
          try {
            resolve(JSON.parse(resText));
          } catch (e) {
            reject(e);
          }
        },
        error: (err) => reject(err)
      });
    });
  }

  // ✅ Call your backend Gemini API
  async function callGemini(prompt) {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Gemini failed (${res.status})`);

    return data.response || "";
  }

  btn.addEventListener("click", async () => {
    if (!issueKey) {
      setStatus("❌ issueKey missing in URL");
      return;
    }

    try {
      setLoading(true);
      outputEl.value = "";

      setStatus("1/3 Reading Jira description…");
      const issue = await getIssue(issueKey);

      const summary = issue?.fields?.summary || "";
      const description = adfToText(issue?.fields?.description).trim();

      setStatus("2/3 Calling Gemini…");
      const prompt = `Rewrite this Jira ticket professionally.

Format:
1. Problem Summary
2. Background
3. Expected Outcome
4. Acceptance Criteria

Issue Key: ${issueKey}
Summary: ${summary}

Description:
${description || "(empty)"}
`;

      const out = await callGemini(prompt);

      outputEl.value = out;
      setStatus("✅ Done.");
    } catch (e) {
      console.error(e);
      setStatus("❌ " + (e?.message || "Gemini call failed"));
    } finally {
      setLoading(false);
    }
  });

  setStatus("Ready. Click the button.");
})();
