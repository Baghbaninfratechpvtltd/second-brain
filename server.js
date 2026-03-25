const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// ✅ CORS FIX (VERY IMPORTANT)
app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE"],
  credentials: true
}));

app.use(express.json());

// ✅ MongoDB CONNECT
mongoose.connect('mongodb+srv://ashuraza456_db_user:Ashu8648@second-brain.f1li8xg.mongodb.net/brain')
.then(()=>console.log("DB Connected"))
.catch(err=>console.log("DB Error:", err));

// ✅ MODELS
const User = mongoose.model('User', {
  email: String,
  password: String
});

const Note = mongoose.model('Note', {
  userId: String,
  title: String,
  body: String
});

// ✅ TEST ROUTE
app.get('/', (req,res)=>{
  res.send("Server running OK");
});

// ✅ SIGNUP
app.post('/signup', async (req,res)=>{
  try{
    const user = await User.create(req.body);
    res.json(user);
  }catch(e){
    res.status(500).json({error:"Signup failed"});
  }
});

// ✅ LOGIN
app.post('/login', async (req,res)=>{
  try{
    const user = await User.findOne(req.body);
    res.json(user);
  }catch(e){
    res.status(500).json({error:"Login failed"});
  }
});

// ✅ SAVE NOTE
app.post('/notes', async (req,res)=>{
  try{
    const note = await Note.create(req.body);
    res.json(note);
  }catch(e){
    res.status(500).json({error:"Save failed"});
  }
});

// ✅ GET NOTES
app.get('/notes/:userId', async (req,res)=>{
  try{
    const notes = await Note.find({userId:req.params.userId});
    res.json(notes);
  }catch(e){
    res.status(500).json([]);
  }
});

// ✅ AI (basic working)
app.post('/chat', (req,res)=>{
  res.json({
    choices:[{message:{content:"AI working 👍"}}]
  });
});

// ✅ PORT FIX
const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log("Server started on " + PORT);
});
