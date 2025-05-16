const express = require("express");
const mysql = require("mysql");
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "reactnodedb"
})

app.get('/', (req, res) => {
    res.send('Server is running!'); 
});

app.post('/signup', (req, res) => {
  console.log("Received POST /signup:", req.body);

  const sql = "INSERT INTO usertable (`name`, `phoneNumber`, `address`, `business`, `email`, `password`, `role`) VALUES (?, ?, ?, ?, ?, ?, ?)";
  const values = [
    req.body.name,
    req.body.phoneNumber,
    req.body.address,
    req.body.business,
    req.body.email,
    req.body.password,
    req.body.role
  ];

  db.query(sql, values, (err, data) => {
    if (err) {
      console.error("Insert error:", err);  // This will now show the real DB error
      return res.status(500).json("Error inserting user");
    }
    return res.status(201).json({ message: "User registered successfully" });
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const sql = "SELECT * FROM usertable WHERE email = ? AND password = ?";
  db.query(sql, [email, password], (err, data) => {
    if (err) {
      console.error("Login query error:", err);
      return res.status(500).json("Server error");
    }
    if (data.length > 0) {
      const user = data[0];
      return res.json({
        message: "Login success",
        name: user.name,
        role: user.role
      });
    } else {
      return res.status(401).json("Invalid credentials");
    }
  });
});



app.listen(8081, () => {
    console.log("Backend listening on port 8081");
})