import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const MODEL_NAME = "gemini-3-flash-preview";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.get("/api/debug-key", (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({ status: "error", message: "GEMINI_API_KEY bulunamadı." });
    }
    if (apiKey === "MY_GEMINI_API_KEY") {
      return res.json({ status: "warning", message: "Varsayılan placeholder değer duruyor." });
    }
    return res.json({ 
      status: "ok", 
      length: apiKey.length, 
      prefix: apiKey.substring(0, 4) + "...",
      suffix: "..." + apiKey.substring(apiKey.length - 4)
    });
  });

  // API Routes
  app.post("/api/generate-questions", async (req, res) => {
    const { parts, systemPrompt } = req.body;
    
    try {
      // AI Studio platformu anahtarı process.env.GEMINI_API_KEY olarak enjekte eder.
      let apiKey = process.env.GEMINI_API_KEY;
      
      // Anahtarı temizle: Tırnak işaretlerini ve boşlukları kaldır
      if (apiKey) {
        apiKey = apiKey.trim().replace(/^["']|["']$/g, '');
      }
      
      if (apiKey) {
        console.log(`API Anahtarı temizlendi ve yüklendi (Karakter sayısı: ${apiKey.length})`);
      }

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "") {
        console.error("HATA: GEMINI_API_KEY bulunamadı veya geçersiz.");
        return res.status(500).json({ 
          error: "API Anahtarı Yapılandırılamadı. Lütfen Secrets panelini kontrol edin." 
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [{ parts }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json"
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "An error occurred while calling Gemini API." });
    }
  });

  app.post("/api/analyze-cv", async (req, res) => {
    const { parts, systemPrompt } = req.body;
    
    try {
      let apiKey = process.env.GEMINI_API_KEY;
      
      if (apiKey) {
        apiKey = apiKey.trim().replace(/^["']|["']$/g, '');
      }

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "") {
        return res.status(500).json({ 
          error: "API Anahtarı Yapılandırılamadı. Lütfen Secrets panelini kontrol edin." 
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [{ parts }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json"
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "An error occurred while calling Gemini API." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = await fs.promises.readFile(
          path.resolve(process.cwd(), "index.html"),
          "utf-8"
        );
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
