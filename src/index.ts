import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import customerRouter from "./routes/customer.route";
import addressRouter from "./routes/address.route";
import wishlistRouter from "./routes/wishlist.route";
import preferencesRouter from "./routes/preferences.route";
import gdprRouter from "./routes/gdpr.route";
import segmentRouter from "./routes/segment.route";
import historyRouter from "./routes/history.route";
import consentRouter from "./routes/consent.route";
import notesRouter from "./routes/notes.route";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3002", "http://localhost:3003"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Health check
app.get("/health", (req: Request, res: Response) => {
  return res.status(200).json({
    status: "ok",
    service: "customer-service",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Routes
app.use("/customers", customerRouter);
app.use("/addresses", addressRouter);
app.use("/wishlists", wishlistRouter);
app.use("/preferences", preferencesRouter);
app.use("/gdpr", gdprRouter);
app.use("/segments", segmentRouter);
app.use("/history", historyRouter);
app.use("/consent", consentRouter);
app.use("/notes", notesRouter);

// Error handler
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof Error) {
    console.error("Error:", {
      message: err.message,
      stack: err.stack,
    });

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: process.env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err.message,
      },
    });
  }

  console.error("Unknown error:", err);
  return res.status(500).json({
    success: false,
    error: {
      code: "UNKNOWN_ERROR",
      message: "An unexpected error occurred",
    },
  });
});

const PORT = process.env.PORT || 3005;

const start = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`🚀 Customer service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start customer service:", error);
    process.exit(1);
  }
};

start();

export default app;
