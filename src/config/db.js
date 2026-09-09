const mongoose = require("mongoose");

module.exports = async function connectDB() {
  mongoose.connection.on("connected", () => console.log("MongoDB connected"));
  mongoose.connection.on("error", (e) => console.error("MongoDB error:", e));
  await mongoose.connect(process.env.MONGO_URI);
};
