import express from "express";
import path from "path";
import cors from "cors";
import Razorpay from "razorpay";
import crypto from "crypto";
import fs from "fs";

// Import Client SDK for server-side work to avoid "Default Credentials" error
import { initializeApp as initializeClientApp } from "firebase/app";
import { 
  getFirestore as getClientFirestore, 
  doc, 
  updateDoc as updateClientDoc, 
  getDoc as getClientDoc,
  serverTimestamp as clientServerTimestamp 
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

// Initialize Client SDK
const clientApp = initializeClientApp({
  ...firebaseConfig,
  // Ensure we use the correct database ID
  databaseURL: `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}`
});
const clientDB = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

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

  app.post("/api/payment/order", async (req, res) => {
    console.log("Order request received:", req.body);
    try {
      const { amount, currency = "INR" } = req.body;
      if (!amount) return res.status(400).json({ error: "Amount is required" });

      if (!process.env.VITE_RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: "Razorpay keys missing" });
      }

      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100), 
        currency,
        receipt: `receipt_${Date.now()}`,
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
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ status: "failure", message: "Rzp details missing from request" });
      }

      // Trim whitespace from secret just in case
      const secret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
      if (!secret || secret === "MISSING_KEY_SECRET") {
        console.error("RAZORPAY_KEY_SECRET is not correctly defined in environment");
        return res.status(500).json({ status: "failure", message: "Server error: RAZORPAY_KEY_SECRET not set in AI Studio Settings" });
      }

      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = crypto
        .createHmac("sha256", secret)
        .update(sign)
        .digest("hex");

      const isValid = razorpay_signature === expectedSign;
      console.log(`[Payment] Signature validation result: ${isValid}`);

      if (isValid) {
        // Double check user exists first to provide better error
        const userRef = doc(clientDB, "users", userId);
        const userDoc = await getClientDoc(userRef);
        
        if (!userDoc.exists()) {
          console.error(`[Payment] User document not found for ID: ${userId}`);
          return res.status(404).json({ status: "failure", message: "Verification failed: User record not found" });
        }

        // Update user status using Client SDK + Server Secret
        await updateClientDoc(userRef, {
          subscription: "PRO",
          payment_id: razorpay_payment_id,
          updated_at: clientServerTimestamp(),
          server_auth_secret: SERVER_AUTH_SECRET // This allows the update via rules
        });

        // Clean up the secret
        await updateClientDoc(userRef, {
          server_auth_secret: null
        });

        console.log(`[Payment] Successfully upgraded user ${userId} to PRO`);
        res.json({ status: "success" });
      } else {
        console.warn(`[Payment] Signature Mismatch!`);
        console.warn(`[Payment] Expected: ${expectedSign}`);
        console.warn(`[Payment] Received: ${razorpay_signature}`);
        res.status(400).json({ 
          status: "failure", 
          message: "Payment verification failed: Signature mismatch. Ensure your Key Secret in AI Studio Settings matches your Razorpay Dashboard." 
        });
      }
    } catch (error: any) {
      console.error("[Payment] Verification Critical Error:", error);
      res.status(500).json({ status: "failure", message: "Server error during verification: " + error.message });
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
