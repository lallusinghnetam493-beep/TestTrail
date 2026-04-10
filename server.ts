import express from "express";
import path from "path";
import cors from "cors";
import Razorpay from "razorpay";
import crypto from "crypto";
import fs from "fs";
import admin from "firebase-admin";

// Load firebase config
let firebaseConfig: any = {};
try {
  firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
} catch (err) {
  console.error("Error loading firebase-applet-config.json:", err);
}

// Initialize Firebase Admin
if (!admin.apps.length && firebaseConfig.projectId) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const firestore = admin.firestore();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  const razorpay = new Razorpay({
    key_id: process.env.VITE_RAZORPAY_KEY_ID || "",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "",
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

      const options = {
        amount: Math.round(amount * 100), 
        currency,
        receipt: `receipt_${Date.now()}`,
      };

      const order = await razorpay.orders.create(options);
      res.json(order);
    } catch (error) {
      console.error("Razorpay Order Error:", error);
      res.status(500).json({ error: "Failed to create order" });
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

      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
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
    } catch (error) {
      console.error("Razorpay Verification Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
