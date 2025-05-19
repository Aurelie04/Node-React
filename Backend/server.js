const express = require("express");
const mysql = require("mysql");
const cors = require('cors');
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "reactnodedb"
});

app.get('/', (req, res) => {
    res.send('Server is running!'); 
});

app.post('/signup', async (req, res) => {
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  const sql = "INSERT INTO usertable (`name`, `phoneNumber`, `address`, `business`, `email`, `password`, `role`) VALUES (?, ?, ?, ?, ?, ?, ?)";
  const values = [
    req.body.name,
    req.body.phoneNumber,
    req.body.address,
    req.body.business,
    req.body.email,
    hashedPassword,
    req.body.role
  ];

  db.query(sql, values, (err, data) => {
    if (err) {
      console.error("Insert error:", err);  
      return res.status(500).json("Error inserting user");
    }
    return res.status(201).json({ message: "User registered successfully" });
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  console.log("Attempting login for:", email);

  const sql = "SELECT * FROM usertable WHERE email = ?";

  db.query(sql, [email], async (err, data) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json("Server error");
    }

    if (data.length === 0) {
      console.log("No user found for", email);
      return res.status(401).json("Invalid credentials");
    }

    const user = data[0];
    console.log("DB returned user:", user);

    
    console.log("Entered password:", password);
    console.log("Stored hash:", user.password);

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    console.log("Password match:", isPasswordCorrect);

    if (!isPasswordCorrect) {
      return res.status(401).json("Invalid credentials");
    }

    return res.json({
      message: "Login success",
      name: user.name,
      role: user.role
    });
  });
});



app.post("/forgot-password", (req, res) => {
  const { email } = req.body;
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 3600000); // expires in 1 hour

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
        resetLink
      });
    }
  );
});

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
          if (err) return res.status(500).json({ error: "Could not update password" });

          res.json({ message: "Password updated successfully" });
        }
      );
    }
  );
});

app.listen(8081, () => {
  console.log("Backend listening on port 8081");
});
