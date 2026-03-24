const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ MongoDB (तुम्हारा URL already set है)
mongoose.connect('mongodb+srv://ashuraza456_db_user:Ashu8648@second-brain.f1li8xg.mongodb.net/brain');

// 👤 User Schema
const User = mongoose.model('User', {
  email: String,
  password: String
});

// 🧠 Notes Schema
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

// 🤖 AI CHAT (FREE + fallback)
app.post('/chat', async (req,res)=>{

  try{
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        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
      },
      body:JSON.stringify({
        model:'openrouter/free',
        messages:[{role:'user',content:req.body.msg}]
      })
    });

    const data = await r.json();

    if(data.choices){
      return res.json(data);
    }

  }catch(e){}

  // fallback
  return res.json({
    choices:[{message:{content:'Basic answer: '+req.body.msg}}]
  });

});

app.listen(3000, ()=>console.log('Server running'));
