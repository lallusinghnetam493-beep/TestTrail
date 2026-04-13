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
      if (!userId) return res.status(400).json({ error: "User ID missing" });

      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(sign.toString())
        .digest("hex");

      console.log("Verification Details:", {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        receivedSign: razorpay_signature,
        expectedSign: expectedSign
      });

      if (razorpay_signature === expectedSign) {
        // Fetch order details to get amount
        const orderDetails = await razorpay.orders.fetch(razorpay_order_id);
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        // Update user status
        await firestore.collection("users").doc(userId).update({
          subscription: "PRO",
          razorpayPaymentId: razorpay_payment_id,
          subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create payment record
        await firestore.collection("payments").add({
          userId,
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          amount: (orderDetails.amount as number) / 100, // Convert from paise
          currency: orderDetails.currency,
          status: "captured",
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ status: "success", expiresAt: expiresAt.getTime() });
      } else {
        res.status(400).json({ status: "failure" });
      }
    } catch (error: any) {
      console.error("Razorpay Verification Error:", error);
      res.status(500).json({ error: error.message });
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
