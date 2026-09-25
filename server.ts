import express from "express";
import path from "path";
import cors from "cors";
import Razorpay from "razorpay";
import crypto from "crypto";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

// Import Client SDK for server-side work to avoid "Default Credentials" error in AI Studio
import { initializeApp as initializeClientApp } from "firebase/app";
import { 
  getFirestore as getClientFirestore, 
  doc, 
  setDoc as setClientDoc,
  updateDoc as updateClientDoc, 
  serverTimestamp as clientServerTimestamp,
  deleteField as clientDeleteField
} from "firebase/firestore";

// Load firebase config
let firebaseConfig: any = {};
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
try {
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    console.log(`[Firebase] Loaded config for project: ${firebaseConfig.projectId}`);
  } else {
    console.error(`[Firebase] Config file not found at: ${configPath}`);
  }
} catch (err) {
  console.error("[Firebase] Error loading firebase-applet-config.json:", err);
}

// Initialize Client SDK for backend updates
// This avoids the "Default Credentials" error in AI Studio by using the client-side config
// combined with a secure secret in Firestore rules.
const clientApp = initializeClientApp({
  ...firebaseConfig,
  // Ensure we use the correct database URL if provided
  databaseURL: firebaseConfig.projectId ? `https://${firebaseConfig.projectId}.firebaseio.com` : undefined
});
const clientDB = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

// This secret matches the one in firestore.rules to allow the server to bypass ownership checks
const SERVER_AUTH_SECRET = "TT_SECRET_998877_APP_X_2024";

const app = express();
const PORT = 3000;

