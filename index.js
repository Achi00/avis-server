require("dotenv").config();
const cors = require("cors");
const express = require("express");
const mysql = require("mysql2");
const EventEmitter = require("events");

const app = express();
const port = 8080;

const userUpdateEmitter = new EventEmitter();

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// Log for debugging purposes, but ensure sensitive info isn't logged
console.log("Connected to database:", process.env.DB_NAME);

app.get("/users", (req, res) => {
  pool.query("SELECT * FROM random_names_with_id", (error, results) => {
    // Updated table name
    if (error) {
      console.error("Error fetching users:", error);
      return res.status(500).send("An error occurred while fetching users.");
    }
    res.json(results);
  });
});

app.post("/update-user-value", (req, res) => {
  const { name, division, location, value } = req.body; // Assuming these are the fields you want to insert
  pool.query(
    "INSERT INTO random_names_with_id (name, division, location, value) VALUES (?, ?, ?, ?)", // Updated table name and columns
    [name, division, location, value],
    (error, results) => {
      if (error) {
        console.error("Error adding new user:", error);
        return res
          .status(500)
          .send("An error occurred while adding a new user.");
      }
      res.status(201).json({ id: results.insertId });
    }
  );
});

app.get("/search-users", (req, res) => {
  const { searchTerm } = req.query;

  if (!searchTerm) {
    return res.status(400).send("A search term is required.");
  }

  const sql =
    "SELECT id, name, division, location, value FROM random_names_with_id WHERE name LIKE ?";
  const likeTerm = `%${searchTerm}%`;

  pool.query(sql, [likeTerm], (error, results) => {
    if (error) {
      console.error("Error searching for users:", error);
      return res
        .status(500)
        .send("An error occurred while searching for users.");
    }
    res.json(results);
  });
});

// This route expects to receive the user's ID and the chosen interest
// app.post("/update-interest", (req, res) => {
//   const { id, value } = req.body; // Use 'id' to identify the user and 'value' for the new interest

//   if (!id || !value) {
//     return res.status(400).send("User ID and interest are required.");
//   }

//   const sql = "UPDATE random_names_with_id SET value = ? WHERE id = ?"; // Use 'id' to identify the record

//   pool.query(sql, [value, id], (error, results) => {
//     // Ensure the parameters are in the correct order
//     if (error) {
//       console.error("Error updating user interest:", error);
//       return res
//         .status(500)
//         .send("An error occurred while updating user interest.");
//     }

//     if (results.affectedRows === 0) {
//       return res.status(404).send("User not found.");
//     }

//     res.status(200).send("Interest updated successfully.");
//   });
// });

// update value in database
app.patch("/users/:id", (req, res) => {
  const { id } = req.params;
  const { value } = req.body;

  if (!value) {
    return res.status(400).send("Interest value is required.");
  }

  const sql = "UPDATE random_names_with_id SET value = ? WHERE id = ?";
  pool.query(sql, [value, id], (error, results) => {
    if (error) {
      console.error("Error updating user interest:", error);
      return res
        .status(500)
        .send("An error occurred while updating user interest.");
    }

    if (results.affectedRows === 0) {
      return res.status(404).send("User not found.");
    }

    // Emit an event indicating that user data has been updated
    userUpdateEmitter.emit("update");

    res.status(200).send("Interest updated successfully.");
  });
});

// SSE endpoint to listen for updates
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendHeartbeat = () => res.write(": ping\n\n");
  const heartbeatInterval = setInterval(sendHeartbeat, 15000);

  const sendUpdate = () => res.write("data: update\n\n");
  userUpdateEmitter.on("update", sendUpdate);

  req.on("close", () => {
    clearInterval(heartbeatInterval);
    userUpdateEmitter.removeListener("update", sendUpdate);
  });
});

// users who choose value
app.get("/users-with-interest", (req, res) => {
  const sql = "SELECT * FROM random_names_with_id WHERE value IS NOT NULL";

  pool.query(sql, (error, results) => {
    if (error) {
      console.error("Error fetching users with interests:", error);
      return res
        .status(500)
        .send("An error occurred while fetching users with interests.");
    }

    res.json(results);
  });
});
