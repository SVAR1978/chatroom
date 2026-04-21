const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { port } = require("./config");
const { uploadRouter } = require("./routes/upload.routes");
const { HttpError } = require("./utils/httpError");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api", uploadRouter);
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use((err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;
  const payload = {
    error: err.message || "Internal server error",
  };

  if (err.details) {
    payload.details = err.details;
  }

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json(payload);
});

app.listen(port, () => {
  
  console.log(`imdio server running on http://localhost:${port}`);
});
