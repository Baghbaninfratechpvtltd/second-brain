const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// ✅ fetch fix
global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();

// ✅ CORS FIX
app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE"],
  credentials: true
}));

app.use(express.json());

// ✅ MongoDB connect
mongoose.connect('mongodb+srv://ashuraza456_db_user:Ashu8648@second-brain.f1li8xg.mongodb.net/brain')
.then(()=>console.log("DB Connected"))
.catch(err=>console.log("DB Error:", err));

// ✅ Models
const User = mongoose.model('User', {
  email: String,
  password: String
});

const Note = mongoose.model('Note', {
  userId: String,
  title: String,
  body: String
});

// ✅ Test route
app.get('/', (req,res)=>{
  res.send("Server running OK");
});

// ✅ Signup
app.post('/signup', async (req,res)=>{
  try{
    const user = await User.create(req.body);
    res.json(user);
  }catch(e){
    res.status(500).json({error:"Signup failed"});
  }
});

// ✅ Login
app.post('/login', async (req,res)=>{
  try{
    const user = await User.findOne(req.body);
    res.json(user);
  }catch(e){
    res.status(500).json({error:"Login failed"});
  }
});

// ✅ Save Note
app.post('/notes', async (req,res)=>{
  try{
    const note = await Note.create(req.body);
    res.json(note);
  }catch(e){
    res.status(500).json({error:"Save failed"});
  }
});

// ✅ Get Notes
app.get('/notes/:userId', async (req,res)=>{
  try{
    const notes = await Note.find({userId:req.params.userId});
    res.json(notes);
  }catch(e){
    res.status(500).json([]);
  }
});

// ✅ 🤖 REAL AI (OpenRouter)
app.post('/chat', async (req,res)=>{
  try{
    const { msg } = req.body;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{
        "Authorization":"Bearer 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",
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:"openai/gpt-3.5-turbo",
        messages:[{role:"user",content:msg}]
      })
    });

    const data = await response.json();
    res.json(data);

  }catch(e){
    res.json({
      choices:[{message:{content:"AI error"}}]
    });
  }
});

// ✅ PORT
const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log("Server started on " + PORT);
});
