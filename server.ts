import express from "express";
import path from "path";
import cors from "cors";
import Razorpay from "razorpay";
import crypto from "crypto";
import fs from "fs";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

// Load firebase config
let firebaseConfig: any = {};
try {
  firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
} catch (err) {
  console.error("Error loading firebase-applet-config.json:", err);
}

// Initialize Firebase Admin
let firestore: any;
if (firebaseConfig.projectId) {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
  // Use the named database if provided
  if (firebaseConfig.firestoreDatabaseId) {
    firestore = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
  } else {
    firestore = getFirestore();
  }
} else {
  console.error("Firebase Project ID missing.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Log all API requests for debugging
  app.use("/api", (req, res, next) => {
    console.log(`API Request: ${req.method} ${req.url}`);
    next();
  });

  const razorpay = new Razorpay({
    key_id: process.env.VITE_RAZORPAY_KEY_ID || "MISSING_KEY_ID",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "MISSING_KEY_SECRET",
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Create Razorpay Order
  app.post("/api/payment/order", async (req, res) => {
    try {
      const { amount, currency = "INR" } = req.body;
      
      if (!amount) {
        return res.status(400).json({ error: "Amount is required" });
      }

      if (process.env.VITE_RAZORPAY_KEY_ID === undefined || process.env.RAZORPAY_KEY_SECRET === undefined) {
        return res.status(500).json({ 
          error: "Razorpay API keys are not configured in environment variables.",
          details: "Please add VITE_RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your environment."
        });
      }

      const options = {
        amount: Math.round(amount * 100), 
        currency,
        receipt: `receipt_${Date.now()}`,
      };

      const order = await razorpay.orders.create(options);
      res.json(order);
    } catch (error: any) {
      console.error("Razorpay Order Error:", error);
      res.status(500).json({ 
        error: "Failed to create Razorpay order", 
        details: error.message || String(error) 
      });
    }
  });

  // Verify Razorpay Payment
  app.post("/api/payment/verify", async (req, res) => {
    try {
      const { 
        razorpay_order_id, 
        razorpay_payment_id, 
        razorpay_signature,
        userId
      } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      if (!process.env.RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: "Razorpay Key Secret is missing" });
      }

      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest("hex");

      if (razorpay_signature === expectedSign) {
        await firestore.collection("users").doc(userId).update({
          subscription: "PRO",
          lastPaymentId: razorpay_payment_id,
          lastOrderId: razorpay_order_id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ status: "success", message: "Payment verified and subscription updated" });
      } else {
        res.status(400).json({ status: "failure", message: "Invalid signature" });
      }
    } catch (error: any) {
      console.error("Razorpay Verification Error:", error);
      res.status(500).json({ 
        error: "Internal server error during verification",
        details: error.message || String(error)
      });
    }
  });

  // API 404 Handler - MUST be before Vite middleware
  app.use("/api/*any", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*any', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
