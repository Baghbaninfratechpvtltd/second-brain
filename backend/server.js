const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb+srv://ashuraza456_db_user:Ashu8648@second-brain.f1li8xg.mongodb.net/brain');

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

// 🧠 MEMORY AI CHAT
app.post('/chat', async (req,res)=>{
  try{

    // user notes fetch
    const notes = await Note.find({userId: req.body.userId});

    const context = notes.map(n=>`Title: ${n.title}, Body: ${n.body}`).join("\n");

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        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
      },
      body:JSON.stringify({
        model:'openrouter/free',
        messages:[
          {
            role:'system',
            content:`You are a powerful Second Brain AI.
You remember user notes and help in thinking, planning, and connecting ideas.

User Notes:
${context}`
          },
          {
            role:'user',
            content:req.body.msg
          }
        ]
      })
    });

    const data = await response.json();

    if(data.choices){
      return res.json(data);
    }

  }catch(e){}

  res.json({
    choices:[{message:{content:'Basic: '+req.body.msg}}]
  });

});

app.listen(3000);
