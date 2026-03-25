const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();

app.use(cors({
  origin: "*"
}));

app.use(express.json());

// MongoDB
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
  try{
    const user = await User.create(req.body);
    res.json(user);
  }catch{
    res.json({error:"Signup failed"});
  }
});

// Login
app.post('/login', async (req,res)=>{
  try{
    const user = await User.findOne(req.body);
    res.json(user);
  }catch{
    res.json({error:"Login failed"});
  }
});

// Notes
app.post('/notes', async (req,res)=>{
  try{
    const note = await Note.create(req.body);
    res.json(note);
  }catch{
    res.json({error:"Save failed"});
  }
});

app.get('/notes/:userId', async (req,res)=>{
  try{
    const notes = await Note.find({userId:req.params.userId});
    res.json(notes);
  }catch{
    res.json([]);
  }
});

// AI (FREE WORKING)
app.post('/chat', async (req,res)=>{
  try{
    const { msg } = req.body;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{
        "Authorization":"Bearer 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",
        "Content-Type":"application/json",
        "HTTP-Referer":"https://second-brain-lovat-seven.vercel.app/",
        "X-Title":"SecondBrainAI"
      },
      body:JSON.stringify({
        model:"mistralai/mistral-7b-instruct:free",
        messages:[{role:"user",content:msg}]
      })
    });

    const data = await response.json();

    res.json({
      choices:[{
        message:{
          content: data?.choices?.[0]?.message?.content || "No response"
        }
      }]
    });

  }catch(e){
    res.json({
      choices:[{message:{content:"AI error"}}]
    });
  }
});

// PORT
app.listen(process.env.PORT || 3000);
