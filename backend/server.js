const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB (temporary, बाद में बदलेंगे)
mongoose.connect('mongodb://127.0.0.1:27017/brain');

// Schema
const User = mongoose.model('User', {
  email: String,
  password: String
});

const Note = mongoose.model('Note', {
  userId: String,
  title: String,
  body: String
});

// Login
app.post('/login', async (req,res)=>{
  const user = await User.findOne(req.body);
  res.json(user);
});

// Save note
app.post('/notes', async (req,res)=>{
  const note = await Note.create(req.body);
  res.json(note);
});

// Get notes
app.get('/notes/:userId', async (req,res)=>{
  const notes = await Note.find({userId:req.params.userId});
  res.json(notes);
});

app.listen(3000, ()=>console.log('Server running'));
