function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const issueKey = qs("issueKey");

const metaEl = document.getElementById("meta");
const statusEl = document.getElementById("status");
const currentDescEl = document.getElementById("currentDesc");
const refinedDescEl = document.getElementById("refinedDesc");
const btnRefine = document.getElementById("btnRefine");
const btnUpdate = document.getElementById("btnUpdate");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function setLoading(isLoading) {
  btnRefine.disabled = isLoading;
  btnRefine.textContent = isLoading ? "⏳ Refining..." : "✨ Refine with Gemini";
}

async function loadIssueDescription() {
  if (!issueKey) {
    metaEl.textContent = "❌ Missing issueKey in URL";
    return;
  }

  metaEl.textContent = `Issue: ${issueKey}`;

  // Fetch issue from Jira using AP.request (runs inside Jira iframe)
  AP.request({
    url: `/rest/api/3/issue/${issueKey}?fields=description,summary`,
    type: "GET",
    success: function (responseText) {
      const issue = JSON.parse(responseText);
      const desc = issue?.fields?.description;

      // Jira Cloud description is usually ADF (object), not plain string
      // For demo: show JSON if it's object
      if (typeof desc === "string") {
        currentDescEl.value = desc || "";
      } else {
        currentDescEl.value = desc ? JSON.stringify(desc, null, 2) : "";
      }

      setStatus("✅ Loaded issue description.");
    },
    error: function (err) {
      setStatus("❌ Failed to load issue. Check permissions/scopes.");
      console.error(err);
    },
  });
}

btnRefine.addEventListener("click", async () => {
  try {
    if (!issueKey) return;

    setLoading(true);
    setStatus("Calling backend → Gemini…");

    const payload = {
      issueKey,
      description: currentDescEl.value,
    };

    // Calls YOUR backend endpoint (same baseUrl domain)
    const res = await fetch("/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Refine failed");

    refinedDescEl.value = data.refinedText || "";
    btnUpdate.disabled = !data.refinedText;

    setStatus("✅ Gemini output received.");
  } catch (e) {
    console.error(e);
    setStatus("❌ " + e.message);
  } finally {
    setLoading(false);
  }
});

btnUpdate.addEventListener("click", () => {
  const refined = refinedDescEl.value?.trim();
  if (!refined) return;

  setStatus("Updating Jira issue description…");

  // IMPORTANT:
  // Jira Cloud expects description as ADF, not plain string.
  // For a quick demo, we’ll write a very simple ADF doc with one paragraph.
  const adf = {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: refined }] }
    ],
  };

  AP.request({
    url: `/rest/api/3/issue/${issueKey}`,
    type: "PUT",
    contentType: "application/json",
    data: JSON.stringify({ fields: { description: adf } }),
    success: function () {
      setStatus("✅ Jira description updated!");
    },
    error: function (err) {
      console.error(err);
      setStatus("❌ Update failed (check WRITE scope + permissions).");
    },
  });
});

loadIssueDescription();