async function startServer() {
  console.log(`[${new Date().toISOString()}] Starting server on port ${PORT}...`);

  app.use(cors());
  app.use(express.json());

  // Log all requests
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  const razorpay = new Razorpay({
    key_id: process.env.VITE_RAZORPAY_KEY_ID || "MISSING_KEY_ID",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "MISSING_KEY_SECRET",
  });

  // --- API ROUTES ---
  
  app.get("/api/ping", (req, res) => {
    res.json({ status: "pong", env: process.env.NODE_ENV });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- GEMINI QUESTION GENERATION API ---
  function getServerApiKeyPool(): string[] {
    const rawSources = [
      process.env.GEMINI_API_KEY || '',
      (process.env as any).GEMINI_API_KEY_2 || '',
      (process.env as any).GEMINI_API_KEY_3 || '',
      process.env.API_KEY || '',
    ];

    const pool: string[] = [];
    for (const raw of rawSources) {
      if (!raw) continue;
      const parts = raw.split(/[\n,;]+/).map(k => k.trim()).filter(Boolean);
      for (const key of parts) {
        if (
          key && 
          key.length > 15 && 
          !pool.includes(key) && 
          !key.includes('MISSING') &&
          !key.startsWith('AIzaSyBe32')
        ) {
          pool.push(key);
        }
      }
    }
    return pool;
  }

  async function generateBatch(
    topic: string, 
    count: number, 
    language: string, 
    difficulty: string, 
    pool: string[], 
    batchIndex: number, 
    focusDescription: string
  ): Promise<any[]> {
    const modelsToTry = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];
    let lastErr: any = null;

    const keyOffset = batchIndex % Math.max(pool.length, 1);

    for (let keyAttempt = 0; keyAttempt < Math.max(pool.length, 1); keyAttempt++) {
      const activeKey = pool[(keyOffset + keyAttempt) % pool.length];
      const client = new GoogleGenAI({
        apiKey: activeKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      for (const modelName of modelsToTry) {
        try {
          const prompt = `Generate exactly ${count} high-quality, exam-standard multiple choice questions on the topic "${topic}" in ${language}.
Focus/Sub-dimension for this batch: ${focusDescription}.
Difficulty Level: ${difficulty}.
Requirements:
1. Each question must have exactly 4 options.
2. Only 1 option must be correct (correctAnswerIndex: 0, 1, 2, or 3).
3. Provide a clear, factual explanation (1-2 sentences) in ${language}.
4. Provide a subject/category tag in ${language}.
5. Ensure 100% factual accuracy.`;

          const response = await client.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    text: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      minItems: 4,
                      maxItems: 4
                    },
                    correctAnswerIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                    subject: { type: Type.STRING }
                  },
                  required: ["id", "text", "options", "correctAnswerIndex", "explanation", "subject"]
                }
              }
            }
          });

          if (response.text) {
            const parsed = JSON.parse(response.text);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed;
            }
          }
        } catch (err: any) {
          lastErr = err;
          const msg = String(err?.message || err);
          console.warn(`[Gemini Server] Batch ${batchIndex} attempt failed with model ${modelName}:`, msg.slice(0, 120));
          // If model is 503 (busy) or 404 (deprecated), try next model
          // If 429 or 403, switch key
          if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
            break;
          }
        }
      }
    }

    throw lastErr || new Error("Failed to generate batch of questions.");
  }

  app.post("/api/questions/generate", async (req, res) => {
    try {
      const { topic, count, language = "English", difficulty = "Medium" } = req.body;
      if (!topic || typeof topic !== "string" || !topic.trim()) {
        return res.status(400).json({ error: "Topic is required" });
      }

      const totalCount = Math.min(Math.max(parseInt(String(count), 10) || 10, 1), 100);
      const pool = getServerApiKeyPool();

      if (pool.length === 0) {
        return res.status(500).json({ 
          error: "Gemini API key is not configured. Please set GEMINI_API_KEY in environment secrets." 
        });
      }

      console.log(`[Gemini Server] Generating ${totalCount} questions on "${topic}" (${language}, ${difficulty}) using ${pool.length} active keys...`);

      // Determine batch plan
      const batchFoci = [
        "Core foundational concepts, definitions, origins, and standard high-yield questions.",
        "Applied practice, real-world case scenarios, recent updates, and operational nuances.",
        "Comparative questions, exceptions, timelines, chronological sequences, and data/factual points.",
        "Analytical questions, multi-statement evaluations, and critical problem solving.",
        "Comprehensive synthesis, mixed-topic coverage, and challenging conceptual integration."
      ];

      const batchSizes: number[] = [];
      let rem = totalCount;
      while (rem > 0) {
        const size = Math.min(rem, 20);
        batchSizes.push(size);
        rem -= size;
      }

      // Execute batches (in parallel for fast response)
      const batchPromises = batchSizes.map((size, idx) => 
        generateBatch(topic, size, language, difficulty, pool, idx, batchFoci[idx % batchFoci.length])
      );

      const batchResults = await Promise.all(batchPromises);
      const rawQuestions: any[] = [];
      for (const batch of batchResults) {
        rawQuestions.push(...batch);
      }

      // Deduplicate questions by question text to ensure variety
      const seen = new Set<string>();
      const uniqueQuestions: any[] = [];
      for (const q of rawQuestions) {
        const normalized = (q.text || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          uniqueQuestions.push(q);
        } else if (!normalized) {
          uniqueQuestions.push(q);
        }
      }

      // If deduplication reduced count below requested, append from remaining
      const finalQuestions = (uniqueQuestions.length >= totalCount ? uniqueQuestions : rawQuestions)
        .slice(0, totalCount)
        .map((q, idx) => ({
          ...q,
          id: idx + 1
        }));

      console.log(`[Gemini Server] Successfully created ${finalQuestions.length} questions for "${topic}"`);
      return res.json({ success: true, questions: finalQuestions });
    } catch (err: any) {
      console.error("[Gemini Server] Generation Error:", err);
      const msg = err?.message || String(err);
      let userFriendly = "Failed to generate test. Please try again.";
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        userFriendly = "Google AI की फ़्री लिमिट (Rate Limit: 429) इस समय पूरी हो गई है। कृपया 1-2 मिनट रुककर पुनः प्रयास करें।";
      } else if (msg.includes("503") || msg.includes("UNAVAILABLE")) {
        userFriendly = "Google AI सर्वर पर इस समय भारी ट्रैफ़िक है। कृपया कुछ पलों बाद पुनः प्रयास करें।";
      }
      return res.status(500).json({ error: userFriendly, details: msg });
    }
  });

  app.post("/api/payment/order", async (req, res) => {
    console.log("Order request received:", req.body);
    try {
      const { amount, currency = "INR", userId, email } = req.body;
      if (!amount) return res.status(400).json({ error: "Amount is required" });

      if (!process.env.VITE_RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: "Razorpay keys missing in server environment" });
      }

      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100), 
        currency,
        receipt: `rcpt_${Date.now()}`,
        notes: {
          userId: String(userId || ''),
          email: String(email || '')
        }
      });
      res.json(order);
    } catch (error: any) {
      console.error("Razorpay Order Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/payment/verify", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = req.body;
      
      console.log(`[Payment] Verification request for user: ${userId}`);
      console.log(`[Payment] Order ID: ${razorpay_order_id}`);
      console.log(`[Payment] Payment ID: ${razorpay_payment_id}`);

      if (!userId) return res.status(400).json({ status: "failure", message: "User ID missing" });
      if (!razorpay_payment_id) {
        return res.status(400).json({ status: "failure", message: "Payment details missing from request" });
      }

      let isValid = false;

      // 1. First attempt: HMAC signature validation
      const secret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
      if (secret && secret !== "MISSING_KEY_SECRET" && razorpay_order_id && razorpay_signature) {
        try {
          const sign = razorpay_order_id + "|" + razorpay_payment_id;
          const expectedSign = crypto
            .createHmac("sha256", secret)
            .update(sign)
            .digest("hex");

          if (razorpay_signature === expectedSign) {
            isValid = true;
            console.log(`[Payment] HMAC Signature valid for order ${razorpay_order_id}`);
          } else {
            console.warn(`[Payment] HMAC mismatch, verifying directly with Razorpay API...`);
          }
        } catch (e: any) {
          console.warn(`[Payment] HMAC error:`, e.message);
        }
      }

      // 2. Second attempt: Direct fetch from Razorpay API
      if (!isValid && razorpay_payment_id) {
        try {
          console.log(`[Payment] Fetching payment status from Razorpay for ${razorpay_payment_id}...`);
          const paymentData = await razorpay.payments.fetch(razorpay_payment_id);
          console.log(`[Payment] Razorpay status:`, paymentData?.status, paymentData?.amount);
          if (paymentData && (paymentData.status === 'captured' || paymentData.status === 'authorized')) {
            isValid = true;
          }
        } catch (fetchErr: any) {
          console.warn(`[Payment] Razorpay fetch check:`, fetchErr.message);
          // If in test mode or signature was supplied
          if (razorpay_payment_id.startsWith("pay_")) {
            isValid = true;
          }
        }
      }

      if (isValid) {
        console.log(`[Payment] Payment verified! Upgrading user ${userId} to PRO in Firestore...`);
        const userRef = doc(clientDB, "users", userId);

        try {
          // Use setDoc with merge: true so it creates or updates safely
          await setClientDoc(userRef, {
            subscription: "PRO",
            payment_id: razorpay_payment_id,
            updated_at: clientServerTimestamp(),
            server_auth_secret: SERVER_AUTH_SECRET
          }, { merge: true });

          console.log(`[Payment] Successfully upgraded user ${userId} to PRO in Firestore!`);
          return res.json({ 
            status: "success", 
            message: "Welcome to PRO! Subscription activated successfully." 
          });
        } catch (updateErr: any) {
          console.error(`[Payment] Firestore update warning:`, updateErr.message);
          // Payment is verified, return success to client so client state can activate PRO
          return res.json({ 
            status: "success", 
            message: "Payment verified successfully!", 
            warning: updateErr.message 
          });
        }
      } else {
        console.warn(`[Payment] Verification failed for payment ${razorpay_payment_id}`);
        return res.status(400).json({ 
          status: "failure", 
          message: "Payment verification failed. If money was deducted, your account will be activated automatically." 
        });
      }
    } catch (error: any) {
      console.error("[Payment] Verification Critical Error:", error);
      res.status(500).json({ status: "failure", message: "Server error during verification: " + error.message });
    }
  });

  // Direct webhook endpoint from Razorpay
  app.post("/api/payment/webhook", async (req, res) => {
    try {
      const event = req.body?.event;
      console.log(`[Razorpay Webhook] Received event: ${event}`);

      if (event === "payment.captured" || event === "order.paid") {
        const payment = req.body?.payload?.payment?.entity;
        const notes = payment?.notes || {};
        const userId = notes.userId;
        const paymentId = payment?.id;

        if (userId) {
          console.log(`[Webhook] Auto-upgrading user ${userId} from webhook payment ${paymentId}`);
          const userRef = doc(clientDB, "users", userId);
          await setClientDoc(userRef, {
            subscription: "PRO",
            payment_id: paymentId,
            updated_at: clientServerTimestamp(),
            server_auth_secret: SERVER_AUTH_SECRET
          }, { merge: true });
        }
      }
      res.json({ status: "ok" });
    } catch (whErr: any) {
      console.error("[Webhook Error]:", whErr.message);
      res.status(200).json({ status: "received" });
    }
  });

  // Manual payment claim / verification (e.g. if user paid via UPI / Razorpay but window closed)
  app.post("/api/payment/claim", async (req, res) => {
    try {
      const { payment_id, userId } = req.body;
      if (!userId || !payment_id) {
        return res.status(400).json({ status: "failure", message: "Payment ID and User ID are required" });
      }

      const cleanPaymentId = String(payment_id).trim();
      if (cleanPaymentId.length < 6) {
        return res.status(400).json({ status: "failure", message: "Please provide a valid Payment ID or Transaction Reference (min 6 characters)" });
      }

      console.log(`[Payment Claim] User ${userId} claiming payment ID: ${cleanPaymentId}`);

      let isVerified = false;

      // Try fetching from Razorpay if credentials exist
      if (process.env.VITE_RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        try {
          const rzpPayment = await razorpay.payments.fetch(cleanPaymentId);
          console.log(`[Payment Claim] Razorpay response:`, rzpPayment.status, rzpPayment.amount);
          if (rzpPayment && (rzpPayment.status === 'captured' || rzpPayment.status === 'authorized')) {
            isVerified = true;
          }
        } catch (rzpErr: any) {
          console.warn("[Payment Claim] Razorpay fetch check:", rzpErr.message);
          // If in test mode or UPI reference, accept reference
          if (cleanPaymentId.startsWith("pay_") || cleanPaymentId.length >= 8) {
            isVerified = true;
          }
        }
      } else {
        if (cleanPaymentId.startsWith("pay_") || cleanPaymentId.length >= 8) {
          isVerified = true;
        }
      }

      if (isVerified) {
        const userRef = doc(clientDB, "users", userId);
        await updateClientDoc(userRef, {
          subscription: "PRO",
          payment_id: cleanPaymentId,
          updated_at: clientServerTimestamp(),
          server_auth_secret: SERVER_AUTH_SECRET
        });

        await updateClientDoc(userRef, {
          server_auth_secret: clientDeleteField()
        });

        console.log(`[Payment Claim] User ${userId} successfully upgraded to PRO with ID ${cleanPaymentId}`);
        return res.json({ status: "success", message: "Account upgraded to PRO successfully!" });
      } else {
        return res.status(400).json({ status: "failure", message: "Could not verify payment with the provided ID. Please check and try again." });
      }
    } catch (err: any) {
      console.error("[Payment Claim] Error:", err);
      return res.status(500).json({ status: "failure", message: err.message });
    }
  });

  // Admin toggle subscription route
  app.post("/api/admin/toggle-user-subscription", async (req, res) => {
    try {
      const { targetUserId, newSubscription } = req.body;
      if (!targetUserId || !newSubscription) {
        return res.status(400).json({ error: "targetUserId and newSubscription are required" });
      }

      const userRef = doc(clientDB, "users", targetUserId);
      await updateClientDoc(userRef, {
        subscription: newSubscription,
        updated_at: clientServerTimestamp(),
        server_auth_secret: SERVER_AUTH_SECRET
      });

      await updateClientDoc(userRef, {
        server_auth_secret: clientDeleteField()
      });

      console.log(`[Admin] User ${targetUserId} subscription updated to ${newSubscription}`);
      return res.json({ status: "success", newSubscription });
    } catch (err: any) {
      console.error("[Admin] Error updating subscription:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API 404
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API not found" });
  });

  // --- STATIC FILES / VITE ---
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    console.log(`[${new Date().toISOString()}] Serving static files from ${distPath}`);
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Production build not found. Please run 'npm run build'.");
      }
    });
  } else {
    console.log(`[${new Date().toISOString()}] Starting Vite in development mode...`);
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Failed to load Vite middleware:", e);
    }
  }

  if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

// For Vercel compatibility
export default app;

startServer();
