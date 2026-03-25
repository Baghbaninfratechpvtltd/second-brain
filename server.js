const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connect
mongoose.connect('mongodb+srv://ashuraza456_db_user:Ashu8648@second-brain.f1li8xg.mongodb.net/brain')
.then(()=>console.log("DB Connected"))
.catch(err=>console.log(err));

// Models
const User = mongoose.model('User', {
  email: String,
  password: String
});

const Note = mongoose.model('Note', {
  userId: String,
  title: String,
  body: String
});

// Test
app.get('/', (req,res)=>{
  res.send("Server running OK");
});

// Signup
app.post('/signup', async (req,res)=>{
  const user = await User.create(req.body);
  res.json(user);
});

// Login
app.post('/login', async (req,res)=>{
  const user = await User.findOne(req.body);
  res.json(user);
});

// Save Note
app.post('/notes', async (req,res)=>{
  const note = await Note.create(req.body);
  res.json(note);
});

// Get Notes
app.get('/notes/:userId', async (req,res)=>{
  const notes = await Note.find({userId:req.params.userId});
  res.json(notes);
});

// AI (temporary basic)
app.post('/chat', (req,res)=>{
  res.json({
    choices:[{message:{content:"AI working 👍"}}]
  });
});

// PORT FIX
app.listen(process.env.PORT || 3000, ()=>{
  console.log("Server started");
});
