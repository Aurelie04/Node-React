const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});
const upload = multer({ storage });

// MySQL database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "reactnodedb",
});

// Root test route
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Signup route
app.post("/signup", async (req, res) => {
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  const sql =
    "INSERT INTO usertable (`name`, `phoneNumber`, `address`, `business`, `email`, `password`, `role`) VALUES (?, ?, ?, ?, ?, ?, ?)";
  const values = [
    req.body.name,
    req.body.phoneNumber,
    req.body.address,
    req.body.business,
    req.body.email,
    hashedPassword,
    req.body.role,
  ];

  db.query(sql, values, (err, data) => {
    if (err) {
      console.error("Insert error:", err);
      return res.status(500).json("Error inserting user");
    }
    return res.status(201).json({ message: "User registered successfully" });
  });
});

// Login route
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const sql = "SELECT * FROM usertable WHERE email = ?";

  db.query(sql, [email], async (err, data) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (data.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = data[0];
    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    return res.status(200).json({
      message: "Login success",
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        phoneNumber: user.phoneNumber,
        address: user.address,
        business: user.business,
        email: user.email,
      },
    });
  });
});

// Forgot password route
app.post("/forgot-password", (req, res) => {
  const { email } = req.body;
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 3600000); // 1 hour

  db.query(
    "UPDATE usertable SET reset_token = ?, reset_token_expires = ? WHERE email = ?",
    [token, expires, email],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Email not found" });

      const resetLink = `http://localhost:3000/reset-password/${token}`;
      res.json({
        message: "Password reset link (copy it):",
        resetLink,
      });
    }
  );
});

// Reset password route
app.post("/reset-password/:token", async (req, res) => {
  const token = req.params.token;
  const { newPassword } = req.body;

  db.query(
    "SELECT * FROM usertable WHERE reset_token = ? AND reset_token_expires > NOW()",
    [token],
    async (err, result) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (result.length === 0)
        return res.status(400).json({ message: "Invalid or expired token" });

      const email = result[0].email;
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      db.query(
        "UPDATE usertable SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE email = ?",
        [hashedPassword, email],
        (err, updateResult) => {
          if (err)
            return res
              .status(500)
              .json({ error: "Could not update password" });

          res.json({ message: "Password updated successfully" });
        }
      );
    }
  );
});

// Add product
app.post("/api/products", upload.single("image"), (req, res) => {
  const { name, description, price, userId } = req.body;
  const image = req.file.filename;

  const sql = `
    INSERT INTO products (name, description, price, image, userId)
    VALUES (?, ?, ?, ?, ?)
  `;
  const values = [name, description, price, image, userId];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error inserting product:", err);
      return res.status(500).json({ message: "Error adding product" });
    }

    res.status(201).json({
      id: result.insertId,
      name,
      description,
      price,
      image,
      userId,
      image_url: `http://localhost:8081/uploads/${image}`,
    });
  });
});

// Get user-specific products
// Get user-specific products
app.get("/api/products", (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ message: "Missing userId" });
  }

  const sql = `
    SELECT *, CONCAT('http://localhost:8081/uploads/', image) AS image_url 
    FROM products 
    WHERE userId = ?
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("Error fetching products:", err);
      return res.status(500).json({ message: "Error fetching products" });
    }

    res.json(results);
  });
});


// Delete product
app.delete("/api/products/:id", (req, res) => {
  const productId = req.params.id;

  db.query("SELECT image FROM products WHERE id = ?", [productId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const imageFilename = results[0].image;
    const imagePath = path.join(__dirname, "uploads", imageFilename);

    fs.unlink(imagePath, (fsErr) => {
      if (fsErr && fsErr.code !== "ENOENT") {
        console.error("Error deleting image file:", fsErr);
      }
    });

    db.query("DELETE FROM products WHERE id = ?", [productId], (delErr) => {
      if (delErr) {
        return res.status(500).json({ message: "Error deleting product" });
      }
      res.json({ message: "Product deleted successfully" });
    });
  });
});

// Get user profile by ID
app.get("/api/user/:id", (req, res) => {
  const userId = req.params.id;
  const sql = `
    SELECT id, name, phoneNumber AS phoneNumber, address, business 
    FROM usertable 
    WHERE id = ?
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (results.length === 0) return res.status(404).json({ message: "User not found" });
    res.json(results[0]);
  });
});

// Update user profile
app.put("/api/user/:id", (req, res) => {
  const { name, phoneNumber, address, business } = req.body;
  const { id } = req.params;

  const sql = `
    UPDATE usertable 
    SET name = ?, phoneNumber = ?, address = ?, business = ? 
    WHERE id = ?
  `;

  db.query(sql, [name, phoneNumber, address, business, id], (err, result) => {
    if (err) {
      console.error("Update error:", err);
      return res.status(500).json({ error: "Update failed" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ message: "User updated successfully" });
  });
});

// Start server
app.listen(8081, () => {
  console.log("Backend listening on port 8081");
});
