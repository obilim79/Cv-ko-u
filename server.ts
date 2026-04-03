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

  // API Routes
  app.post("/api/generate-questions", async (req, res) => {
    const { parts, systemPrompt } = req.body;
    
    try {
      // AI Studio platformu anahtarı process.env.GEMINI_API_KEY olarak enjekte eder.
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (apiKey) {
        console.log(`API Anahtarı yüklendi (İlk 4 karakter: ${apiKey.substring(0, 4)}...)`);
      }

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
        console.error("HATA: GEMINI_API_KEY bulunamadı veya varsayılan değerde kaldı.");
        return res.status(500).json({ 
          error: "API Anahtarı Yapılandırılmamış. Lütfen Secrets panelinden GEMINI_API_KEY değerini girin." 
        });
      }

      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
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
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (apiKey) {
        console.log(`API Anahtarı yüklendi (İlk 4 karakter: ${apiKey.substring(0, 4)}...)`);
      }

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
        return res.status(500).json({ 
          error: "API Anahtarı Yapılandırılmamış. Lütfen Secrets panelinden GEMINI_API_KEY değerini girin." 
        });
      }

      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
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
