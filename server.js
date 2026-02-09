const express = require("express");
const path = require("path");
require("dotenv").config();

const fetchFn =
  global.fetch ||
  ((...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args)));

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL;

app.use("/public", express.static(path.join(__dirname, "public")));

// Serve the panel page
app.get("/render-refiner", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "render-refiner.html"));
});

// Gemini route (uses env vars on Render)
app.post("/api/gemini", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: "prompt required" });

    const API_KEY = process.env.GEMINI_API_KEY;
    const MODEL = process.env.GEMINI_MODEL; // set in Render

    if (!API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY missing" });
    if (!MODEL) return res.status(500).json({ error: "GEMINI_MODEL missing" });

    const isBidi = MODEL.includes("native-audio-preview");
    const method = isBidi ? "bidiGenerateContent" : "generateContent";

    const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:${method}`;

    const r = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      })
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.error?.message || "Gemini API error",
        details: data
      });
    }

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p?.text)
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!text) return res.status(502).json({ error: "No text returned", details: data });

    res.json({ response: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gemini call crashed", details: String(err) });
  }
});

app.listen(PORT, () => console.log("Running on", PORT));
