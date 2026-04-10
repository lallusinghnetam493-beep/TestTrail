import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import Razorpay from "razorpay";
import crypto from "crypto";
import fs from "fs";

// Load firebase config for server-side use if needed
const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));

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
        amount: Math.round(amount * 100), // amount in the smallest currency unit
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
        razorpay_signature 
      } = req.body;

      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
        .update(sign.toString())
        .digest("hex");

      if (razorpay_signature === expectedSign) {
        // Payment verified
        res.json({ status: "success", message: "Payment verified successfully" });
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
