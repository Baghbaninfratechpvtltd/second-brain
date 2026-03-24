const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ MongoDB
mongoose.connect('mongodb+srv://ashuraza456_db_user:Ashu8648@second-brain.f1li8xg.mongodb.net/brain');

// 👤 User
const User = mongoose.model('User', {
  email: String,
  password: String
});

// 🧠 Notes
const Note = mongoose.model('Note', {
  userId: String,
  title: String,
  body: String
});

// 🔐 Signup
app.post('/signup', async (req,res)=>{
  const user = await User.create(req.body);
  res.json(user);
});

// 🔐 Login
app.post('/login', async (req,res)=>{
  const user = await User.findOne(req.body);
  res.json(user);
});

// 📝 Save Note
app.post('/notes', async (req,res)=>{
  const note = await Note.create(req.body);
  res.json(note);
});

// 📥 Get Notes
app.get('/notes/:userId', async (req,res)=>{
  const notes = await Note.find({userId:req.params.userId});
  res.json(notes);
});

// 🤖 AI CHAT
app.post('/chat', async (req,res)=>{
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':'Bearer YOUR_API_KEY'
    },
    body:JSON.stringify({
      model:'openai/gpt-3.5-turbo',
      messages:[{role:'user',content:req.body.msg}]
    })
  });

  const data = await response.json();
  res.json(data);
});

app.listen(3000, ()=>console.log('Server running'));
