(() => {
  const btn = document.getElementById("btnRefine");
  const statusEl = document.getElementById("status");
  const outputEl = document.getElementById("output");

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  const issueKey = qs("issueKey");

  function setStatus(msg) {
    statusEl.textContent = msg;
  }
  function setLoading(isLoading) {
    btn.disabled = isLoading;
    btn.textContent = isLoading ? "⏳ Working..." : "✨ Refine with Gemini";
  }

  // ✅ ADF (Jira description) -> plain text
  function adfToText(node) {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(adfToText).join("");

    if (node.type === "text") return node.text || "";
    if (node.type === "hardBreak") return "\n";

    const blockTypes = new Set(["paragraph", "heading", "blockquote", "listItem"]);
    const txt = adfToText(node.content || []);
    return blockTypes.has(node.type) ? txt + "\n" : txt;
  }

  function getIssue(issueKey) {
    return new Promise((resolve, reject) => {
      if (!window.AP) return reject(new Error("AP is not available (open inside Jira)."));

      AP.request({
        url: `/rest/api/3/issue/${issueKey}?fields=summary,description`,
        type: "GET",
        success: (responseText) => {
          try {
            resolve(JSON.parse(responseText));
          } catch (e) {
            reject(e);
          }
        },
        error: (err) => reject(err),
      });
    });
  }

  async function callGemini(prompt) {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Gemini API failed (${res.status})`);
    return data.response || "";
  }

  btn.addEventListener("click", async () => {
    if (!issueKey) return setStatus("❌ Missing issueKey in URL");

    try {
      setLoading(true);
      outputEl.value = "";

      setStatus("1/3 Reading Jira description…");
      const issue = await getIssue(issueKey);

      const summary = issue?.fields?.summary || "";
      const descText = adfToText(issue?.fields?.description).trim();

      setStatus("2/3 Calling Gemini with Jira description…");
      const prompt =
        `Rewrite this Jira ticket in a structured professional format.\n\n` +
        `Format:\n1. Problem Summary\n2. Background\n3. Expected Outcome\n4. Acceptance Criteria\n\n` +
        `Issue Key: ${issueKey}\n` +
        `Summary: ${summary}\n\n` +
        `Description:\n${descText || "(empty)"}`;

      const result = await callGemini(prompt);

      outputEl.value = result;
      setStatus("✅ Done. Gemini output generated.");
    } catch (e) {
      console.error(e);
      setStatus("❌ " + (e?.message || "Failed"));
    } finally {
      setLoading(false);
    }
  });

  setStatus("Ready. Click button to refine Jira description.");
})();
